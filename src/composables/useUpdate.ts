import { reactive } from 'vue'

// 软件内检查更新：
// - 打包后的 Windows / Linux → auto 模式：electron-updater 在软件内下载 + 重启安装
// - macOS(未签名) / dev / 出错 → manual 模式：提示 + 一键前往下载页
const current = __APP_VERSION__

interface UpdateState {
  checking: boolean
  checked: boolean
  hasUpdate: boolean
  latest: string
  mode: 'manual' | 'auto'
  // manual：release 页面 + 更新说明
  url: string
  notes: string
  // auto：下载进度 / 已下载
  downloading: boolean
  progress: number // 0-100
  downloaded: boolean
  error: string
  dismissed: boolean
}

const state = reactive<UpdateState>({
  checking: false,
  checked: false,
  hasUpdate: false,
  latest: '',
  mode: 'manual',
  url: '',
  notes: '',
  downloading: false,
  progress: 0,
  downloaded: false,
  error: '',
  dismissed: false
})

/** 版本比较：a 比 b 新返回正数（按 . 分段逐位比数值，故 0.3.11 > 0.3.2） */
function cmpVer(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

// auto 模式的进度/结果经主进程事件推来（只注册一次）
window.nekoNative?.onUpdateEvent?.((p) => {
  state.mode = 'auto'
  if (p.type === 'available') {
    state.checking = false
    state.latest = p.version
    state.hasUpdate = true
    state.dismissed = false
  } else if (p.type === 'none') {
    state.checking = false
    state.checked = true
    state.hasUpdate = false
  } else if (p.type === 'progress') {
    state.downloading = true
    state.progress = p.percent
  } else if (p.type === 'downloaded') {
    state.downloading = false
    state.downloaded = true
    state.progress = 100
  } else if (p.type === 'error') {
    state.checking = false
    state.downloading = false
    state.error = '自动更新失败：' + p.message
  }
})

async function check(): Promise<void> {
  if (!window.nekoNative?.checkUpdate || state.checking) return
  state.checking = true
  state.error = ''
  try {
    const r = await window.nekoNative.checkUpdate()
    state.checked = true
    if (r?.mode === 'auto') {
      state.mode = 'auto' // 结果经 onUpdateEvent 异步来，checking 由事件收尾
    } else if (r?.mode === 'manual') {
      state.mode = 'manual'
      state.latest = r.version
      state.url = r.url
      state.notes = r.notes
      state.hasUpdate = cmpVer(r.version, current) > 0
      if (state.hasUpdate) state.dismissed = false
      state.checking = false
    } else {
      state.error = '检查更新失败（网络或频率限制）'
      state.checking = false
    }
  } catch {
    state.error = '检查更新失败'
    state.checking = false
  }
}

/** auto 模式：下载更新（进度经事件） */
async function download(): Promise<void> {
  if (!window.nekoNative?.downloadUpdate) return
  state.downloading = true
  state.progress = 0
  state.error = ''
  await window.nekoNative.downloadUpdate()
}

/** auto 模式：下载完成后退出并安装 */
function install(): void {
  window.nekoNative?.quitAndInstall?.()
}

function dismiss(): void {
  state.dismissed = true
}

export function useUpdate() {
  return { state, check, download, install, dismiss, current }
}
