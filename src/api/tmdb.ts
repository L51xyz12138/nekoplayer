// 文件源视频的元数据刮削（TMDB）。
// Emby/Jellyfin 由服务器自己刮削；文件浏览类源（本机/WebDAV/SMB/DLNA）无服务器，故由软件用 TMDB 自刮。
import type { Person } from '@/types/media'

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
    cast: []
  }

  // 拉详情 + 演职人员，丰富详情页（类型标签 / 背景图 / 演员 / 导演 / 相关推荐靠类型匹配）
  if (hit.id) {
    try {
      const dq = new URLSearchParams({
        api_key: cfg.key,
        language: cfg.lang,
        append_to_response: 'credits'
      })
      const dres = await fetch(`${cfg.apiBase}/${kind}/${hit.id}?${dq}`)
      if (dres.ok) {
        const d = (await dres.json()) as TmdbDetails
        if (d.tagline) result.tagline = d.tagline
        if (d.backdrop_path) result.backdropUrl = cfg.imgBase + d.backdrop_path
        if (Array.isArray(d.genres)) result.genres = d.genres.map((g) => g.name).filter(Boolean)
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
      }
    } catch {
      /* 详情失败不影响基础结果 */
    }
  }
  return result
}
