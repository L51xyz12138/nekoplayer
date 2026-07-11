// 文件源视频的元数据刮削（TMDB）。
// Emby/Jellyfin 由服务器自己刮削；文件浏览类源（本机/WebDAV/SMB/DLNA）无服务器，故由软件用 TMDB 自刮。
import type { MediaItem, Person } from '@/types/media'

export interface TmdbConfig {
  key: string
  lang: string
  apiBase: string
  imgBase: string
}

export interface ScrapeResult {
  type: 'movie' | 'series'
  title: string
  year: number
  posterUrl?: string
  backdropUrl?: string
  rating: number
  overview: string
  tagline?: string
  genres: string[]
  cast: Person[]
  /** TMDB 条目 id（剧集用它再拉每季分集名/简介/剧照） */
  tmdbId?: number
  /** 电影所属 TMDB 系列（belongs_to_collection）——把散落的系列电影聚合成合集，不依赖文件夹 */
  collection?: { id: number; name: string; posterUrl?: string; backdropUrl?: string }
}

/** 「重新匹配」时的候选项（多个匹配让用户选） */
export interface TmdbCandidate {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  year: number
  posterUrl?: string
  rating: number
  overview: string
}

/** 海报用 w500 够了，但背景图铺满详情页需要更高分辨率 → 把尺寸段换成 w1280，避免模糊 */
function backdropBase(imgBase: string): string {
  return imgBase.replace(/w\d+(\/?)$/, 'w1280$1')
}
/** 分集剧照（16:9）用 w300 即可，比海报的 w500 更贴合小卡片 */
function stillBase(imgBase: string): string {
  return imgBase.replace(/w\d+(\/?)$/, 'w300$1')
}

const VIDEO_EXT_RE =
  /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m2ts|mpg|mpeg|rmvb|rm|3gp|vob|ogv|divx|f4v|mts)$/i
// 出现即认为其后是画质/发布信息，标题取其之前
const TAG_RE =
  /\b(19\d{2}|20\d{2})\b|\bS\d{1,2}E\d{1,2}\b|1080p|2160p|720p|480p|4k|blu-?ray|web-?dl|webrip|hd(?:tv|rip)|bdrip|x26[45]|hevc|h\.?26[45]|hdr|remux|dts|aac|ddp?5|10bit|repack|proper/i

