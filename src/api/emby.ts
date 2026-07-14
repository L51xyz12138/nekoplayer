// Emby / Jellyfin 媒体服务器 API 客户端
// 动态服务器地址：支持连接任意公网 / 局域网服务器（Electron webSecurity:false 免跨域）

import type { MediaExtSub, MediaTracks } from '@/types/media'

const CLIENT_NAME = 'NekoPlayer'
const DEVICE_NAME = 'NekoPlayer'
const APP_VERSION = __APP_VERSION__ // 构建时注入自 package.json（见 vite.config）

function getDeviceId(): string {
  const KEY = 'neko-device-id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = 'neko-' + Math.random().toString(36).slice(2, 12)
    localStorage.setItem(KEY, id)
  }
  return id
}

function authHeader(token?: string): string {
  const parts = [
    `MediaBrowser Client="${CLIENT_NAME}"`,
    `Device="${DEVICE_NAME}"`,
    `DeviceId="${getDeviceId()}"`,
    `Version="${APP_VERSION}"`
  ]
  if (token) parts.push(`Token="${token}"`)
  return parts.join(', ')
}

/** 规范化用户输入的服务器地址：补协议、去尾斜杠 */
export function normalizeServerUrl(input: string): string {
  let url = input.trim()
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url
  return url.replace(/\/+$/, '')
}

export interface EmbySession {
  /** 连接的服务器地址（已规范化） */
  serverUrl: string
  token: string
  userId: string
  userName: string
  serverId: string
}

export interface EmbyPerson {
  Id?: string
  Name: string
  Role?: string
  Type?: string
  PrimaryImageTag?: string
}

export interface EmbyMediaStream {
  Type: string
  Codec?: string
  Language?: string
  DisplayTitle?: string
  Title?: string
  Width?: number
  Height?: number
  Channels?: number
  BitRate?: number
  IsDefault?: boolean
  /** 视频动态范围，如 SDR/HDR/HDR10/DOVI/HLG（判 HDR 用） */
  VideoRange?: string
  /** 在所有流里的绝对序号（视频/音频/字幕混排）；排序后各类型自 1 计得到 mpv 轨道号 */
  Index?: number
  /** 外挂轨道（独立文件，不在 Static 直连流里）——内封轨预选时排除；外挂字幕单独走 --sub-file */
  IsExternal?: boolean
  /** 外挂字幕的服务器交付地址（相对，需补 serverUrl + api_key）；mpv --sub-file 用 */
  DeliveryUrl?: string
  /** 是否文本字幕（srt/ass/vtt 等；图形字幕 PGS/VobSub 为 false） */
  IsTextSubtitleStream?: boolean
}

export interface EmbyMediaSource {
  Id?: string
  Container?: string
  Size?: number
  Bitrate?: number
  Path?: string
  DirectStreamUrl?: string
  MediaStreams?: EmbyMediaStream[]
}

export interface EmbyItem {
  Id: string
  Name: string
  Type: string
  Overview?: string
  Genres?: string[]
  ProductionYear?: number
  CommunityRating?: number
  OfficialRating?: string
  RunTimeTicks?: number
  Taglines?: string[]
  DateCreated?: string
  People?: EmbyPerson[]
  MediaSources?: EmbyMediaSource[]
  MediaStreams?: EmbyMediaStream[]
  ImageTags?: Record<string, string>
  BackdropImageTags?: string[]
  UserData?: {
    IsFavorite?: boolean
    PlayedPercentage?: number
    Played?: boolean
    PlaybackPositionTicks?: number
    /** 最近一次播放时间（ISO 字符串），用于「继续观看」按最近排序 */
    LastPlayedDate?: string
  }
  IndexNumber?: number
  ParentIndexNumber?: number
  /** 分集所属剧集 id（NextUp 返回的分集带此字段） */
  SeriesId?: string
  /** 外部库 id（Tmdb/Imdb/Tvdb…，键名大小写因服务器而异），供 Trakt 列表匹配 */
  ProviderIds?: Record<string, string>
}

export interface EmbyPlaybackSource {
  Id: string
  Container?: string
  SupportsDirectStream?: boolean
  SupportsDirectPlay?: boolean
  SupportsTranscoding?: boolean
  TranscodingUrl?: string
  DirectStreamUrl?: string
  MediaStreams?: EmbyMediaStream[]
}

async function request(
  serverUrl: string,
  path: string,
  token: string | undefined,
  init: RequestInit = {}
): Promise<Response> {
  const auth = authHeader(token)
  const res = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: {
      // 两个头都发：Emby 认 X-Emby-Authorization，Jellyfin 10.8+ 认 Authorization
      'X-Emby-Authorization': auth,
      Authorization: auth,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  })
  if (!res.ok) {
    throw new Error(`请求失败：${res.status} ${res.statusText}`)
  }
  return res
}

