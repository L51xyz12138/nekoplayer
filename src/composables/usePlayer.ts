import { getMpvPlayback, reportPlaybackStart } from '@/api/emby'
import { TRAKT_CLIENT_ID } from '@/api/trakt'
import { useLibrary } from './useLibrary'
import { useSources } from './useSources'
import { useSettings } from './useSettings'
import { useTrakt } from './useTrakt'
import type { Episode, MediaItem } from '@/types/media'

// NekoPlayer 为 Electron 优先：播放统一交给外部播放器（mpv/IINA/VLC/PotPlayer），无内置 web 播放器。
// 纯浏览器（无 window.nekoNative）下 play 静默返回。

/** 详情页预选的音轨/字幕（仅 mpv 生效）；aid/sid 为 mpv 同类型轨道号，sid='no' 关字幕 */
export interface PlayTracks {
  aid?: number
  sid?: number | 'no'
  /** 外挂字幕直链（Emby/Jellyfin 服务器端外挂字幕）：mpv 用 --sub-file 加载、并由 sid 选中它 */
  subFile?: string
}

/** 传给主进程做 Trakt scrobble 的信息（仅 mpv、且已连接 Trakt、有可用 id 时才有值） */
export interface ScrobbleInfo {
  token: string
  clientId: string
  /** Trakt 条目体：{movie}|{show,episode}|{episode} */
  item: Record<string, unknown>
  /** 片长（秒）——mpv 拿不到时长时用它算进度% */
  runtime: number
}

// 文件源 → Trakt 条目体（电影用自身 tmdbId、剧集用剧的 tmdbId + 季集号）
function fileTraktItem(item: MediaItem, episode?: Episode): Record<string, unknown> | null {
  if (!item.tmdbId) return null
  if (episode) {
    return { show: { ids: { tmdb: item.tmdbId } }, episode: { season: episode.season, number: episode.episode } }
  }
  return { movie: { ids: { tmdb: item.tmdbId } } }
}
// Emby/Jellyfin → Trakt 条目体（用 getMpvPlayback 拿到的 ProviderIds）
function embyTraktItem(
  type: 'movie' | 'episode' | 'other',
  ids: { tmdb?: number; imdb?: string }
): Record<string, unknown> | null {
  if (ids.tmdb == null && !ids.imdb) return null
  if (type === 'movie') return { movie: { ids } }
  if (type === 'episode') return { episode: { ids } }
  return null
}
// 组装 scrobble：需已连接 Trakt（拿到有效 token，会自动刷新）+ 有可用条目 id，否则返回 undefined（不 scrobble）
async function buildScrobble(
  traktItem: Record<string, unknown> | null,
  runtimeMin: number
): Promise<ScrobbleInfo | undefined> {
  if (!traktItem) return undefined
  const token = await useTrakt().validToken()
  if (!token) return undefined
  return { token, clientId: TRAKT_CLIENT_ID, item: traktItem, runtime: Math.round((runtimeMin || 0) * 60) }
}

/**
 * 剧集续播目标集，多路兜底：
 * 1) nextUp（Emby Resume/NextUp 按最近活动算出的续看点，最准——避免选到早期的旧半看集）
 * 2) 有进度的集（0<progress<1） 3) 第一个没看过的集 4) 第一集
 */
function resumeEpisodeOf(item: MediaItem): Episode | undefined {
  const eps = item.seasons?.flatMap((s) => s.episodes) ?? []
  if (!eps.length) return undefined
  if (item.nextUp) {
    const byNextUp = eps.find((e) => e.id === item.nextUp!.episodeId)
    if (byNextUp) return byNextUp
  }
  return (
    eps.find((e) => (e.progress ?? 0) > 0 && (e.progress ?? 0) < 1) ||
    eps.find((e) => !e.watched) ||
    eps[0]
  )
}

// 剧集未指定集时：确保季集已加载，再播「续看的那集/第一集」
async function playSeriesResume(item: MediaItem, player: string, tracks?: PlayTracks) {
  const { loadSeasons } = useLibrary()
  if (!item.seasons) await loadSeasons(item.id)
  const resume = resumeEpisodeOf(item)
  if (resume) void playWith(item, resume, player, tracks)
}

/** 播放入口：Electron 下交给外部播放器（按设置的默认播放器）；剧集未指定集则播续看集 */
async function play(item: MediaItem, episode?: Episode, tracks?: PlayTracks) {
  if (!window.nekoNative?.playMpv) return // 非 Electron：无内置播放器
  // 本机存储视频：直接播文件，无服务器进度同步（但可 scrobble 到 Trakt）
  if (item.localPath) {
    const scrobble = await buildScrobble(fileTraktItem(item), item.runtime)
    playFile(item.localPath, item.title, undefined, tracks, scrobble, item.subtitles)
    return
  }
  const player = useSettings().settings.playerMode
  if (item.type === 'series' && !episode) void playSeriesResume(item, player, tracks)
  else void playWith(item, episode, player, tracks)
}