/** 清洗成可读标题：截到画质/发布标签前、点下划线转空格、去括号 */
function cleanTitle(s: string): string {
  const cut = s.search(TAG_RE)
  if (cut > 0) s = s.slice(0, cut)
  return s
    .replace(/[._]+/g, ' ')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 从文件名解析出搜索用「标题 / 年份 / 是否剧集」 */
export function parseFilename(name: string): { query: string; year?: number; isTv: boolean } {
  const s = name.replace(VIDEO_EXT_RE, '')
  const isTv = /\bS\d{1,2}E\d{1,2}\b/i.test(s) || /第\s*[\d一二三四五六七八九十百零]+\s*[季集]/.test(s)
  const ym = s.match(/\b(19\d{2}|20\d{2})\b/)
  const year = ym ? parseInt(ym[1], 10) : undefined
  return { query: cleanTitle(s), year, isTv }
}

/** 从文件名解析剧集信息（剧名/季/集）；非剧集返回 null。供把分集聚合成剧集 */
export function parseEpisode(
  name: string
): { show: string; season: number; episode: number; epTitle: string } | null {
  const s = name.replace(VIDEO_EXT_RE, '')
  // SxxExx（最可靠）
  let m = s.match(/^(.*?)[.\s_-]*S(\d{1,2})[.\s_-]*E(\d{1,3})(.*)$/i)
  if (m && cleanTitle(m[1])) {
    return { show: cleanTitle(m[1]), season: +m[2], episode: +m[3], epTitle: cleanTitle(m[4]) }
  }
  // 中文：第x季…第x集/话
  m = s.match(/^(.*?)第\s*(\d+)\s*季[\s\S]*?第\s*(\d+)\s*[集话]/)
  if (m && cleanTitle(m[1])) return { show: cleanTitle(m[1]), season: +m[2], episode: +m[3], epTitle: '' }
  // 中文：第x集/话（默认第 1 季）
  m = s.match(/^(.*?)第\s*(\d+)\s*[集话]/)
  if (m && cleanTitle(m[1])) return { show: cleanTitle(m[1]), season: 1, episode: +m[2], epTitle: '' }
  // EPxx / E xx（默认第 1 季；EP 允许到 4 位，如 One Piece EP1080）
  m = s.match(/^(.*?)[.\s_-]*EP\s*(\d{1,4})\b(.*)$/i)
  if (m && cleanTitle(m[1])) return { show: cleanTitle(m[1]), season: 1, episode: +m[2], epTitle: cleanTitle(m[3]) }
  // 动漫常见：剧名 - 05 / 剧名 - 05 [1080p]（空格-连字符-空格-数字，要 2~4 位避免误伤单数字续集）
  m = s.match(/^(.*?)\s[-—]\s(\d{2,4})(?=\s|\[|_|v\d|$)/i)
  if (m && cleanTitle(m[1])) return { show: cleanTitle(m[1]), season: 1, episode: +m[2], epTitle: '' }
  // 方括号集数：剧名 [05] / 剧名【05】（纯数字，避开 [1080p] 这类含字母的）
  m = s.match(/^(.*?)[[【]\s*(\d{1,4})\s*[\]】]/)
  if (m && cleanTitle(m[1])) return { show: cleanTitle(m[1]), season: 1, episode: +m[2], epTitle: '' }
  return null
}

interface TmdbItem {
  id?: number
  media_type?: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  vote_average?: number
  overview?: string
}

interface TmdbPerson {
  id: number
  name: string
  character?: string
  job?: string
  profile_path?: string | null
}
interface TmdbDetails {
  tagline?: string
  backdrop_path?: string | null
  genres?: { id: number; name: string }[]
  credits?: { cast?: TmdbPerson[]; crew?: TmdbPerson[] }
  /** 电影专属：所属系列（三部曲/系列电影）。剧集无此字段 */
  belongs_to_collection?: {
    id: number
    name: string
    poster_path?: string | null
    backdrop_path?: string | null
  } | null
}

/** 刮削单个文件名（forceTv=true 强制按剧集搜，用于已聚合的剧）→ 命中返回元数据，否则 null */
export async function scrapeMedia(
  cfg: TmdbConfig,
  name: string,
  forceTv = false
): Promise<ScrapeResult | null> {
  const parsed = parseFilename(name)
  const { query, year } = parsed
  const isTv = forceTv || parsed.isTv
  // 需有 Key、至少 2 个有效字符、且含字母/汉字——纯数字（如 DLNA 的 "26"）会乱匹配成「26 Men」，直接跳过
  if (!cfg.key || query.replace(/[^\p{L}\p{N}]/gu, '').length < 2 || !/\p{L}/u.test(query)) return null

  const path = isTv ? '/search/tv' : '/search/multi'
  const q = new URLSearchParams({
    api_key: cfg.key,
    language: cfg.lang,
    query,
    include_adult: 'false'
  })
  if (year) q.set(isTv ? 'first_air_date_year' : 'year', String(year))

  let data: { results?: TmdbItem[] }
  try {
    const res = await fetch(`${cfg.apiBase}${path}?${q}`)
    if (!res.ok) return null
    data = await res.json()
  } catch {
    return null
  }

  const hit = (data.results ?? []).find(
    (r) =>
      (r.media_type ? r.media_type === 'movie' || r.media_type === 'tv' : true) &&
      !!(r.title || r.name)
  )
  if (!hit) return null

  const isTvHit = isTv || hit.media_type === 'tv' || (!!hit.name && !hit.title)
  const kind = isTvHit ? 'tv' : 'movie'
  const date = hit.release_date || hit.first_air_date || ''
  const result: ScrapeResult = {
    type: isTvHit ? 'series' : 'movie',
    title: hit.title || hit.name || query,
    year: date ? parseInt(date.slice(0, 4), 10) || year || 0 : year || 0,
    posterUrl: hit.poster_path ? cfg.imgBase + hit.poster_path : undefined,
    rating: hit.vote_average ? Math.round(hit.vote_average * 10) / 10 : 0,
    overview: hit.overview || '',
    genres: [],
    cast: [],
    tmdbId: hit.id
  }

  // 拉详情 + 演职人员，丰富详情页（类型标签 / 背景图 / 演员 / 导演 / 相关推荐靠类型匹配）
  if (hit.id) await enrichFromDetails(cfg, kind, hit.id, result)
  return result
}

/** 拉某条 TMDB 详情 + 演职人员，填进 result（tagline/背景图/类型/演员/导演）。搜索与重新匹配共用。 */
async function enrichFromDetails(
  cfg: TmdbConfig,
  kind: 'movie' | 'tv',
  id: number,
  result: ScrapeResult
): Promise<void> {
  try {
    const dq = new URLSearchParams({ api_key: cfg.key, language: cfg.lang, append_to_response: 'credits' })
    const dres = await fetch(`${cfg.apiBase}/${kind}/${id}?${dq}`)
    if (!dres.ok) return
    const d = (await dres.json()) as TmdbDetails
    if (d.tagline) result.tagline = d.tagline
    if (d.backdrop_path) result.backdropUrl = backdropBase(cfg.imgBase) + d.backdrop_path
    if (Array.isArray(d.genres)) result.genres = d.genres.map((g) => g.name).filter(Boolean)
    // 电影所属系列（belongs_to_collection）→ 供按媒体信息聚合系列电影为合集
    if (kind === 'movie' && d.belongs_to_collection) {
      const bc = d.belongs_to_collection
      result.collection = {
        id: bc.id,
        name: bc.name,
        posterUrl: bc.poster_path ? cfg.imgBase + bc.poster_path : undefined,
        backdropUrl: bc.backdrop_path ? backdropBase(cfg.imgBase) + bc.backdrop_path : undefined
      }
    }
    const actors: Person[] = (d.credits?.cast ?? []).slice(0, 12).map((c) => ({
      id: String(c.id),
      name: c.name,
      role: c.character || '',
      kind: 'actor',
      avatarUrl: c.profile_path ? cfg.imgBase + c.profile_path : undefined
    }))
    const dir = (d.credits?.crew ?? []).find((c) => c.job === 'Director')
    result.cast = dir
      ? [
          {
            id: String(dir.id),
            name: dir.name,
            role: '导演',
            kind: 'director',
            avatarUrl: dir.profile_path ? cfg.imgBase + dir.profile_path : undefined
          },
          ...actors
        ]
      : actors
  } catch {
    /* 详情失败不影响基础结果 */
  }
}

/** 按名字搜 TMDB，返回多个候选（供「重新匹配」里手动选正确的那个）。 */
export async function searchTmdb(
  cfg: TmdbConfig,
  query: string,
  isTv: boolean
): Promise<TmdbCandidate[]> {
  if (!cfg.key || !query.trim()) return []
  const path = isTv ? '/search/tv' : '/search/multi'
  const q = new URLSearchParams({ api_key: cfg.key, language: cfg.lang, query, include_adult: 'false' })
  try {
    const res = await fetch(`${cfg.apiBase}${path}?${q}`)
    if (!res.ok) return []
    const data = (await res.json()) as { results?: TmdbItem[] }
    return (data.results ?? [])
      .filter(
        (r) => (r.media_type ? r.media_type === 'movie' || r.media_type === 'tv' : true) && !!(r.title || r.name)
      )
      .slice(0, 8)
      .map((r) => {
        const mt: 'movie' | 'tv' = isTv || r.media_type === 'tv' || (!!r.name && !r.title) ? 'tv' : 'movie'
        const date = r.release_date || r.first_air_date || ''
        return {
          id: r.id!,
          mediaType: mt,
          title: r.title || r.name || query,
          year: date ? parseInt(date.slice(0, 4), 10) || 0 : 0,
          posterUrl: r.poster_path ? cfg.imgBase + r.poster_path : undefined,
          rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : 0,
          overview: r.overview || ''
        }
      })
  } catch {
    return []
  }
}

/** 剧集的某一季（选季用） */
export interface TmdbSeason {
  seasonNumber: number
  name: string
  posterUrl?: string
  overview: string
  year: number
  episodeCount: number
}

/** 取某剧集的季列表（编辑元数据时多季可选）。只返回正片季（排除 season 0 特别篇）。 */
export async function getTvSeasons(cfg: TmdbConfig, tvId: number): Promise<TmdbSeason[]> {
  try {
    const q = new URLSearchParams({ api_key: cfg.key, language: cfg.lang })
    const d = await fetch(`${cfg.apiBase}/tv/${tvId}?${q}`).then((r) => r.json())
    return (d.seasons ?? [])
      .filter((s: { season_number?: number }) => (s.season_number ?? 0) >= 1)
      .map((s: {
        season_number: number
        name?: string
        poster_path?: string | null
        overview?: string
        air_date?: string
        episode_count?: number
      }) => ({
        seasonNumber: s.season_number,
        name: s.name || `第 ${s.season_number} 季`,
        posterUrl: s.poster_path ? cfg.imgBase + s.poster_path : undefined,
        overview: s.overview || '',
        year: s.air_date ? parseInt(s.air_date.slice(0, 4), 10) || 0 : 0,
        episodeCount: s.episode_count || 0
      }))
  } catch {
    return []
  }
}

/** 剧集某一季的一集（真实集名/简介/剧照） */
export interface TmdbEpisode {
  episode: number
  title: string
  overview: string
  stillUrl?: string
  runtime: number
}

/** 拉某剧某季的分集列表（真实集名/简介/剧照/时长），供文件源分集补名。按 episode_number 索引。 */
export async function getTvEpisodes(
  cfg: TmdbConfig,
  tvId: number,
  season: number
): Promise<TmdbEpisode[]> {
  try {
    const q = new URLSearchParams({ api_key: cfg.key, language: cfg.lang })
    const d = await fetch(`${cfg.apiBase}/tv/${tvId}/season/${season}?${q}`).then((r) => r.json())
    const still = stillBase(cfg.imgBase)
    return (d.episodes ?? [])
      .filter((e: { episode_number?: number }) => e.episode_number != null)
      .map((e: {
        episode_number: number
        name?: string
        overview?: string
        still_path?: string | null
        runtime?: number
      }) => ({
        episode: e.episode_number,
        title: e.name || '',
        overview: e.overview || '',
        stillUrl: e.still_path ? still + e.still_path : undefined,
        runtime: e.runtime || 0
      }))
  } catch {
    return []
  }
}

/** 按选中的候选项拉完整元数据（含详情 + 演职人员）。 */
export async function scrapeById(cfg: TmdbConfig, cand: TmdbCandidate): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    type: cand.mediaType === 'tv' ? 'series' : 'movie',
    title: cand.title,
    year: cand.year,
    posterUrl: cand.posterUrl,
    rating: cand.rating,
    overview: cand.overview,
    genres: [],
    cast: [],
    tmdbId: cand.id
  }
  await enrichFromDetails(cfg, cand.mediaType, cand.id, result)
  return result
}

