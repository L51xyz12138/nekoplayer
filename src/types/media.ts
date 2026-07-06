export type MediaType = 'movie' | 'series'

export type SortMode = 'recent' | 'title' | 'rating' | 'year'

export type LibraryCategory = 'all' | 'movie' | 'series' | 'favorite'

export interface Person {
  id: string
  name: string
  /** 角色名（演员）或职务（导演/编剧） */
  role: string
  kind: 'actor' | 'director' | 'writer'
  /** 真实头像 URL */
  avatarUrl?: string
}

export interface Episode {
  id: string
  season: number
  episode: number
  title: string
  /** 单集时长（分钟） */
  runtime: number
  overview: string
  /** 观看进度 0-1 */
  progress?: number
  /** 生成缩略图的种子 */
  stillSeed: string
  /** 真实缩略图 URL（来自媒体服务器） */
  stillUrl?: string
}

export interface Season {
  season: number
  title: string
  episodes: Episode[]
}

export interface MediaItem {
  id: string
  /** 所属媒体源 id */
  sourceId: string
  title: string
  type: MediaType
  year: number
  /** 电影时长；剧集为单集平均（分钟） */
  runtime: number
  /** 评分 0-10 */
  rating: number
  /** 分级，如 PG-13 / TV-MA */
  certification: string
  genres: string[]
  overview: string
  tagline?: string
  cast: Person[]
  /** 继续观看进度 0-1 */
  progress?: number
  favorite?: boolean
  /** 时间戳，用于「最近添加」排序 */
  addedAt: number
  /** 仅剧集拥有 */
  seasons?: Season[]
  /** 文件与画质等技术信息 */
  tech?: MediaTech
  /** 真实海报图 URL（来自媒体服务器；无则回退到 SVG 占位） */
  posterUrl?: string
  /** 真实背景图 URL */
  backdropUrl?: string
}

/** 媒体文件技术信息 */
export interface MediaTech {
  resolution: string
  quality: string
  dynamicRange: string
  videoCodec: string
  audioCodec: string
  fileSize: string
  bitrate: string
  container: string
  filePath: string
  /** 可切换的分辨率版本 */
  resolutions: string[]
  /** 可切换的音轨 */
  audioTracks: string[]
}
