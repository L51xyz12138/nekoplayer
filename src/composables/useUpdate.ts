import { reactive } from 'vue'

// 软件内检查更新（轻量版）：查 GitHub 最新 release，发现新版就提示 + 一键去下载页。
// 不自动安装（后续可再加 electron-updater 做 Win/Linux 真自动装）。

const current = __APP_VERSION__

interface UpdateState {
  checking: boolean
  /** 最新版本号（不含 v） */
  latest: string
  hasUpdate: boolean
  /** release 页面 URL */
  url: string
  /** 更新说明（release body） */
  notes: string
  error: string
  /** 用户忽略了本次提示 */
  dismissed: boolean
  /** 是否已检查过（供设置页显示「已是最新」） */
  checked: boolean
}

const state = reactive<UpdateState>({
  checking: false,
  latest: '',
  hasUpdate: false,
  url: '',
  notes: '',
  error: '',
  dismissed: false,
  checked: false
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

async function check(): Promise<void> {
  if (!window.nekoNative?.checkUpdate || state.checking) return
  state.checking = true
  state.error = ''
  try {
    const r = await window.nekoNative.checkUpdate()
    state.checked = true
    if (r?.version) {
      state.latest = r.version
      state.url = r.url
      state.notes = r.notes
      state.hasUpdate = cmpVer(r.version, current) > 0
      if (state.hasUpdate) state.dismissed = false
    } else {
      state.error = '检查更新失败（网络或频率限制）'
    }
  } catch {
    state.error = '检查更新失败'
  } finally {
    state.checking = false
  }
}

function dismiss() {
  state.dismissed = true
}

export function useUpdate() {
  return { state, check, dismiss, current }
}