/** 用户名 + 密码登录指定服务器 */
export async function authenticate(
  serverUrl: string,
  username: string,
  password: string
): Promise<EmbySession> {
  const base = normalizeServerUrl(serverUrl)
  const res = await request(base, '/Users/AuthenticateByName', undefined, {
    method: 'POST',
    body: JSON.stringify({ Username: username, Pw: password })
  })
  const data = await res.json()
  return {
    serverUrl: base,
    token: data.AccessToken,
    userId: data.User.Id,
    userName: data.User.Name,
    serverId: data.ServerId
  }
}

export interface EmbyView {
  Id: string
  Name: string
  /** 库类型：movies / tvshows / music / boxsets / mixed … */
  CollectionType?: string
}

/** 拉取用户可见的媒体库（服务器自带分类，与 Emby 首页的库 tile 一致） */
export async function getViews(session: EmbySession): Promise<EmbyView[]> {
  const res = await request(session.serverUrl, `/Users/${session.userId}/Views`, session.token)
  const data = await res.json()
  return (data.Items ?? []) as EmbyView[]
}

/** 拉取媒体库项目（电影 + 剧集）；传 ParentId 可只拉某个库 */
export async function getItems(
  session: EmbySession,
  params: Record<string, string> = {}
): Promise<EmbyItem[]> {
  const q = new URLSearchParams({
    IncludeItemTypes: 'Movie,Series',
    Recursive: 'true',
    Fields:
      'Overview,Genres,ProductionYear,CommunityRating,OfficialRating,RunTimeTicks,Taglines,DateCreated,People,MediaSources,MediaStreams,ProviderIds',
    SortBy: 'DateCreated',
    SortOrder: 'Descending',
    ...params
  })
  const res = await request(session.serverUrl, `/Users/${session.userId}/Items?${q}`, session.token)
  const data = await res.json()
  return (data.Items ?? []) as EmbyItem[]
}

/** 拉取合集（Collection / BoxSet，如「霍比特人系列」） */
export async function getCollections(session: EmbySession): Promise<EmbyItem[]> {
  return getItems(session, { IncludeItemTypes: 'BoxSet' })
}

/** 拉取单个条目详情 */
export async function getItem(session: EmbySession, itemId: string): Promise<EmbyItem> {
  const res = await request(session.serverUrl, `/Users/${session.userId}/Items/${itemId}`, session.token)
  return res.json() as Promise<EmbyItem>
}

/** 拉取「下一集待看」（每部在追剧集的下一集，Emby 已按最近活动排序） */
export async function getNextUp(session: EmbySession, limit = 40): Promise<EmbyItem[]> {
  const q = new URLSearchParams({
    UserId: session.userId,
    Limit: String(limit),
    Fields: 'RunTimeTicks,UserData,SeriesId'
  })
  const res = await request(session.serverUrl, `/Shows/NextUp?${q}`, session.token)
  const data = await res.json()
  return (data.Items ?? []) as EmbyItem[]
}

/** 拉取「继续观看」（有播放进度的电影/分集，Emby 按最近活动排序）——比 NextUp 更准地反映「正在看的那一集」 */
export async function getResume(session: EmbySession, limit = 40): Promise<EmbyItem[]> {
  const q = new URLSearchParams({
    Limit: String(limit),
    MediaTypes: 'Video',
    Fields: 'RunTimeTicks,UserData,SeriesId'
  })
  const res = await request(
    session.serverUrl,
    `/Users/${session.userId}/Items/Resume?${q}`,
    session.token
  )
  const data = await res.json()
  return (data.Items ?? []) as EmbyItem[]
}

/** 拉取剧集的全部分集 */
export async function getEpisodes(session: EmbySession, seriesId: string): Promise<EmbyItem[]> {
  const q = new URLSearchParams({
    UserId: session.userId,
    Fields: 'Overview,RunTimeTicks,MediaSources,MediaStreams,UserData'
  })
  const res = await request(session.serverUrl, `/Shows/${seriesId}/Episodes?${q}`, session.token)
  const data = await res.json()
  return (data.Items ?? []) as EmbyItem[]
}

/** 图片 URL（海报 Primary / 背景 Backdrop）；无 tag 返回 undefined */
export function imageUrl(
  serverUrl: string,
  itemId: string,
  type: 'Primary' | 'Backdrop',
  tag?: string,
  maxWidth = 600
): string | undefined {
  if (!tag) return undefined
  const q = new URLSearchParams({ tag, maxWidth: String(maxWidth), quality: '90' })
  return `${serverUrl}/Items/${itemId}/Images/${type}?${q}`
}

