import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir, networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dgram from 'node:dgram'
import { createClient } from 'webdav'

// 可播放的视频扩展名（本机/文件浏览类源用）
const VIDEO_EXT = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts',
  '.mpg', '.mpeg', '.rmvb', '.rm', '.3gp', '.vob', '.ogv', '.divx', '.f4v', '.mts'
])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const DEV_URL = 'http://localhost:5173'
// mpv 配置目录：开发时在 electron/mpv，打包后解包到 resources/mpv（asar 外，外部进程才读得到）
const MPV_CONFIG_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'mpv')
  : path.join(__dirname, 'mpv')

let mpvProc = null
let mainWin = null

// ---------- 持久化存储（文件版，跨软件更新不丢；替代 file:// 下不可靠的 localStorage）----------
const STORE_FILE = path.join(app.getPath('userData'), 'neko-store.json')
let persistStore = {}
try {
  if (existsSync(STORE_FILE)) persistStore = JSON.parse(readFileSync(STORE_FILE, 'utf-8'))
} catch {
  persistStore = {}
}
let storeWriteTimer = null
function flushStore() {
  if (storeWriteTimer) {
    clearTimeout(storeWriteTimer)
    storeWriteTimer = null
  }
  try {
    // 原子写：先写临时文件再 rename 覆盖，避免写一半被更新器强杀导致 json 损坏、整份存储丢失
    const tmp = STORE_FILE + '.tmp'
    writeFileSync(tmp, JSON.stringify(persistStore))
    renameSync(tmp, STORE_FILE)
  } catch (e) {
    console.error('[store] 写入失败：', e.message)
  }
}
function scheduleFlush() {
  if (storeWriteTimer) clearTimeout(storeWriteTimer)
  storeWriteTimer = setTimeout(flushStore, 150) // 合并连续写入，减少磁盘 IO
}
// 媒体源/设置是关键小数据、变更也少 → 立即落盘（写在主进程，不阻塞渲染进程输入），
// 避免「刚加了源/填了 Key，还没到去抖时间就被软件更新器强杀」导致丢失。大而频繁的库缓存仍走去抖。
const IMMEDIATE_KEYS = new Set(['neko-sources', 'neko-settings'])
ipcMain.on('store-get', (e, key) => {
  e.returnValue = persistStore[key] ?? null
})
ipcMain.on('store-set', (_e, { key, val }) => {
  persistStore[key] = val
  if (IMMEDIATE_KEYS.has(key)) flushStore()
  else scheduleFlush()
})
ipcMain.on('store-remove', (_e, key) => {
  delete persistStore[key]
  scheduleFlush()
})

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
          if (mainWin && !mainWin.isDestroyed())
            mainWin.webContents.send('playback-ended', emby?.itemId)
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

// Emby/Jellyfin 鉴权头：两个都发，兼容 Emby(X-Emby-Authorization) 与 Jellyfin 10.8+(Authorization)
function embyAuthHeaders(emby) {
  const v = `MediaBrowser Client="NekoPlayer", Device="NekoPlayer", DeviceId="${emby.deviceId || ''}", Version="0.1.1", Token="${emby.token}"`
  return { 'X-Emby-Authorization': v, Authorization: v, 'Content-Type': 'application/json' }
}