/** 取某演职人员的 TMDB 参演作品（文件源「发现作品」用；仅展示，不在库、不可播）。
 * 按人气去重排序，映射为轻量 MediaItem（有海报/标题/年份/评分）。 */
export async function getPersonCredits(personId: string, cfg: TmdbConfig): Promise<MediaItem[]> {
  try {
    const url = `${cfg.apiBase}/person/${personId}/combined_credits?api_key=${cfg.key}&language=${cfg.lang}`
    const d = await fetch(url).then((r) => r.json())
    const cast = Array.isArray(d.cast) ? d.cast : []
    const seen = new Set<number>()
    const works: MediaItem[] = []
    for (const c of cast.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))) {
      if (!c.id || seen.has(c.id)) continue
      seen.add(c.id)
      const title = c.title || c.name || ''
      if (!title) continue
      const isTv = c.media_type === 'tv'
      const date = c.release_date || c.first_air_date || ''
      works.push({
        id: `tmdb-person-work:${c.media_type}:${c.id}`,
        sourceId: '',
        title,
        type: isTv ? 'series' : 'movie',
        year: date ? parseInt(date.slice(0, 4), 10) || 0 : 0,
        runtime: 0,
        rating: c.vote_average || 0,
        certification: '',
        genres: [],
        overview: c.overview || '',
        cast: [],
        addedAt: 0,
        posterUrl: c.poster_path ? cfg.imgBase + c.poster_path : undefined,
        // 带上 TMDB id，供「发现作品」页把已入库的同一作品换成库内真实条目（可点开、有文件信息）
        tmdbId: c.id,
        scraped: true
      })
      if (works.length >= 40) break
    }
    return works
  } catch {
    return []
  }
}
