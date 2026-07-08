import { getMpvPlayback, reportPlaybackStart } from '@/api/emby'
import { useLibrary } from './useLibrary'
import { useSources } from './useSources'
import { useSettings } from './useSettings'
import type { Episode, MediaItem } from '@/types/media'

// NekoPlayer 为 Electron 优先：播放统一交给外部播放器（mpv/IINA/VLC/PotPlayer），无内置 web 播放器。
// 纯浏览器（无 window.nekoNative）下 play 静默返回。

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
async function playSeriesResume(item: MediaItem, player: string) {
  const { loadSeasons } = useLibrary()
  if (!item.seasons) await loadSeasons(item.id)
  const resume = resumeEpisodeOf(item)
  if (resume) playWith(item, resume, player)
}

/** 播放入口：Electron 下交给外部播放器（按设置的默认播放器）；剧集未指定集则播续看集 */
function play(item: MediaItem, episode?: Episode) {
  if (!window.nekoNative?.playMpv) return // 非 Electron：无内置播放器
  const player = useSettings().settings.playerMode
  if (item.type === 'series' && !episode) void playSeriesResume(item, player)
  else playWith(item, episode, player)
}

/** 用指定播放器播放（mpv/IINA/VLC/PotPlayer）；剧集带整季播放列表 */
function playWith(item: MediaItem, episode: Episode | undefined, player: string) {
  const native = window.nekoNative
  const s = useSources().sessionOf(item.sourceId)
  if (!native?.playMpv || !s) return
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
    .then((infos) => {
      const playItems = infos.map((r, i) => {
        const ep = queue[i]
        return { url: r.url, title: ep ? `${ep.episode}. ${ep.title}` : label }
      })
      const psid = infos[startAt].playSessionId || `neko${Date.now()}`
      const playItemId = queue.length ? queue[startAt].id : targetId
      if (player === 'mpv') {
        native.playMpv!(playItems, label, startAt, settings.playerPaths.mpv || '', startSec, {
          serverUrl: s.serverUrl,
          token: s.token,
          userId: s.userId,
          deviceId: localStorage.getItem('neko-device-id') || '',
          itemId: playItemId,
          playSessionId: psid
        })
      } else if (native.playExternal) {
        const key = player.toLowerCase()
        native.playExternal(key, playItems[startAt].url, settings.playerPaths[key] || '', startSec)
      }
      reportPlaybackStart(s, playItemId, psid).catch(() => {})
    })
    .catch((e) => console.error('[NekoPlayer] 取流失败：', e))
}

export function usePlayer() {
  return { play, playWith, resumeEpisodeOf }
}