/**
 * 为外部播放器（mpv/IINA/VLC 等）取原始文件的直连地址。
 * 用「条目详情」拿正确的 MediaSourceId（比 PlaybackInfo 兼容更多魔改/网盘挂载服务器）。
 */
export async function getMpvPlayback(
  session: EmbySession,
  itemId: string
): Promise<{
  url: string
  playSessionId: string
  /** 条目在 TMDB/IMDB 的 id（来自 ProviderIds），供 Trakt scrobble 匹配 */
  ids: { tmdb?: number; imdb?: string }
  /** 'movie' | 'episode' | 'other'（来自 Emby Type） */
  type: 'movie' | 'episode' | 'other'
}> {
  // 直接取条目详情（带 MediaSources 字段）拿正确的媒体源 Id——
  // 部分魔改/网盘挂载服务器的 PlaybackInfo 返回空 MediaSources，条目详情却带得到
  const res = await request(
    session.serverUrl,
    `/Users/${session.userId}/Items/${itemId}?Fields=MediaSources,Path,ProviderIds`,
    session.token
  )
  const data = await res.json()
  const source = data.MediaSources?.[0] as EmbyPlaybackSource | undefined
  const playSessionId = ''
  const sourceId: string = source?.Id ?? itemId

  // ProviderIds 键名大小写因服务器而异，做个不分大小写的取值
  const pids: Record<string, string> = data.ProviderIds ?? {}
  const pick = (k: string) => {
    const hit = Object.keys(pids).find((x) => x.toLowerCase() === k)
    return hit ? pids[hit] : undefined
  }
  const tmdbRaw = pick('tmdb')
  const ids: { tmdb?: number; imdb?: string } = {}
  if (tmdbRaw && /^\d+$/.test(tmdbRaw)) ids.tmdb = Number(tmdbRaw)
  const imdb = pick('imdb')
  if (imdb) ids.imdb = imdb
  const type: 'movie' | 'episode' | 'other' =
    data.Type === 'Movie' ? 'movie' : data.Type === 'Episode' ? 'episode' : 'other'

  let url: string
  if (source?.DirectStreamUrl) {
    // Emby 给的直连地址（mpv 靠它直接播原文件）；若缺 api_key 就补上，供外部播放器认证
    let ds = source.DirectStreamUrl
    if (!/[?&]api_key=/i.test(ds)) {
      ds += (ds.includes('?') ? '&' : '?') + 'api_key=' + session.token
    }
    url = `${session.serverUrl}${ds}`
  } else {
    const container = source?.Container || 'mkv'
    const q = new URLSearchParams({
      Static: 'true',
      MediaSourceId: sourceId,
      api_key: session.token
    })
    url = `${session.serverUrl}/Videos/${itemId}/stream.${container}?${q}`
  }
  return { url, playSessionId, ids, type }
}

/** Emby/Jellyfin 条目的媒体信息（供详情页预选轨道 + 显示视频格式/文件路径） */
export interface EmbyMediaInfo {
  tracks: MediaTracks
  /** 服务器上的文件路径 */
  path: string
  container: string
  /** 文件字节数 */
  size: number
  /** 总码率 bit/s */
  bitrate: number
  video?: { width: number; height: number; codec: string; range: string }
  /** 首条（默认）音轨的编码/声道，供技术信息展示 */
  audioPrimary?: { codec: string; channels: number }
  /** 直连流地址（与 getMpvPlayback 同构）；魔改 Emby 无 MediaStreams 时拿它给 mpv 探测，省一次请求 */
  streamUrl: string
  /** 服务器端外挂字幕（独立字幕流，不在直连流里）；供详情页预选，播放时 mpv --sub-file 加载 */
  externalSubs: MediaExtSub[]
}

/** 取 Emby/Jellyfin 条目的媒体信息：音轨/字幕（供预选）+ 视频格式/文件路径（供技术信息）。
 * 轨道只取**内封**流（外挂轨道不在 Static 直连流里，mpv 看不到）；按 Index 排序后音轨/字幕
 * 各自 1-based 编号即 mpv `--aid`/`--sid`（Static 直连原文件，轨道顺序与 mpv 一致）。 */
