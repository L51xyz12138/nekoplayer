// Trakt.tv 集成：OAuth「device」授权流程 + API 客户端。
// 应用启用了 webSecurity:false，渲染进程可直接 fetch Trakt API（免跨域），与 emby.ts 同思路。
// 后续 scrobble 在主进程做（那里有 mpv 进度），两边读同一份 token（persist 键 neko-trakt）。

// ⚠️ NekoPlayer 的 Trakt 应用凭据——去 https://trakt.tv/oauth/applications 注册应用后填入。
// device 流程需要 client_id + client_secret 两者；留空则「连接 Trakt」不可用。
export const TRAKT_CLIENT_ID = '43167cc633c18af8cd6c32d9d6162172ca8f04299bd85d0d953967bd4b421bd8'
export const TRAKT_CLIENT_SECRET = 'ae5e808716ae995545b53e1e0837bc0c2ecb723ff9476deb929c71db70dfbe65'

const API = 'https://api.trakt.tv'

export interface TraktToken {
  access_token: string
  refresh_token: string
  /** 有效期（秒） */
  expires_in: number
  /** 获取时刻（ms），用于判断是否过期 */
  created_at: number
}

export interface TraktDeviceCode {
  device_code: string
  user_code: string
  /** 用户去这里输入 user_code（通常 https://trakt.tv/activate） */
  verification_url: string
  /** 码有效期（秒） */
  expires_in: number
  /** 建议的轮询间隔（秒） */
  interval: number
}

export interface TraktUser {
  username: string
  name?: string
}

/** 是否已配置应用凭据（未配置则「连接 Trakt」按钮禁用并提示） */
export function traktConfigured(): boolean {
  return !!TRAKT_CLIENT_ID && !!TRAKT_CLIENT_SECRET
}

/** 通用请求头：版本 + api-key（client_id）+ 可选 Bearer */
export function traktHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': TRAKT_CLIENT_ID
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

/** 第一步：取设备码（给用户显示 user_code + 打开 verification_url） */
export async function getDeviceCode(): Promise<TraktDeviceCode> {
  const res = await fetch(`${API}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: TRAKT_CLIENT_ID })
  })
  if (!res.ok) throw new Error(`取设备码失败：${res.status}`)
  return res.json()
}

export type PollResult =
  | { status: 'ok'; token: TraktToken }
  | { status: 'pending' } // 用户还没授权，继续按 interval 轮询
  | { status: 'slow_down' } // 轮询太快，放慢再试
  | { status: 'expired' } // 码过期，重来
  | { status: 'denied' } // 用户拒绝
  | { status: 'error'; code: number }

/** 第二步：用设备码轮询换 token。按 interval 反复调用，直到 ok / expired / denied */
export async function pollDeviceToken(deviceCode: string): Promise<PollResult> {
  const res = await fetch(`${API}/oauth/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: deviceCode,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET
    })
  })
  if (res.ok) {
    const t = await res.json()
    return { status: 'ok', token: { ...t, created_at: Date.now() } }
  }
  // 400=还没授权(authorization_pending)、429=太快、410=过期、418=拒绝、404=码无效
  if (res.status === 400) return { status: 'pending' }
  if (res.status === 429) return { status: 'slow_down' }
  if (res.status === 410) return { status: 'expired' }
  if (res.status === 418) return { status: 'denied' }
  return { status: 'error', code: res.status }
}

/** 刷新 token（access_token 快过期时用 refresh_token 换新） */
export async function refreshAccessToken(refreshToken: string): Promise<TraktToken> {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  })
  if (!res.ok) throw new Error(`刷新 token 失败：${res.status}`)
  const t = await res.json()
  return { ...t, created_at: Date.now() }
}

/** 校验 token 并取用户名 */
export async function getMe(token: string): Promise<TraktUser> {
  const res = await fetch(`${API}/users/me`, { headers: traktHeaders(token) })
  if (!res.ok) throw new Error(`取用户信息失败：${res.status}`)
  const u = await res.json()
  return { username: u.username, name: u.name }
}