async function reportMpvStopped(emby, posSeconds) {
  console.log('[mpv] 退出，回传进度：', Math.round(posSeconds), '秒 itemId=', emby?.itemId)
  if (!emby || !emby.serverUrl || !emby.token || !emby.itemId || posSeconds <= 0) return
  try {
    // authHeader 带上与开始播放一致的 DeviceId，Emby 才能把进度更新到同一会话
    const res = await fetch(`${emby.serverUrl}/Sessions/Playing/Stopped`, {
      method: 'POST',
      headers: embyAuthHeaders(emby),
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
      headers: embyAuthHeaders(emby),
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

// 播放设置 → mpv 参数（音轨/字幕语言、字幕外观、硬解、倍速、跳章节）
function mpvSettingArgs() {
  let s = {}
  try {
    s = JSON.parse(persistStore['neko-settings'] || '{}')
  } catch {
    /* ignore */
  }
  const args = []
  const alang = { 中文: 'chi,zh,zho,chs', 日文: 'jpn,jp', 英文: 'eng,en' }[s.audioLang]
  if (alang) args.push(`--alang=${alang}`)
  if (s.subLang === '关闭') args.push('--sid=no')
  else {
    const slang = { 中文: 'chi,zh,chs,sc,zho,cht', 英文: 'eng,en' }[s.subLang]
    if (slang) args.push(`--slang=${slang}`)
  }
  const size = { 小: 44, 中: 55, 大: 72 }[s.subSize]
  if (size) args.push(`--sub-font-size=${size}`)
  if (s.subColor) args.push(`--sub-color=${s.subColor}`)
  if (s.subOutline === false) args.push('--sub-border-size=0')
  if (s.hwdecode === false) args.push('--hwdec=no')
  if (s.rate && Number(s.rate) !== 1) args.push(`--speed=${s.rate}`)
  // 用 -append 避免覆盖 mpv.conf / uosc 等已有的 script-opts
  if (s.skipIntro) args.push('--script-opts-append=skipchapters-enabled=yes')
  return args
}

// 渲染进程请求用 mpv 播放（items: [{ url, title }]）
ipcMain.handle('play-mpv', (_e, payload) => {
  const { items, title, startIndex, mpvPath, startSec, emby, tracks } = payload || {}
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

  // 指定平台专属硬解码器：hwdec=auto 会逐一探测各 GPU 后端，实测拖慢启动 ~0.7s+；给准确值直接省掉探测
  const hwdec =
    process.platform === 'darwin'
      ? 'videotoolbox'
      : process.platform === 'win32'
        ? 'd3d11va'
        : 'auto-safe'
  // 用户指定了自己的 mpv（存在）→ **完全尊重他自己的配置**（uosc/界面/滤镜/硬解/窗口都由他的 config 决定），
  // 只塞软件必需的参数（进度同步 socket、放完自动关窗、续播、预选轨道），不覆盖他的播放界面。
  // 只有用软件自带的 mpv 时才给全套默认（自带 uosc 配置 + 平台硬解 + 立即建窗 + 窗口大小）。
  const customMpv = !!(mpvPath && existsSync(mpvPath))
  const args = customMpv
    ? [
        `--title=${title || 'NekoPlayer'}`,
        '--keep-open=no', // 放完自动关窗——软件靠 mpv 退出来回传进度/刷新，必须保留
        `--input-ipc-server=${ipcSocket}`,
        ...mpvSettingArgs()
      ]
    : [
        `--title=${title || 'NekoPlayer'}`,
        // immediate：mpv 一启动就立刻建窗（不必等打开文件/连上网络流），网络流下「窗口迟迟不弹」明显改善
        '--force-window=immediate',
        '--keep-open=no',
        `--hwdec=${hwdec}`,
        '--autofit-larger=90%x90%',
        '--geometry=50%:50%',
        `--config-dir=${MPV_CONFIG_DIR}`,
        `--input-ipc-server=${ipcSocket}`,
        // macOS 显示原生标题栏（红绿灯在左上角）；mpv.conf 的 border=no 只适合 win/linux 的 uosc 无边框风格
        ...(process.platform === 'darwin' ? ['--border=yes'] : []),
        // 音轨/字幕/跳章节等按设置（放在默认项之后，同名参数后者覆盖）
        ...mpvSettingArgs()
      ]
  // 从上次进度续播
  if (typeof startSec === 'number' && startSec > 0) args.push(`--start=${startSec}`)
  // 详情页预选的音轨/字幕（覆盖设置里的语言偏好，故放最后）
  if (tracks) {
    if (typeof tracks.aid === 'number') args.push(`--aid=${tracks.aid}`)
    if (tracks.sid === 'no') args.push('--sid=no')
    else if (typeof tracks.sid === 'number') args.push(`--sid=${tracks.sid}`)
  }

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

// 启动某个具体的播放器可执行文件，并挂上错误回调：未安装/路径不对(ENOENT 等)会弹窗提示而非静默失败或崩溃
function spawnPlayer(bin, args, label) {
  const child = spawn(bin, args, { stdio: 'ignore' })
  child.on('error', (e) => {
    console.error(`[external] ${label} 启动失败：`, e.message)
    dialog.showErrorBox(
      '无法启动播放器',
      `未能启动 ${label}。\n请确认已安装，或在「设置 → 播放器路径」里填写它的可执行文件路径。`
    )
  })
  return child
}

// win32 各外部播放器的可执行文件候选 + 参数
function winPlayer(player, url, seek) {
  const map = {
    potplayer: {
      name: 'PotPlayer',
      paths: [
        'C:/Program Files/DAUM/PotPlayer/PotPlayerMini64.exe',
        'C:/Program Files (x86)/DAUM/PotPlayer/PotPlayerMini.exe'
      ],
      args: seek ? [url, `/seek=${seek}`] : [url]
    },
    vlc: {
      name: 'VLC',
      paths: ['C:/Program Files/VideoLAN/VLC/vlc.exe', 'C:/Program Files (x86)/VideoLAN/VLC/vlc.exe'],
      args: seek ? [`--start-time=${seek}`, url] : [url]
    }
  }
  return map[player]
}

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
            spawnPlayer(cli, seek ? [`--mpv-start=${seek}`, url] : [url], 'IINA')
            return true
          }
        }
        spawn('open', ['-a', customPath, url], { stdio: 'ignore' })
        return true
      }
      spawn('open', ['-a', appMap[player] || player, url], { stdio: 'ignore' })
      return true
    }
    if (process.platform === 'win32' && (player === 'potplayer' || player === 'vlc')) {
      const cfg = winPlayer(player, url, seek)
      const bin = [customPath, ...cfg.paths].filter(Boolean).find((p) => existsSync(p))
      if (!bin) {
        // 标准安装位置和自定义路径都没找到 → 明确告知而非报晦涩错误
        dialog.showErrorBox(
          '未找到播放器',
          `未找到 ${cfg.name}。\n请先安装 ${cfg.name}，或在「设置 → 播放器路径」里填写它的 exe 路径。`
        )
        return false
      }
      spawnPlayer(bin, cfg.args, cfg.name)
      return true
    }
    if (process.platform === 'linux' && player === 'vlc') {
      const bin = customPath && existsSync(customPath) ? customPath : 'vlc'
      spawnPlayer(bin, seek ? [`--start-time=${seek}`, url] : [url], 'VLC')
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

// 选择文件夹（添加本机存储源时用）
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(mainWin ?? undefined, { properties: ['openDirectory'] })
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
})

// 递归扫描目录下所有视频（本机源进媒体库用）；限深/限量，避免超大目录卡死
async function scanVideos(dir, out, depth, base = dir) {
  if (out.length >= 4000 || depth > 8) return
  let dirents
  try {
    dirents = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  // 当前目录相对源根的路径（'/' 分隔），供文件夹层级浏览
  const rel = path.relative(base, dir).replace(/\\/g, '/')
  for (const ent of dirents) {
    if (ent.name.startsWith('.')) continue
    if (out.length >= 4000) return
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      await scanVideos(full, out, depth + 1, base)
    } else if (VIDEO_EXT.has(path.extname(ent.name).toLowerCase())) {
      let size = 0
      let mtime = 0
      try {
        const st = await stat(full)
        size = st.size
        mtime = st.mtimeMs
      } catch {
        /* ignore */
      }
      out.push({ name: ent.name, path: full, size, mtime, dir: rel })
    }
  }
}
ipcMain.handle('scan-videos', async (_e, root) => {
  if (!root) return { error: '路径为空' }
  const out = []
  try {
    await scanVideos(root, out, 0)
    return { videos: out }
  } catch (e) {
    return { error: e.message }
  }
})

// WebDAV：递归列目录，视频返回带认证的直链（供外部播放器/抽帧）
ipcMain.handle('scan-webdav', async (_e, config) => {
  const { url, username, password, path: rootPath } = config || {}
  if (!url) return { error: '缺少 WebDAV 地址' }
  try {
    const client = createClient(url, username ? { username, password } : {})
    const videos = []
    // 规范化路径 + 求相对源根的文件夹（供文件夹层级浏览）
    const norm = (p) => ('/' + p).replace(/\/+/g, '/').replace(/\/+$/, '') || '/'
    const rootBase = norm(rootPath || '/')
    const relUnder = (d) => {
      let f = norm(d)
      if (rootBase !== '/' && f.startsWith(rootBase)) f = f.slice(rootBase.length)
      return f.replace(/^\/+/, '')
    }
    // 逐层递归（每次 Depth:1）：比 deep:true（Depth:infinity）兼容更多服务器（不少服务器禁用无限深度）
    const walk = async (dir, depth) => {
      if (depth > 8 || videos.length >= 4000) return
      const items = await client.getDirectoryContents(dir)
      const list = Array.isArray(items) ? items : items.data
      const rel = relUnder(dir)
      for (const it of list) {
        if (videos.length >= 4000) break
        if (it.type === 'directory') {
          // 跳过「自身」条目（部分服务器会把当前目录也列出）以防死循环
          const self = it.filename.replace(/\/+$/, '') === String(dir).replace(/\/+$/, '')
          if (!self) await walk(it.filename, depth + 1)
        } else if (VIDEO_EXT.has(path.extname(it.basename).toLowerCase())) {
          videos.push({
            name: it.basename,
            // 带 basic auth 的直链，外部播放器可直接播
            path: client.getFileDownloadLink(it.filename),
            size: it.size || 0,
            mtime: it.lastmod ? Date.parse(it.lastmod) : 0,
            dir: rel
          })
        }
      }
    }
    await walk(rootPath || '/', 0)
    return { videos }
  } catch (e) {
    return { error: e.message }
  }
})

// SMB：Windows 走 UNC 路径（必要时 net use 建立带凭据的连接），再用 fs 递归扫描
ipcMain.handle('scan-smb', async (_e, config) => {
  if (process.platform !== 'win32') return { error: 'SMB 目前仅支持 Windows（UNC 路径）' }
  const { path: subPath, username, password } = config || {}
  let address = (config?.address || '').trim()
  if (!address) return { error: '缺少共享地址（如 \\\\192.168.1.10\\media）' }
  // 规范化：正斜杠转反斜杠、补齐开头的 \\（用户可能只填 192.168.x.x\share）
  address = address.replace(/\//g, '\\')
  if (!address.startsWith('\\\\')) address = '\\\\' + address.replace(/^\\+/, '')
  // UNC 不支持端口：\\host:445\share 会把 host:445 当成主机名 → 找不到网络名(67)，去掉主机后的 :端口
  address = address.replace(/^(\\\\[^\\]+?):\d+(?=\\|$)/, '$1')
  // 必须带共享名：\\主机\共享名。只填 \\主机 无法枚举（readdir 报 ENOENT）
  const segs = address.replace(/^\\+/, '').split('\\').filter(Boolean)
  if (segs.length < 2 && !subPath) {
    return {
      error: `地址缺少共享名，请填 \\\\主机\\共享名（如 \\\\${segs[0] || '192.168.0.113'}\\共享文件夹）。共享名可在 NAS 的 SMB/文件共享设置里查看`
    }
  }
  // 有凭据则先建立连接（已用别的账号连过会报 1219，此时忽略、直接尝试访问）
  let netMsg = ''
  if (username) {
    netMsg = await new Promise((res) => {
      // stdio inherit：把 net use 的真实报错（GBK 中文）直接打到运行 electron 的终端，便于定位
      const p = spawn('net', ['use', address, password || '', `/user:${username}`], {
        windowsHide: true,
        stdio: ['ignore', 'inherit', 'inherit']
      })
      p.on('exit', (code) => res(code === 0 ? '' : `net use 退出码 ${code}`))
      p.on('error', (e) => res(e.message))
    })
  }
  const root = subPath ? path.join(address, subPath) : address
  // 先测试能否访问根目录，失败就明确报错（否则 scanVideos 会静默返回空 → 看着像“没视频”）
  try {
    await readdir(root)
  } catch (e) {
    return {
      error: `无法访问 ${root}：${e.code || e.message}。若资源管理器能打开该服务器却在此失败，多半是「共享名」不对——请用资源管理器里看到的文件夹名（不是设备名/IP）；也确认账号密码${netMsg ? `（${netMsg}）` : ''}`
    }
  }
  const out = []
  try {
    await scanVideos(root, out, 0)
    return { videos: out }
  } catch (e) {
    return { error: e.message }
  }
})

// ---------- DLNA / UPnP（SSDP 发现 + ContentDirectory SOAP Browse）----------
function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}
// 从设备描述 XML 里取 friendlyName + ContentDirectory 的绝对 controlURL
async function parseDlnaDescription(location) {
  try {
    const xml = await (await fetch(location)).text()
    const svc = xml.split(/<service>/i).find((s) => /ContentDirectory/i.test(s))
    const ctrl = svc?.match(/<controlURL>\s*([^<]+)\s*<\/controlURL>/i)?.[1]?.trim()
    if (!ctrl) return null
    const name = xml.match(/<friendlyName>\s*([^<]+)\s*<\/friendlyName>/i)?.[1]?.trim() || 'DLNA'
    const base = xml.match(/<URLBase>\s*([^<]+)\s*<\/URLBase>/i)?.[1]?.trim() || new URL(location).origin
    return { name, controlUrl: new URL(ctrl, base).href }
  } catch {
    return null
  }
}
// SSDP M-SEARCH 发现局域网 DLNA 媒体服务器
// 从每个真实网卡各发一遍、并用多个 ST（Windows 多网卡/虚拟网卡时组播易发错口，故遍历所有网卡）
function discoverDlna(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const results = []
    const seen = new Set()
    const pending = []
    const sockets = []
    const STs = [
      'urn:schemas-upnp-org:service:ContentDirectory:1',
      'urn:schemas-upnp-org:device:MediaServer:1',
      'ssdp:all'
    ]
    const onMessage = (buf) => {
      const loc = buf.toString().match(/LOCATION:\s*(\S+)/i)?.[1]
      if (loc && !seen.has(loc)) {
        seen.add(loc)
        pending.push(
          parseDlnaDescription(loc).then((info) => {
            if (info && !results.some((r) => r.controlUrl === info.controlUrl)) results.push(info)
          })
        )
      }
    }
    // 收集所有非内网 IPv4 地址（各网卡各绑一个 socket 发送，绕开虚拟网卡路由问题）
    const addrs = []
    for (const list of Object.values(networkInterfaces())) {
      for (const ni of list || []) {
        if (ni.family === 'IPv4' && !ni.internal) addrs.push(ni.address)
      }
    }
    if (!addrs.length) addrs.push('0.0.0.0')
    for (const addr of addrs) {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      sock.on('message', onMessage)
      sock.on('error', () => {
        try {
          sock.close()
        } catch {
          /* ignore */
        }
      })
      sock.bind(0, addr, () => {
        try {
          sock.setBroadcast(true)
          for (const st of STs) {
            const msg = Buffer.from(
              'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ' +
                st +
                '\r\n\r\n'
            )
            sock.send(msg, 1900, '239.255.255.250')
          }
        } catch {
          /* ignore */
        }
      })
      sockets.push(sock)
    }
    setTimeout(async () => {
      for (const s of sockets) {
        try {
          s.close()
        } catch {
          /* ignore */
        }
      }
      await Promise.allSettled(pending)
      resolve(results)
    }, timeoutMs)
  })
}
async function soapBrowse(controlUrl, objectId, start, count) {
  const body =
    '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
    '<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">' +
    `<ObjectID>${objectId}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag>` +
    `<Filter>*</Filter><StartingIndex>${start}</StartingIndex><RequestedCount>${count}</RequestedCount>` +
    '<SortCriteria></SortCriteria></u:Browse></s:Body></s:Envelope>'
  const text = await (
    await fetch(controlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        SOAPAction: '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"'
      },
      body
    })
  ).text()
  return {
    didl: unescapeXml(text.match(/<Result>([\s\S]*?)<\/Result>/i)?.[1] ?? ''),
    total: parseInt(text.match(/<TotalMatches>(\d+)<\/TotalMatches>/i)?.[1] || '0', 10),
    num: parseInt(text.match(/<NumberReturned>(\d+)<\/NumberReturned>/i)?.[1] || '0', 10)
  }
}
async function browseDlna(controlUrl, objectId, out, depth, dirPath = '') {
  if (depth > 8 || out.length >= 4000) return
  let start = 0
  for (;;) {
    let r
    try {
      r = await soapBrowse(controlUrl, objectId, start, 200)
    } catch {
      return
    }
    if (!r.didl) return
    // 容器标题映射（尽力而为，取不到就用 id）——供文件夹层级浏览
    const titles = {}
    for (const m of r.didl.matchAll(/<container\b([^>]*)>([\s\S]*?)<\/container>/gi)) {
      const cid = m[1].match(/\bid=["']([^"']+)["']/i)?.[1]
      if (cid) titles[cid] = unescapeXml(m[2].match(/<dc:title>([^<]*)<\/dc:title>/i)?.[1] || '')
    }
    // 直接子容器 → 递归（用「开始标签」正则取 id 更稳，绝不漏容器/视频）
    for (const c of r.didl.matchAll(/<container\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi)) {
      const id = c[1]
      const title = titles[id] || id
      await browseDlna(controlUrl, id, out, depth + 1, dirPath ? dirPath + '/' + title : title)
      if (out.length >= 4000) return
    }
    // 视频条目
    for (const it of r.didl.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
      const block = it[1]
      if (!/videoItem/i.test(block.match(/<upnp:class>([^<]+)<\/upnp:class>/i)?.[1] || '')) continue
      const res = block.match(/<res\b([^>]*)>([^<]+)<\/res>/i)
      if (!res) continue
      out.push({
        name: unescapeXml(block.match(/<dc:title>([^<]*)<\/dc:title>/i)?.[1] || '视频'),
        path: unescapeXml(res[2].trim()),
        size: parseInt(res[1].match(/size=["'](\d+)["']/i)?.[1] || '0', 10),
        mtime: 0,
        dir: dirPath
      })
      if (out.length >= 4000) return
    }
    start += r.num
    if (!r.num || start >= r.total) return
  }
}
ipcMain.handle('discover-dlna', async () => {
  try {
    return { servers: await discoverDlna() }
  } catch (e) {
    return { error: e.message }
  }
})
ipcMain.handle('scan-dlna', async (_e, config) => {
  const controlUrl = config?.controlUrl
  if (!controlUrl) return { error: '缺少 DLNA 服务器（请先发现并选择）' }
  const out = []
  try {
    await browseDlna(controlUrl, '0', out, 0)
    // 同一视频可能出现在多个容器（如「所有视频」+「文件夹」），按直链去重
    const seen = new Set()
    return { videos: out.filter((v) => !seen.has(v.path) && seen.add(v.path)) }
  } catch (e) {
    return { error: e.message }
  }
})

// ---------- 视频缩略图（自带 mpv 无头抽一帧，缓存到 userData/thumbs）----------
const THUMB_DIR = path.join(app.getPath('userData'), 'thumbs')
try {
  mkdirSync(THUMB_DIR, { recursive: true })
} catch {
  /* ignore */
}
function thumbPathFor(file) {
  return path.join(THUMB_DIR, createHash('md5').update(file).digest('hex') + '.jpg')
}
let thumbActive = 0
const thumbQueue = []
function runThumbQueue() {
  while (thumbActive < 3 && thumbQueue.length) {
    const job = thumbQueue.shift()
    thumbActive++
    genThumb(job.file, job.out, job.mpvPath).finally(() => {
      thumbActive--
      job.done()
      runThumbQueue()
    })
  }
}
// 缩略图与播放用同一个 mpv：优先设置里配的自定义路径（从文件存储读）
function settingsMpvPath() {
  try {
    return JSON.parse(persistStore['neko-settings'] || '{}').playerPaths?.mpv || ''
  } catch {
    return ''
  }
}
function genThumb(file, out, mpvPath) {
  return new Promise((resolve) => {
    // 优先用渲染进程传来的 mpv 路径（与播放同源），退回设置文件里的，再退回自带/PATH
    const mpvBin = resolveMpv(mpvPath || settingsMpvPath())
    const args = [
      file,
      '--no-config',
      '--really-quiet',
      '--no-audio',
      '--frames=1',
      '--start=20%',
      '--vf=scale=480:-2',
      // MJPEG 默认要全范围 YUV；新版 ffmpeg 弃用了 yuvj420p 格式名（format=yuvj420p 会被静默忽略、
      // 仍是 yuv420p → "Could not initialize encoder"），改用 strict=-1 让编码器接受非全范围 YUV
      '--ovcopts=strict=-1',
      `--o=${out}`
    ]
    let done = false
    let err = ''
    const finish = () => {
      if (done) return
      done = true
      // 没生成文件就把 mpv 的报错打到主控制台，方便定位（mpv 路径错/编码失败/无法读源等）
      if (!existsSync(out)) {
        console.warn('[neko-thumb] 抽帧失败 file=%s\n  mpv=%s\n  %s', file, mpvBin, err.trim().slice(-600))
      }
      resolve()
    }
    try {
      const p = spawn(mpvBin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      p.stderr?.on('data', (d) => (err += d.toString()))
      p.on('exit', finish)
      p.on('error', (e) => {
        err += e.message
        finish()
      })
      setTimeout(() => {
        try {
          p.kill()
        } catch {
          /* ignore */
        }
        finish()
      }, 15000) // 抽帧超时保护
    } catch (e) {
      err += e.message
      finish()
    }
  })
}
ipcMain.handle('get-thumb', async (_e, payload) => {
  const { file, mpvPath } =
    typeof payload === 'string' ? { file: payload, mpvPath: '' } : payload || {}
  if (!file) return null
  const out = thumbPathFor(file)
  if (!existsSync(out)) {
    await new Promise((done) => {
      thumbQueue.push({ file, out, mpvPath, done })
      runThumbQueue()
    })
  }
  if (!existsSync(out)) return null
  // 返回 base64 data URL，避免 dev（http 源）下 file:// 图被拦
  try {
    return 'data:image/jpeg;base64,' + (await readFile(out)).toString('base64')
  } catch {
    return null
  }
})

// 检查 mpv 是否可用（供设置页提示用户是否需要填路径）：返回解析到的真实可执行文件
ipcMain.handle('check-mpv', (_e, mpvPath) => {
  const resolved = resolveMpv(mpvPath || settingsMpvPath())
  const ok = existsSync(resolved)
  return { ok, path: ok ? resolved : '' }
})

// 从 mpv 输出解析音轨/字幕轨道列表（● 选中 / ○ 未选）
function parseTracks(out) {
  const audio = []
  const sub = []
  const re =
    /(?:[●○]|\(\+?\))\s*(Audio|Subs?)\s+--[as]id=(\d+)(?:\s+--[as]lang=(\S+))?(?:\s+'([^']*)')?(?:\s+\(([^)]*)\))?/gi
  let m
  while ((m = re.exec(out))) {
    const t = {
      id: +m[2],
      lang: m[3] || '',
      title: m[4] || '',
      codec: (m[5] || '').trim().split(/[\s,]/)[0] || ''
    }
    if (/^Audio/i.test(m[1])) audio.push(t)
    else sub.push(t)
  }
  return { audio, sub }
}

// 用 mpv 探测视频媒体信息（分辨率/编码/时长等），供文件源详情页显示。--term-playing-msg 展开属性、好解析
function probeMedia(file, mpvPath) {
  return new Promise((resolve) => {
    let out = ''
    let done = false
    const finish = () => {
      if (done) return
      done = true
      const tracks = parseTracks(out)
      const m = out.match(/NEKO\|([^\r\n]*)/)
      if (!m) {
        // 没解出画面属性行（如远程流没解到帧就超时）；轨道行在打开时已打印，至少把轨道带回
        return resolve(
          tracks.audio.length || tracks.sub.length
            ? { width: 0, height: 0, fps: 0, videoCodec: '', audioCodec: '', channels: 0, sampleRate: 0, duration: 0, gamma: '', size: 0, tracks }
            : null
        )
      }
      const f = m[1].split('|')
      resolve({
        width: +f[0] || 0,
        height: +f[1] || 0,
        fps: parseFloat(f[2]) || 0,
        videoCodec: f[3] || '',
        audioCodec: f[4] || '',
        channels: +f[5] || 0,
        sampleRate: +f[6] || 0,
        duration: parseFloat(f[7]) || 0,
        gamma: f[8] || '',
        size: +f[9] || 0,
        tracks
      })
    }
    try {
      const p = spawn(
        resolveMpv(mpvPath || settingsMpvPath()),
        [
          file,
          '--no-config',
          '--vo=null',
          '--ao=null',
          '--frames=1',
          '--quiet',
          '--term-playing-msg=NEKO|${=width}|${=height}|${container-fps}|${video-format}|${audio-codec-name}|${audio-params/channel-count}|${audio-params/samplerate}|${=duration}|${video-params/gamma}|${=file-size}'
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
      p.stdout.on('data', (d) => (out += d.toString()))
      p.stderr.on('data', (d) => (out += d.toString()))
      p.on('exit', finish)
      p.on('error', () => resolve(null))
      setTimeout(() => {
        try {
          p.kill()
        } catch {
          /* ignore */
        }
        finish()
      }, 15000)
    } catch {
      resolve(null)
    }
  })
}
ipcMain.handle('probe-media', async (_e, payload) => {
  const { file, mpvPath } = payload || {}
  if (!file) return null
  const info = await probeMedia(file, mpvPath)
  let size = info?.size || 0
  // mpv 没给大小时兜底：http 直链走 HEAD 拿 Content-Length，本机/UNC 走 stat
  if (!size) {
    if (/^https?:\/\//i.test(file)) {
      try {
        const r = await fetch(file, { method: 'HEAD' })
        const l = r.headers.get('content-length')
        if (l) size = parseInt(l, 10) || 0
      } catch {
        /* ignore */
      }
    } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(file)) {
      try {
        size = (await stat(file)).size
      } catch {
        /* ignore */
      }
    }
  }
  if (!info && !size) return null
  return { ...(info || {}), size }
})

// 标题栏悬浮按钮区的配色（跟随亮/暗）：与 theme.css 的 --bg-1 一致
// 与 App 背景渐变的「顶色」(theme.css 的 --bg-0) 一致，让右上角悬浮按钮区尽量融入内容
function titlebarColors(light) {
  return light
    ? { color: '#e9edf4', symbolColor: '#48505f', height: 44 }
    : { color: '#06070b', symbolColor: '#c9d1e4', height: 44 }
}
// 启动时按已存设置推断亮/暗，避免建窗时用错色导致闪一下
function initialLight() {
  try {
    const scheme = JSON.parse(persistStore['neko-settings'] || '{}').colorScheme
    if (scheme === '亮色') return true
    if (scheme === '暗色') return false
    return !nativeTheme.shouldUseDarkColors // 跟随系统
  } catch {
    return false
  }
}
// 渲染进程切换亮/暗时同步更新标题栏按钮区配色
ipcMain.on('set-titlebar-theme', (_e, light) => {
  if (process.platform === 'win32' && mainWin?.setTitleBarOverlay) {
    try {
      mainWin.setTitleBarOverlay(titlebarColors(light))
    } catch {
      /* ignore */
    }
  }
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
    // 去掉原生标题栏，内容拉通到顶。Windows：窗口按钮走悬浮层；macOS：保留红绿灯；Linux：保留原生边框以免丢按钮
    ...(process.platform === 'win32'
      ? { titleBarStyle: 'hidden', titleBarOverlay: titlebarColors(initialLight()) }
      : process.platform === 'darwin'
        ? { titleBarStyle: 'hidden' }
        : {}),
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
  // 站外链接（如关于页的 GitHub 地址）用系统默认浏览器打开，别在应用内新开窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
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
  if (storeWriteTimer) flushStore() // 落盘未写完的存储
  if (mpvProc) {
    try {
      mpvProc.kill()
    } catch {
      /* ignore */
    }
  }
})
