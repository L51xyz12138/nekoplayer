import type { Episode, MediaItem, MediaTech, NextUpEpisode, Person, Season } from '@/types/media'
import { imageUrl, type EmbyItem, type EmbyPerson, type EmbySession } from './emby'

const TICKS_PER_MINUTE = 600_000_000 // 1 分钟 = 6e8 个 100ns tick

/** 稳健地算进度 0-1：优先 PlayedPercentage，缺失时用 位置/时长（魔改 Emby 常不给百分比，但恒有 PlaybackPositionTicks） */
export function progressOf(userData: EmbyItem['UserData'], runTimeTicks?: number): number | undefined {
  const pct = userData?.PlayedPercentage
  if (pct && pct > 0 && pct < 100) return pct / 100
  const pos = userData?.PlaybackPositionTicks ?? 0
  if (pos > 0 && runTimeTicks && runTimeTicks > 0) return Math.min(0.999, pos / runTimeTicks)
  return undefined
}

function mapPeople(people: EmbyPerson[] | undefined, serverUrl: string): Person[] {
  if (!people) return []
  return people.slice(0, 12).map((p) => ({
    id: p.Id ?? p.Name,
    name: p.Name,
    role: p.Role || (p.Type === 'Director' ? '导演' : p.Type === 'Writer' ? '编剧' : '演员'),
    kind: p.Type === 'Director' ? 'director' : p.Type === 'Writer' ? 'writer' : 'actor',
    avatarUrl: p.Id ? imageUrl(serverUrl, p.Id, 'Primary', p.PrimaryImageTag, 300) : undefined
  }))
}

function qualityLabel(height?: number): string {
  if (!height) return 'SD'
  if (height >= 2000) return '4K'
  if (height >= 1000) return '1080P'
  if (height >= 700) return '720P'
  return '480P'
}

function formatSize(bytes?: number): string {
  if (!bytes) return '—'
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

function mapTech(item: EmbyItem): MediaTech | undefined {
  const source = item.MediaSources?.[0]
  const streams = source?.MediaStreams ?? item.MediaStreams
  if (!streams?.length) return undefined

  const video = streams.find((s) => s.Type === 'Video')
  const audios = streams.filter((s) => s.Type === 'Audio')
  const quality = qualityLabel(video?.Height)
  const range = video?.DisplayTitle?.includes('Dolby Vision')
    ? 'Dolby Vision'
    : video?.DisplayTitle?.includes('HDR')
      ? 'HDR'
      : 'SDR'

  return {
    resolution: video?.Width && video?.Height ? `${video.Width} × ${video.Height}` : '未知',
    quality,
    dynamicRange: range,
    videoCodec: video?.Codec?.toUpperCase() ?? '未知',
    audioCodec: audios[0]?.DisplayTitle ?? audios[0]?.Codec?.toUpperCase() ?? '未知',
    fileSize: formatSize(source?.Size),
    bitrate: source?.Bitrate ? `${Math.round(source.Bitrate / 1_000_000)} Mbps` : '—',
    container: source?.Container?.toUpperCase() ?? '未知',
    filePath: source?.Path ?? '',
    resolutions: [quality],
    audioTracks: audios.map((a) => a.DisplayTitle || a.Language || a.Codec || '音轨').slice(0, 6)
  }
}

/** 把 Emby Item 映射为应用内部的 MediaItem */
export function mapEmbyItem(item: EmbyItem, session: EmbySession): MediaItem {
  const type: MediaItem['type'] =
    item.Type === 'Series' ? 'series' : item.Type === 'BoxSet' ? 'collection' : 'movie'
  const primaryTag = item.ImageTags?.Primary
  const backdropTag = item.BackdropImageTags?.[0]

  // 从 ProviderIds 取 TMDB id（键名大小写因服务器而异）→ 供 Trakt 列表匹配库内条目
  const pids = item.ProviderIds ?? {}
  const tmdbKey = Object.keys(pids).find((k) => k.toLowerCase() === 'tmdb')
  const tmdbId = tmdbKey && /^\d+$/.test(pids[tmdbKey]) ? Number(pids[tmdbKey]) : undefined

  return {
    id: item.Id,
    sourceId: session.serverId,
    title: item.Name,
    type,
    tmdbId,
    year: item.ProductionYear ?? 0,
    runtime: item.RunTimeTicks ? Math.round(item.RunTimeTicks / TICKS_PER_MINUTE) : 0,
    rating: item.CommunityRating ? Math.round(item.CommunityRating * 10) / 10 : 0,
    certification: item.OfficialRating ?? '',
    genres: item.Genres ?? [],
    overview: item.Overview ?? '',
    tagline: item.Taglines?.[0],
    cast: mapPeople(item.People, session.serverUrl),
    favorite: item.UserData?.IsFavorite,
    watched: item.UserData?.Played,
    progress: progressOf(item.UserData, item.RunTimeTicks),
    positionTicks: item.UserData?.PlaybackPositionTicks || undefined,
    addedAt: item.DateCreated ? Date.parse(item.DateCreated) : Date.now(),
    lastPlayed: item.UserData?.LastPlayedDate ? Date.parse(item.UserData.LastPlayedDate) : undefined,
    tech: mapTech(item),
    posterUrl: imageUrl(session.serverUrl, item.Id, 'Primary', primaryTag, 600),
    // 背景图铺满详情页 hero，1280 在大屏会被拉糊 → 要更高分辨率
    backdropUrl: imageUrl(session.serverUrl, item.Id, 'Backdrop', backdropTag, 1920)
  }
}

/** 把 Emby NextUp 分集映射为轻量的「下一集待看」信息 */
export function mapNextUp(e: EmbyItem, session: EmbySession): NextUpEpisode {
  return {
    episodeId: e.Id,
    season: e.ParentIndexNumber ?? 1,
    episode: e.IndexNumber ?? 0,
    title: e.Name,
    progress: progressOf(e.UserData, e.RunTimeTicks),
    positionTicks: e.UserData?.PlaybackPositionTicks || undefined,
    stillUrl: imageUrl(session.serverUrl, e.Id, 'Primary', e.ImageTags?.Primary, 480)
  }
}

/** 把 Emby 分集列表按季分组为 Season[] */
export function mapEpisodes(episodes: EmbyItem[], session: EmbySession): Season[] {
  const bySeason = new Map<number, Episode[]>()

  for (const e of episodes) {
    const seasonNum = e.ParentIndexNumber ?? 1
    const ep: Episode = {
      id: e.Id,
      season: seasonNum,
      episode: e.IndexNumber ?? 0,
      title: e.Name,
      runtime: e.RunTimeTicks ? Math.round(e.RunTimeTicks / TICKS_PER_MINUTE) : 0,
      overview: e.Overview ?? '',
      progress: progressOf(e.UserData, e.RunTimeTicks),
      positionTicks: e.UserData?.PlaybackPositionTicks || undefined,
      watched: e.UserData?.Played,
      stillSeed: e.Id,
      stillUrl: imageUrl(session.serverUrl, e.Id, 'Primary', e.ImageTags?.Primary, 480)
    }
    if (!bySeason.has(seasonNum)) bySeason.set(seasonNum, [])
    bySeason.get(seasonNum)!.push(ep)
  }

  return [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, eps]) => ({
      season,
      title: `第 ${season} 季`,
      episodes: eps.sort((a, b) => a.episode - b.episode)
    }))
}
