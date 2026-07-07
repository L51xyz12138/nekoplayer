import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const DEV_URL = 'http://localhost:5173'
// mpv 配置目录：开发时在 electron/mpv，打包后解包到 resources/mpv（asar 外，外部进程才读得到）
const MPV_CONFIG_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'mpv')
  : path.join(__dirname, 'mpv')

let mpvProc = null
let mainWin = null

// 软件自带的 mpv 可执行路径（CI 打包时下载到 electron/mpv 内；打包后在 resources/mpv）
function bundledMpv() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'mpv')
    : path.join(__dirname, 'mpv')
  if (process.platform === 'win32') return path.join(base, 'bin', 'mpv.exe')
  if (process.platform === 'darwin') return path.join(base, 'mpv.app', 'Contents', 'MacOS', 'mpv')
  return path.join(base, 'bin', 'mpv')
}

// 定位 mpv 可执行文件：自定义 > 软件自带 > 系统安装 > PATH
function resolveMpv(customPath) {
  if (customPath && existsSync(customPath)) return customPath
  // 软件自带的 mpv（开箱即用，用户无需自行安装）
  const bundled = bundledMpv()
  if (existsSync(bundled)) return bundled
  // 系统常见安装路径
  const candidates =
    process.platform === 'darwin'
      ? ['/opt/homebrew/bin/mpv', '/usr/local/bin/mpv']
      : process.platform === 'linux'
        ? ['/usr/bin/mpv', '/usr/local/bin/mpv']
        : []
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return process.platform === 'win32' ? 'mpv.exe' : 'mpv'
}

// 通过 mpv IPC 跟踪播放位置，退出时把进度回传给 Emby（外部播放器无法自己上报）
function trackMpvProgress(socketPath, emby) {
  let lastPos = 0
  let attempts = 0
  const connect = () => {
    const sock = net.connect(socketPath)
    sock.on('connect', () => {
      console.log('[mpv] IPC 已连接')
      const timer = setInterval(() => {
        try {
          sock.write(JSON.stringify({ command: ['get_property', 'time-pos'] }) + '\n')
        } catch {
          /* ignore */
        }
        if (lastPos > 0) reportMpvProgress(emby, lastPos)
      }, 3000)
      let buf = ''
      sock.on('data', (chunk) => {
        buf += chunk.toString()
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i)
          buf = buf.slice(i + 1)
          try {
            const msg = JSON.parse(line)
            if (msg.error === 'success' && typeof msg.data === 'number') lastPos = msg.data
          } catch {
            /* ignore */
          }
        }
      })
      sock.on('close', () => {
        clearInterval(timer)
        reportMpvStopped(emby, lastPos)
        // 延迟一下等 Emby 处理完 Stopped，再通知前端刷新，拉到最新进度
        setTimeout(() => {
          if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('playback-ended')
        }, 1000)
      })
    })
    sock.on('error', (e) => {
      if (++attempts < 20) setTimeout(connect, 400)
      else console.error('[mpv] IPC 连不上：', e.message)
    })
  }
  connect()
}

async function reportMpvStopped(emby, posSeconds) {
  console.log('[mpv] 退出，回传进度：', Math.round(posSeconds), '秒 itemId=', emby?.itemId)
  if (!emby || !emby.serverUrl || !emby.token || !emby.itemId || posSeconds <= 0) return
  try {
    // authHeader 带上与开始播放一致的 DeviceId，Emby 才能把进度更新到同一会话
    const res = await fetch(`${emby.serverUrl}/Sessions/Playing/Stopped`, {
      method: 'POST',
      headers: {
        'X-Emby-Authorization': `MediaBrowser Client="NekoPlayer", Device="NekoPlayer", DeviceId="${emby.deviceId || ''}", Version="0.1.1", Token="${emby.token}"`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ItemId: emby.itemId,
        PositionTicks: Math.round(posSeconds * 10_000_000),
        PlaySessionId: emby.playSessionId || ''
      })
    })
    console.log('[mpv] 停止回传响应：', res.status)
  } catch (err) {
    console.error('[mpv] 进度回传失败：', err.message)
  }
}

// 播放中定期上报进度（很多 Emby 靠 Progress 而非 Stopped 更新 UserData 进度）
async function reportMpvProgress(emby, posSeconds) {
  if (!emby || !emby.serverUrl || !emby.token || !emby.itemId || posSeconds <= 0) return
  try {
    await fetch(`${emby.serverUrl}/Sessions/Playing/Progress`, {
      method: 'POST',
      headers: {
        'X-Emby-Authorization': `MediaBrowser Client="NekoPlayer", Device="NekoPlayer", DeviceId="${emby.deviceId || ''}", Version="0.1.1", Token="${emby.token}"`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ItemId: emby.itemId,
        PositionTicks: Math.round(posSeconds * 10_000_000),
        PlaySessionId: emby.playSessionId || '',
        IsPaused: false,
        EventName: 'timeupdate'
      })
    })
  } catch {
    /* ignore */
  }
}

