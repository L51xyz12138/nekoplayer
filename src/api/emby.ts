// Emby / Jellyfin 媒体服务器 API 客户端
// 动态服务器地址：支持连接任意公网 / 局域网服务器（Electron webSecurity:false 免跨域）

const CLIENT_NAME = 'NekoPlayer'
const DEVICE_NAME = 'NekoPlayer'
const APP_VERSION = '0.1.2'

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
  Width?: number
  Height?: number
  Channels?: number
  BitRate?: number
  IsDefault?: boolean
}

export interface EmbyMediaSource {
  Container?: string
  Size?: number
  Bitrate?: number
  Path?: string
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
  }
  IndexNumber?: number
  ParentIndexNumber?: number
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
  const res = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: {
      'X-Emby-Authorization': authHeader(token),
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

/** 拉取媒体库项目（电影 + 剧集） */
export async function getItems(
  session: EmbySession,
  params: Record<string, string> = {}
): Promise<EmbyItem[]> {
  const q = new URLSearchParams({
    IncludeItemTypes: 'Movie,Series',
    Recursive: 'true',
    Fields:
      'Overview,Genres,ProductionYear,CommunityRating,OfficialRating,RunTimeTicks,Taglines,DateCreated,People,MediaSources,MediaStreams',
    SortBy: 'DateCreated',
    SortOrder: 'Descending',
    ...params
  })
  const res = await request(session.serverUrl, `/Users/${session.userId}/Items?${q}`, session.token)
  const data = await res.json()
  return (data.Items ?? []) as EmbyItem[]
}

/** 拉取单个条目详情 */
export async function getItem(session: EmbySession, itemId: string): Promise<EmbyItem> {
  const res = await request(session.serverUrl, `/Users/${session.userId}/Items/${itemId}`, session.token)
  return res.json() as Promise<EmbyItem>
}

/** 拉取剧集的全部分集 */
export async function getEpisodes(session: EmbySession, seriesId: string): Promise<EmbyItem[]> {
  const q = new URLSearchParams({
    UserId: session.userId,
    Fields: 'Overview,RunTimeTicks,MediaSources,MediaStreams'
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
): Promise<{ url: string; playSessionId: string }> {
  // 直接取条目详情（带 MediaSources 字段）拿正确的媒体源 Id——
  // 部分魔改/网盘挂载服务器的 PlaybackInfo 返回空 MediaSources，条目详情却带得到
  const res = await request(
    session.serverUrl,
    `/Users/${session.userId}/Items/${itemId}?Fields=MediaSources,Path`,
    session.token
  )
  const data = await res.json()
  const source = data.MediaSources?.[0] as EmbyPlaybackSource | undefined
  const playSessionId = ''
  const sourceId: string = source?.Id ?? itemId

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
  return { url, playSessionId }
}

// Web 内置播放器（hls.js）用的设备配置
const WEB_DEVICE_PROFILE = {
  MaxStreamingBitrate: 120_000_000,
  DirectPlayProfiles: [
    {
      Container: 'mp4,m4v,mov,webm',
      Type: 'Video',
      VideoCodec: 'h264,hevc,vp8,vp9,av1',
      AudioCodec: 'aac,mp3,opus,flac,ac3,eac3'
    }
  ],
  TranscodingProfiles: [
    {
      Container: 'ts',
      Type: 'Video',
      VideoCodec: 'h264',
      AudioCodec: 'aac,mp3',
      Context: 'Streaming',
      Protocol: 'hls',
      MaxAudioChannels: '2',
      MinSegments: 1,
      BreakOnNonKeyFrames: true
    }
  ],
  ContainerProfiles: [],
  CodecProfiles: [],
  SubtitleProfiles: [{ Format: 'vtt', Method: 'External' }]
}

/** Web 内置播放器：PlaybackInfo 拿播放源 */
export async function getPlaybackInfo(
  session: EmbySession,
  itemId: string
): Promise<{ playSessionId: string; source: EmbyPlaybackSource | null }> {
  const res = await request(session.serverUrl, `/Items/${itemId}/PlaybackInfo?UserId=${session.userId}`, session.token, {
    method: 'POST',
    body: JSON.stringify({ DeviceProfile: WEB_DEVICE_PROFILE })
  })
  const data = await res.json()
  return { playSessionId: data.PlaySessionId ?? '', source: data.MediaSources?.[0] ?? null }
}

/** Web 内置播放器：解析播放地址（转码 HLS / 直连） */
export function resolvePlaybackUrl(
  source: EmbyPlaybackSource,
  session: EmbySession
): { url: string; type: 'hls' | 'direct' } {
  if (source.TranscodingUrl) {
    return { url: `${session.serverUrl}${source.TranscodingUrl}`, type: 'hls' }
  }
  const container = source.Container || 'mp4'
  const q = new URLSearchParams({ Static: 'true', MediaSourceId: source.Id, api_key: session.token })
  return { url: `${session.serverUrl}/Videos/${source.Id}/stream.${container}?${q}`, type: 'direct' }
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

/** 上报播放停止，回写观看进度（1 秒 = 10^7 ticks） */
export async function reportPlaybackStopped(
  session: EmbySession,
  itemId: string,
  positionTicks: number,
  playSessionId?: string
): Promise<void> {
  await request(session.serverUrl, '/Sessions/Playing/Stopped', session.token, {
    method: 'POST',
    body: JSON.stringify({ ItemId: itemId, PositionTicks: positionTicks, PlaySessionId: playSessionId })
  })
}
