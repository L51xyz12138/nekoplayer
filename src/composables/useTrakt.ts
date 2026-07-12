import { computed, reactive } from 'vue'
import { pget, pset, premove } from './persist'
import {
  getDeviceCode,
  getMe,
  pollDeviceToken,
  refreshAccessToken,
  traktConfigured,
  type TraktDeviceCode,
  type TraktToken,
  type TraktUser
} from '@/api/trakt'

const KEY = 'neko-trakt'

interface TraktState {
  token: TraktToken | null
  user: TraktUser | null
  /** idle 未连接 | pairing 等待用户在网页授权 | connected 已连接 */
  status: 'idle' | 'pairing' | 'connected'
  /** 配对时给 UI 显示 user_code + verification_url */
  device: TraktDeviceCode | null
  error: string
}

function loadToken(): TraktToken | null {
  try {
    const raw = pget(KEY)
    return raw ? (JSON.parse(raw) as TraktToken) : null
  } catch {
    return null
  }
}

// 模块级单例
const state = reactive<TraktState>({
  token: loadToken(),
  user: null,
  status: loadToken() ? 'connected' : 'idle',
  device: null,
  error: ''
})

function saveToken(t: TraktToken | null) {
  state.token = t
  if (t) pset(KEY, JSON.stringify(t))
  else premove(KEY)
}

let polling = false

/** 连接 Trakt：走 device 流程。调用后 UI 从 state.device 读 user_code / verification_url 显示，自动轮询直到授权 */
async function connect() {
  if (!traktConfigured()) {
    state.error = '开发者尚未配置 Trakt 应用凭据'
    return
  }
  state.error = ''
  try {
    const dc = await getDeviceCode()
    state.device = dc
    state.status = 'pairing'
    polling = true
    const deadline = Date.now() + dc.expires_in * 1000
    let interval = Math.max(dc.interval, 1) * 1000
    while (polling && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval))
      if (!polling) return
      const res = await pollDeviceToken(dc.device_code)
      if (res.status === 'ok') {
        saveToken(res.token)
        state.status = 'connected'
        state.device = null
        void loadUser()
        return
      }
      if (res.status === 'slow_down') interval += 1000
      else if (res.status === 'expired') {
        state.error = '配对码已过期，请重新连接'
        break
      } else if (res.status === 'denied') {
        state.error = '已取消授权'
        break
      } else if (res.status === 'error') {
        state.error = `授权失败（${res.code}）`
        break
      }
      // pending → 继续轮询
    }
    // 循环结束仍未连上（成功会在上面 return；这里是超时/取消/出错）
    state.status = 'idle'
    state.device = null
  } catch (e) {
    state.error = e instanceof Error ? e.message : '连接失败'
    state.status = 'idle'
    state.device = null
  } finally {
    polling = false
  }
}

/** 取消正在进行的配对 */
function cancelConnect() {
  polling = false
  state.status = state.token ? 'connected' : 'idle'
  state.device = null
}

/** 断开连接（清除本地 token） */
function disconnect() {
  polling = false
  saveToken(null)
  state.user = null
  state.status = 'idle'
  state.device = null
  state.error = ''
}

/** 取有效 access_token（快过期则先刷新）。供后续 API 调用；无 token 或刷新失败返回 null */
async function validToken(): Promise<string | null> {
  const t = state.token
  if (!t) return null
  const expiresAt = t.created_at + t.expires_in * 1000
  // 提前 1 天刷新，避免临界期请求失败
  if (Date.now() > expiresAt - 24 * 3600 * 1000) {
    try {
      const nt = await refreshAccessToken(t.refresh_token)
      saveToken(nt)
      return nt.access_token
    } catch {
      disconnect() // refresh_token 也失效 → 需重新连接
      return null
    }
  }
  return t.access_token
}

async function loadUser() {
  const tok = await validToken()
  if (!tok) return
  try {
    state.user = await getMe(tok)
  } catch {
    /* 取用户名失败不影响连接状态 */
  }
}

// 启动时若已有 token，后台校验 + 取用户名
if (state.token) void loadUser()

export function useTrakt() {
  return {
    state,
    connected: computed(() => state.status === 'connected'),
    configured: computed(() => traktConfigured()),
    connect,
    cancelConnect,
    disconnect,
    validToken
  }
}