// 渲染进程请求用 mpv 播放（items: [{ url, title }]）
ipcMain.handle('play-mpv', (_e, payload) => {
  const { items, title, startIndex, mpvPath, startSec, emby } = payload || {}
  const list = Array.isArray(items) ? items : []
  if (!list.length) return false

  if (mpvProc) {
    try {
      mpvProc.kill()
    } catch {
      /* ignore */
    }
    mpvProc = null
  }

  // IPC socket：运行时读取播放进度，退出时回传 Emby
  const ipcSocket =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\nekompv${Date.now()}`
      : path.join(tmpdir(), `nekompv-${Date.now()}.sock`)

  const args = [
    `--title=${title || 'NekoPlayer'}`,
    '--force-window=yes',
    '--keep-open=no',
    '--hwdec=auto',
    '--autofit-larger=90%x90%',
    '--geometry=50%:50%',
    `--config-dir=${MPV_CONFIG_DIR}`,
    `--input-ipc-server=${ipcSocket}`
  ]
  // 从上次进度续播
  if (typeof startSec === 'number' && startSec > 0) args.push(`--start=${startSec}`)

  let target
  if (list.length === 1) {
    target = list[0].url
    if (list[0].title) args.push(`--force-media-title=${list[0].title}`)
  } else {
    // 多集：生成 M3U 播放列表（带集标题），避免 uosc 里显示一长串 URL
    const lines = ['#EXTM3U']
    for (const it of list) {
      lines.push(`#EXTINF:-1,${(it.title || '').replace(/[\r\n]+/g, ' ')}`)
      lines.push(it.url)
    }
    const m3uPath = path.join(tmpdir(), `nekoplayer-${Date.now()}.m3u8`)
    writeFileSync(m3uPath, lines.join('\n'), 'utf-8')
    target = m3uPath
    // 从当前集开始播放（前面的集仍在列表里可往前跳）
    if (typeof startIndex === 'number' && startIndex > 0) {
      args.push(`--playlist-start=${startIndex}`)
    }
  }

  const mpv = resolveMpv(mpvPath)
  try {
    const proc = spawn(mpv, [target, ...args], { stdio: 'ignore', detached: true })
    proc.unref()
    mpvProc = proc
    // 仅当退出的确实是当前进程时才清空引用，避免旧进程的 exit 回调误清掉新进程
    proc.on('error', (err) => {
      console.error('[mpv] 启动失败：', err.message)
      if (mpvProc === proc) mpvProc = null
    })
    proc.on('exit', () => {
      if (mpvProc === proc) mpvProc = null
    })
    if (emby) {
      console.log('[mpv] 启用进度跟踪，socket=', ipcSocket, 'itemId=', emby.itemId)
      trackMpvProgress(ipcSocket, emby)
    } else {
      console.log('[mpv] 未收到 emby 信息，跳过进度跟踪')
    }
    return true
  } catch (err) {
    console.error('[mpv] spawn 异常：', err)
    mpvProc = null
    return false
  }
})

// 唤起系统外部播放器（各平台，支持自定义程序路径）
function openExternal(player, url, customPath, startSec) {
  const seek = typeof startSec === 'number' && startSec > 0 ? startSec : 0
  try {
    if (process.platform === 'darwin') {
      const appMap = { iina: 'IINA', vlc: 'VLC', infuse: 'Infuse' }
      if (customPath) {
        // IINA：用 .app 内的 iina-cli 精确调用（可传 --mpv-start 续播），绕过 LaunchServices
        if (player === 'iina') {
          const cli = path.join(customPath, 'Contents/MacOS/iina-cli')
          if (existsSync(cli)) {
            spawn(cli, seek ? [`--mpv-start=${seek}`, url] : [url], { stdio: 'ignore' })
            return true
          }
        }
        spawn('open', ['-a', customPath, url], { stdio: 'ignore' })
        return true
      }
      spawn('open', ['-a', appMap[player] || player, url], { stdio: 'ignore' })
      return true
    }
    if (process.platform === 'win32' && player === 'potplayer') {
      const candidates = [
        customPath,
        'C:/Program Files/DAUM/PotPlayer/PotPlayerMini64.exe',
        'C:/Program Files (x86)/DAUM/PotPlayer/PotPlayerMini.exe'
      ].filter(Boolean)
      const bin = candidates.find((p) => existsSync(p)) || 'potplayer'
      spawn(bin, seek ? [url, `/seek=${seek}`] : [url], { stdio: 'ignore' })
      return true
    }
    if (process.platform === 'linux' && player === 'vlc') {
      const bin = customPath && existsSync(customPath) ? customPath : 'vlc'
      spawn(bin, seek ? [`--start-time=${seek}`, url] : [url], { stdio: 'ignore' })
      return true
    }
    // 兜底：交给系统默认程序打开
    const opener =
      process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    spawn(opener, [url], { stdio: 'ignore', shell: process.platform === 'win32' })
    return true
  } catch (err) {
    console.error('[external] 启动失败：', err)
    return false
  }
}

ipcMain.handle('play-external', (_e, payload) => {
  const { player, url, appPath, startSec } = payload || {}
  if (!url) return false
  return openExternal(player, url, appPath, startSec)
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0c11',
    title: 'NekoPlayer',
    autoHideMenuBar: true,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (isDev) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWin = win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  if (mpvProc) {
    try {
      mpvProc.kill()
    } catch {
      /* ignore */
    }
  }
})