/** 用指定播放器播放（mpv/IINA/VLC/PotPlayer）；剧集带整季播放列表；tracks 为详情页预选音轨/字幕 */
async function playWith(item: MediaItem, episode: Episode | undefined, player: string, tracks?: PlayTracks) {
  const native = window.nekoNative
  if (!native?.playMpv) return
  // 文件源剧集分集：播分集文件
  if (episode?.localPath) {
    const scrobble = await buildScrobble(fileTraktItem(item, episode), episode.runtime || item.runtime)
    playFile(episode.localPath, `${item.title} · S${episode.season}E${episode.episode}`, player, tracks, scrobble, episode.subtitles)
    return
  }
  // 文件源电影：直接用指定播放器播文件（无服务器进度同步）
  if (item.localPath) {
    const scrobble = await buildScrobble(fileTraktItem(item), item.runtime)
    playFile(item.localPath, item.title, player, tracks, scrobble, item.subtitles)
    return
  }
  const s = useSources().sessionOf(item.sourceId)
  if (!s) return
  const { settings } = useSettings()
  const targetId = episode?.id ?? item.id
  const label = episode ? `${item.title} · S${episode.season}E${episode.episode}` : item.title

  const seasonEps = episode
    ? (item.seasons?.find((se) => se.season === episode.season)?.episodes ?? [])
    : []
  const queue =
    episode && item.type === 'series' && settings.autoNext && seasonEps.length ? seasonEps : []
  const startIdx = episode ? queue.findIndex((e) => e.id === episode.id) : -1
  const startAt = startIdx >= 0 ? startIdx : 0
  const targetIds = queue.length ? queue.map((e) => e.id) : [targetId]

  // 续播秒数：续看集优先用 nextUp（Resume 端点）的可靠位置——getEpisodes 在部分魔改 Emby 上不返回每集位置
  const startItem = queue.length ? queue[startAt] : (episode ?? item)
  const nu = item.nextUp
  const useNu = !!nu && startItem.id === nu.episodeId
  const posTicks = (useNu ? nu!.positionTicks : startItem.positionTicks) ?? 0
  const prog = (useNu ? nu!.progress : startItem.progress) ?? 0
  const startSec =
    posTicks > 0
      ? Math.floor(posTicks / 10_000_000)
      : Math.floor(prog * (startItem.runtime || 0) * 60)

  Promise.all(targetIds.map((id) => getMpvPlayback(s, id)))
    .then(async (infos) => {
      const playItems = infos.map((r, i) => {
        const ep = queue[i]
        return { url: r.url, title: ep ? `${ep.episode}. ${ep.title}` : label }
      })
      const psid = infos[startAt].playSessionId || `neko${Date.now()}`
      const playItemId = queue.length ? queue[startAt].id : targetId
      if (player === 'mpv') {
        // Trakt scrobble：用起播条目的 ProviderIds（tmdb/imdb）匹配
        const scrobble = await buildScrobble(
          embyTraktItem(infos[startAt].type, infos[startAt].ids),
          startItem.runtime
        )
        native.playMpv!(
          playItems,
          label,
          startAt,
          settings.playerPaths.mpv || '',
          startSec,
          {
            serverUrl: s.serverUrl,
            token: s.token,
            userId: s.userId,
            deviceId: localStorage.getItem('neko-device-id') || '',
            itemId: playItemId,
            playSessionId: psid,
            // 整季连播：各集 id（顺序与 playItems 一致）+ 起始索引，供 main 按当前播放集回传进度
            itemIds: targetIds,
            startIndex: startAt
          },
          tracks,
          scrobble
        )
      } else if (native.playExternal) {
        const key = player.toLowerCase()
        native.playExternal(key, playItems[startAt].url, settings.playerPaths[key] || '', startSec, tracks)
      }
      reportPlaybackStart(s, playItemId, psid).catch(() => {})
    })
    .catch((e) => console.error('[NekoPlayer] 取流失败：', e))
}

/** 播放本机/文件浏览类源的文件（外部播放器，无服务器进度同步）；player 省略则用默认播放器；
 * tracks 仅 mpv 生效；scrobble 仅 mpv、已连接 Trakt 时有值 */
function playFile(
  filePath: string,
  title: string,
  player?: string,
  tracks?: PlayTracks,
  scrobble?: ScrobbleInfo,
  subs?: string[]
) {
  const native = window.nekoNative
  if (!native?.playMpv) return
  const { settings } = useSettings()
  player = player || settings.playerMode
  // 从本地记录的上次位置续播（文件源无服务器进度，靠 useLibrary 的本地进度）
  const startSec = useLibrary().fileResumeSec(filePath)
  if (player === 'mpv') {
    // subs 可能是 Vue 响应式数组，直接过 IPC 会报「object could not be cloned」→ 展开成普通数组再传
    const subList = subs && subs.length ? [...subs] : undefined
    // 末位 filePath 作 fileKey：mpv 退出时按它回传进度，用于「继续观看」/续播；subList=同名外挂字幕
    native.playMpv([{ url: filePath, title }], title, 0, settings.playerPaths.mpv || '', startSec, undefined, tracks, scrobble, filePath, subList)
  } else if (native.playExternal) {
    const key = player.toLowerCase()
    native.playExternal(key, filePath, settings.playerPaths[key] || '', startSec, tracks)
  }
}

export function usePlayer() {
  return { play, playWith, playFile, resumeEpisodeOf }
}