export async function getMediaInfo(session: EmbySession, itemId: string): Promise<EmbyMediaInfo> {
  const res = await request(
    session.serverUrl,
    `/Users/${session.userId}/Items/${itemId}?Fields=MediaSources`,
    session.token
  )
  const data = await res.json()
  const src = data.MediaSources?.[0]
  const streams: EmbyMediaStream[] = src?.MediaStreams || data.MediaStreams || []
  const embedded = streams
    .filter((st) => !st.IsExternal)
    .sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0))
  const audio: MediaTracks['audio'] = []
  const sub: MediaTracks['sub'] = []
  for (const st of embedded) {
    if (st.Type === 'Audio') {
      audio.push({
        id: audio.length + 1,
        lang: st.Language || '',
        title: st.DisplayTitle || st.Title || '',
        codec: st.Codec || ''
      })
    } else if (st.Type === 'Subtitle') {
      sub.push({
        id: sub.length + 1,
        lang: st.Language || '',
        title: st.DisplayTitle || st.Title || '',
        codec: st.Codec || ''
      })
    }
  }
  // 外挂字幕（IsExternal 文本字幕）：不在 Static 直连流里，播放时 mpv 用 DeliveryUrl 经 --sub-file 加载
  const externalSubs: MediaExtSub[] = streams
    .filter(
      (st) =>
        st.Type === 'Subtitle' &&
        st.IsExternal &&
        (st.IsTextSubtitleStream ?? /srt|ass|ssa|vtt|subrip|text/i.test(st.Codec || '')) &&
        (st.DeliveryUrl || st.Index != null)
    )
    .map((st) => {
      let u = st.DeliveryUrl || `/Videos/${itemId}/${src?.Id ?? itemId}/Subtitles/${st.Index}/Stream.${st.Codec || 'srt'}`
      if (!/^https?:/i.test(u)) u = `${session.serverUrl}${u}`
      if (!/[?&]api_key=/i.test(u)) u += (u.includes('?') ? '&' : '?') + 'api_key=' + session.token
      return { url: u, lang: st.Language || '', title: st.DisplayTitle || st.Title || '' }
    })
  const v = embedded.find((st) => st.Type === 'Video')
  const a = embedded.find((st) => st.Type === 'Audio')
  // 直连流地址（与 getMpvPlayback 同构），供魔改 Emby 的 mpv 探测复用，避免再请求一次条目详情
  let streamUrl = ''
  if (src?.DirectStreamUrl) {
    let ds = src.DirectStreamUrl
    if (!/[?&]api_key=/i.test(ds)) ds += (ds.includes('?') ? '&' : '?') + 'api_key=' + session.token
    streamUrl = `${session.serverUrl}${ds}`
  } else {
    const q = new URLSearchParams({
      Static: 'true',
      MediaSourceId: src?.Id ?? itemId,
      api_key: session.token
    })
    streamUrl = `${session.serverUrl}/Videos/${itemId}/stream.${src?.Container || 'mkv'}?${q}`
  }
  return {
    tracks: { audio, sub },
    path: src?.Path || '',
    container: src?.Container || '',
    size: src?.Size || 0,
    bitrate: src?.Bitrate || 0,
    video: v ? { width: v.Width || 0, height: v.Height || 0, codec: v.Codec || '', range: v.VideoRange || '' } : undefined,
    audioPrimary: a ? { codec: a.Codec || '', channels: a.Channels || 0 } : undefined,
    streamUrl,
    externalSubs
  }
}

/** 取某演职人员参演的库内条目（用于「发现作品」）。返回原始 EmbyItem，由 mapper 映射。 */
export async function getPersonItems(session: EmbySession, personId: string): Promise<EmbyItem[]> {
  const q = new URLSearchParams({
    PersonIds: personId,
    Recursive: 'true',
    IncludeItemTypes: 'Movie,Series',
    SortBy: 'ProductionYear,SortName',
    SortOrder: 'Descending',
    Fields: 'Overview,Genres,ProductionYear,CommunityRating,OfficialRating',
    Limit: '60'
  })
  const res = await request(session.serverUrl, `/Users/${session.userId}/Items?${q}`, session.token)
  const data = await res.json()
  return (data.Items || []) as EmbyItem[]
}

/** 收藏 / 取消收藏（写回服务器） */
export async function setFavorite(
  session: EmbySession,
  itemId: string,
  favorite: boolean
): Promise<void> {
  await request(session.serverUrl, `/Users/${session.userId}/FavoriteItems/${itemId}`, session.token, {
    method: favorite ? 'POST' : 'DELETE'
  })
}

/** 标记已看 / 取消已看（写回服务器） */
export async function setPlayed(
  session: EmbySession,
  itemId: string,
  played: boolean
): Promise<void> {
  await request(session.serverUrl, `/Users/${session.userId}/PlayedItems/${itemId}`, session.token, {
    method: played ? 'POST' : 'DELETE'
  })
}

/** 上报播放开始，让 Emby 记录活动会话（外部播放器不会自己上报） */
export async function reportPlaybackStart(
  session: EmbySession,
  itemId: string,
  playSessionId: string
): Promise<void> {
  await request(session.serverUrl, '/Sessions/Playing', session.token, {
    method: 'POST',
    body: JSON.stringify({ ItemId: itemId, PlaySessionId: playSessionId, PlayMethod: 'DirectStream' })
  })
}
