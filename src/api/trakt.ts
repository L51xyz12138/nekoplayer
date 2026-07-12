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

// ---- 同步列表：想看(watchlist) / 评分(ratings) / 收藏(collection) ----
export type TraktListKind = 'watchlist' | 'ratings' | 'collection'

/** Trakt 列表里的一条（电影或剧）。Trakt 只给 id/标题/年份（无海报，海报另从 TMDB 补） */
export interface TraktListItem {
  type: 'movie' | 'show'
  ids: { trakt?: number; tmdb?: number; imdb?: string }
  title: string
  year: number
  /** 评分列表才有：用户打的分（1-10） */
  rating?: number
}

/** 拉某个列表（电影 + 剧各拉一次再合并）。需已授权 token */
export async function getTraktList(token: string, kind: TraktListKind): Promise<TraktListItem[]> {
  const fetchType = async (t: 'movies' | 'shows'): Promise<TraktListItem[]> => {
    try {
      const res = await fetch(`${API}/sync/${kind}/${t}`, { headers: traktHeaders(token) })
      if (!res.ok) return []
      const data = await res.json()
      if (!Array.isArray(data)) return []
      const out: TraktListItem[] = []
      for (const row of data) {
        const mv = row.movie || row.show
        if (!mv) continue
        out.push({
          type: row.movie ? 'movie' : 'show',
          ids: { trakt: mv.ids?.trakt, tmdb: mv.ids?.tmdb ?? undefined, imdb: mv.ids?.imdb ?? undefined },
          title: mv.title || '',
          year: mv.year || 0,
          rating: typeof row.rating === 'number' ? row.rating : undefined
        })
      }
      return out
    } catch {
      return []
    }
  }
  const [movies, shows] = await Promise.all([fetchType('movies'), fetchType('shows')])
  return [...movies, ...shows]
}

/** Trakt「页」：三个同步列表 + 推荐 + 历史（TraktView 的 tab / loadTraktItems 的入参） */
export type TraktTab = TraktListKind | 'recommendations' | 'history'

/** 个性化推荐（电影+剧各拉一次；已收藏/已想看的排除）。需 token */
export async function getRecommendations(token: string): Promise<TraktListItem[]> {
  const fetchType = async (t: 'movies' | 'shows', type: 'movie' | 'show'): Promise<TraktListItem[]> => {
    try {
      const res = await fetch(
        `${API}/recommendations/${t}?limit=60&ignore_collected=true&ignore_watchlisted=true`,
        { headers: traktHeaders(token) }
      )
      if (!res.ok) return []
      const data = await res.json()
      if (!Array.isArray(data)) return []
      const out: TraktListItem[] = []
      for (const row of data) {
        const mv = row.movie || row.show || row // 推荐一般直接是对象
        if (!mv?.ids) continue
        out.push({
          type,
          ids: { trakt: mv.ids.trakt, tmdb: mv.ids.tmdb ?? undefined, imdb: mv.ids.imdb ?? undefined },
          title: mv.title || '',
          year: mv.year || 0
        })
      }
      return out
    } catch {
      return []
    }
  }
  const [m, s] = await Promise.all([fetchType('movies', 'movie'), fetchType('shows', 'show')])
  return [...m, ...s]
}

/** 观看历史（最近观看的电影 + 剧；剧集条目归到「剧」，按 tmdb 去重、保留最近）。需 token */
export async function getHistory(token: string): Promise<TraktListItem[]> {
  try {
    const res = await fetch(`${API}/sync/history?limit=100`, { headers: traktHeaders(token) })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    const out: TraktListItem[] = []
    const seen = new Set<string>()
    for (const row of data) {
      const isEp = row.type === 'episode'
      const mv = isEp ? row.show : row.movie // 剧集用其「剧」、电影用电影自身
      if (!mv?.ids) continue
      const type: 'movie' | 'show' = isEp ? 'show' : 'movie'
      const key = `${type}:${mv.ids.tmdb ?? mv.ids.trakt}`
      if (seen.has(key)) continue // 同一剧/电影多次观看只留最近一条
      seen.add(key)
      out.push({
        type,
        ids: { trakt: mv.ids.trakt, tmdb: mv.ids.tmdb ?? undefined, imdb: mv.ids.imdb ?? undefined },
        title: mv.title || '',
        year: mv.year || 0
      })
    }
    return out
  } catch {
    return []
  }
}

// ---- 回推：加/移出 想看·收藏、评分 ----
/** 一个 Trakt 电影/剧引用：type + ids（用于回推的 body） */
export interface TraktRef {
  type: 'movie' | 'show'
  ids: { tmdb?: number; imdb?: string }
}
function refBody(ref: TraktRef, rating?: number) {
  const entry = rating ? { ids: ref.ids, rating } : { ids: ref.ids }
  return ref.type === 'movie' ? { movies: [entry] } : { shows: [entry] }
}
async function syncPost(token: string, path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: traktHeaders(token),
      body: JSON.stringify(body)
    })
    return res.ok
  } catch {
    return false
  }
}
/** 加入 想看/收藏 */
export function addToList(token: string, kind: 'watchlist' | 'collection', ref: TraktRef) {
  return syncPost(token, `/sync/${kind}`, refBody(ref))
}
/** 移出 想看/收藏 */
export function removeFromList(token: string, kind: 'watchlist' | 'collection', ref: TraktRef) {
  return syncPost(token, `/sync/${kind}/remove`, refBody(ref))
}
/** 评分（1-10） */
export function rateItem(token: string, ref: TraktRef, rating: number) {
  return syncPost(token, '/sync/ratings', refBody(ref, rating))
}
/** 取消评分 */
export function unrateItem(token: string, ref: TraktRef) {
  return syncPost(token, '/sync/ratings/remove', refBody(ref))
}
