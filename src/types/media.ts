export type MediaType = 'movie' | 'series' | 'collection'

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
  /** 文件源分集的可播路径（有则为本地/网络文件分集，直接外部播放器播） */
  localPath?: string
  /** 文件源分集所在文件夹（供文件夹视图） */
  folder?: string
  /** 观看进度 0-1 */
  progress?: number
  /** 续播位置（Emby ticks，1 秒=10^7）；比 progress 精确，用于 seek */
  positionTicks?: number
  /** 是否已看完 */
  watched?: boolean
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

/** 剧集「下一集待看」的轻量信息（来自 Emby NextUp，无需加载整季即可展示/续播） */
export interface NextUpEpisode {
  episodeId: string
  season: number
  episode: number
  title: string
  /** 该集已观看进度 0-1（新的一集为空） */
  progress?: number
  /** 续播位置（Emby ticks）——来自 Resume 端点，比 getEpisodes 可靠 */
  positionTicks?: number
  stillUrl?: string
}

export interface MediaItem {
  id: string
  /** 所属媒体源 id */
  sourceId: string
  /** 所属服务器媒体库 id（`serverId:viewId`），来自服务器自带分类；聚合全库时可能为空 */
  libraryId?: string
  /** 媒体库显示名（服务器上的库名，如「电影」「动漫」） */
  libraryName?: string
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
  /** 续播位置（Emby ticks，1 秒=10^7）；比 progress 精确，用于 seek */
  positionTicks?: number
  /** 是否已看完（电影；剧集看 nextUp 是否存在判断是否追完） */
  watched?: boolean
  /** 剧集下一集待看（来自 Emby /Shows/NextUp）；无则表示已追完或未开始 */
  nextUp?: NextUpEpisode
  favorite?: boolean
  /** 时间戳，用于「最近添加」排序 */
  addedAt: number
  /** 最近一次播放的时间戳，用于「继续观看」按最近排序 */
  lastPlayed?: number
  /** 仅剧集拥有 */
  seasons?: Season[]
  /** 文件与画质等技术信息 */
  tech?: MediaTech
  /** 真实海报图 URL（来自媒体服务器；无则回退到 SVG 占位） */
  posterUrl?: string
  /** 真实背景图 URL */
  backdropUrl?: string
  /** 本机存储类源的视频文件绝对路径；有则为本地视频（用外部播放器直接播、封面走 mpv 抽帧） */
  localPath?: string
  /** 文件源视频在源内的相对文件夹（'/' 分隔，根为 ''），供文件夹层级浏览 */
  folder?: string
  /** 文件源视频已成功刮削到 TMDB 元数据（有则展示海报/年份/评分，无则展示缩略图） */
  scraped?: boolean
  /** 文件源剧集分集信息（从文件名解析）；有则该文件是某剧的一集，会被聚合成剧集 */
  episodeInfo?: { show: string; season: number; episode: number; epTitle: string }
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
