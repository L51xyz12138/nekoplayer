import { computed, reactive, toRefs } from 'vue'
import {
  getMpvPlayback,
  getPlaybackInfo,
  reportPlaybackStart,
  reportPlaybackStopped,
  resolvePlaybackUrl
} from '@/api/emby'
import { useLibrary } from './useLibrary'
import { useSources } from './useSources'
import { useSettings } from './useSettings'
import type { Episode, MediaItem } from '@/types/media'

interface PlayerState {
  current: MediaItem | null
  episode: Episode | null
  isOpen: boolean
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  rate: number
  subtitle: string
  audio: string
  quality: string
  availableQualities: string[]
  availableAudios: string[]
  streamUrl: string
  streamType: 'hls' | 'direct' | ''
  /** 是否真实流播放（false 时用演示模拟） */
  live: boolean
  buffering: boolean
  error: string
  playSessionId: string
}

// 模块级单例：任意页面共享同一个播放器
const state = reactive<PlayerState>({
  current: null,
  episode: null,
  isOpen: false,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  rate: 1,
  subtitle: '简体中文',
  audio: '',
  quality: '',
  availableQualities: [],
  availableAudios: [],
  streamUrl: '',
  streamType: '',
  live: false,
  buffering: false,
  error: '',
  playSessionId: ''
})

// 真实播放时挂载的 <video>（由 PlayerOverlay 注册）
let videoEl: HTMLVideoElement | null = null
let timer: ReturnType<typeof setInterval> | undefined

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

// 演示数据的模拟推进
function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    if (!state.playing) return
    state.currentTime = Math.min(state.duration, state.currentTime + state.rate)
    if (state.currentTime >= state.duration) {
      state.playing = false
      stopTimer()
    }
  }, 1000)
}

function persistProgress() {
  if (!state.current || state.duration <= 0) return
  const p = Math.min(0.999, state.currentTime / state.duration)
  if (state.episode) state.episode.progress = p
  else state.current.progress = p
}

// ---------- 真实 <video> 接入 ----------
function registerVideo(el: HTMLVideoElement) {
  videoEl = el
  videoEl.volume = state.muted ? 0 : state.volume
  videoEl.muted = state.muted
  videoEl.playbackRate = state.rate
}
function unregisterVideo() {
  videoEl = null
}
function onVideoTime() {
  if (videoEl) state.currentTime = videoEl.currentTime
}
function onVideoLoaded() {
  if (videoEl && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
    state.duration = videoEl.duration
  }
}
function onVideoPlay() {
  state.playing = true
}
function onVideoPause() {
  state.playing = false
}
function onVideoWaiting() {
  state.buffering = true
}
function onVideoPlaying() {
  state.buffering = false
  state.playing = true
}
function onVideoEnded() {
  state.playing = false
  if (hasNext.value) next()
}

// ---------- 取流 ----------
async function loadStream(item: MediaItem, episode?: Episode) {
  state.streamUrl = ''
  state.streamType = ''
  state.live = false
  state.error = ''

  const s = useSources().sessionOf(item.sourceId)
  if (!s) {
    startTimer() // 无会话：模拟播放
    return
  }

  const targetId = episode?.id ?? item.id
  state.buffering = true
  try {
    const { source, playSessionId } = await getPlaybackInfo(s, targetId)
    if (!source) throw new Error('没有可用的播放源')
    state.playSessionId = playSessionId
    const { url, type } = resolvePlaybackUrl(source, s)
    state.streamUrl = url
    state.streamType = type
    state.live = true
  } catch (e) {
    state.error = e instanceof Error ? e.message : '获取播放地址失败'
    state.live = false
    startTimer() // 回退模拟，至少保证 UI 可用
  } finally {
    state.buffering = false
  }
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
async function playSeriesResume(item: MediaItem, player: string) {
  const { loadSeasons } = useLibrary()
  if (!item.seasons) await loadSeasons(item.id)
  const resume = resumeEpisodeOf(item)
  if (resume) playWith(item, resume, player)
}

function play(item: MediaItem, episode?: Episode) {
  // Electron：交给外部播放器（按设置的默认播放器）
  const isElectron = !!window.nekoNative?.playMpv
  if (isElectron) {
    const player = useSettings().settings.playerMode
    if (item.type === 'series' && !episode) void playSeriesResume(item, player)
    else playWith(item, episode, player)
    return
  }

  stopTimer()
  state.current = item
  state.episode = episode ?? null
  const runtimeMin = episode?.runtime ?? item.runtime
  state.duration = Math.max(60, runtimeMin * 60)
  const startP = episode ? episode.progress ?? 0 : item.progress ?? 0
  state.currentTime = startP * state.duration

  const tech = item.tech
  state.availableQualities = tech?.resolutions?.length ? [...tech.resolutions] : ['自动']
  state.availableAudios = tech?.audioTracks?.length ? [...tech.audioTracks] : ['默认音轨']
  state.quality = state.availableQualities[0]
  state.audio = state.availableAudios[0]

  state.isOpen = true
  state.playing = true
  loadStream(item, episode)
}

/** 直接用 IINA 打开播放（外部播放器） */
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

function togglePlay() {
  if (state.live && videoEl) {
    if (videoEl.paused) videoEl.play().catch(() => {})
    else videoEl.pause()
  } else {
    state.playing = !state.playing
    if (state.playing) startTimer()
  }
}

function reportProgressToServer() {
  if (!state.live || !state.current) return
  const s = useSources().sessionOf(state.current.sourceId)
  if (!s) return
  const itemId = state.episode?.id ?? state.current.id
  const positionTicks = Math.round(state.currentTime * 10_000_000)
  reportPlaybackStopped(s, itemId, positionTicks, state.playSessionId).catch((e) =>
    console.warn('[NekoPlayer] 进度同步失败：', e)
  )
}

function close() {
  persistProgress()
  reportProgressToServer()
  state.isOpen = false
  state.playing = false
  stopTimer()
  if (videoEl) videoEl.pause()
  state.streamUrl = ''
  state.streamType = ''
  state.live = false
}

function seek(t: number) {
  const clamped = Math.max(0, Math.min(state.duration, t))
  if (state.live && videoEl) videoEl.currentTime = clamped
  else state.currentTime = clamped
}

function setVolume(v: number) {
  state.volume = Math.max(0, Math.min(1, v))
  state.muted = state.volume === 0
  if (videoEl) {
    videoEl.volume = state.volume
    videoEl.muted = state.muted
  }
}

function toggleMute() {
  state.muted = !state.muted
  if (videoEl) videoEl.muted = state.muted
}

function setRate(r: number) {
  state.rate = r
  if (videoEl) videoEl.playbackRate = r
}

function setTrack(kind: 'subtitle' | 'audio' | 'quality', val: string) {
  state[kind] = val
}

const flatEpisodes = computed<Episode[]>(
  () => state.current?.seasons?.flatMap((s) => s.episodes) ?? []
)
const curIndex = computed(() =>
  state.episode ? flatEpisodes.value.findIndex((e) => e.id === state.episode!.id) : -1
)
const hasPrev = computed(() => curIndex.value > 0)
const hasNext = computed(
  () => curIndex.value >= 0 && curIndex.value < flatEpisodes.value.length - 1
)

function next() {
  if (hasNext.value && state.current) {
    play(state.current, flatEpisodes.value[curIndex.value + 1])
  }
}
function prev() {
  if (hasPrev.value && state.current) {
    play(state.current, flatEpisodes.value[curIndex.value - 1])
  }
}

const title = computed(() => {
  if (!state.current) return ''
  if (state.episode) {
    return `${state.current.title} · S${state.episode.season}E${state.episode.episode}`
  }
  return state.current.title
})
const subtitleLine = computed(() => state.episode?.title ?? state.current?.tagline ?? '')

export function usePlayer() {
  return {
    ...toRefs(state),
    title,
    subtitleLine,
    resumeEpisodeOf,
    hasPrev,
    hasNext,
    play,
    playWith,
    togglePlay,
    close,
    seek,
    setVolume,
    toggleMute,
    setRate,
    setTrack,
    next,
    prev,
    registerVideo,
    unregisterVideo,
    onVideoTime,
    onVideoLoaded,
    onVideoPlay,
    onVideoPause,
    onVideoWaiting,
    onVideoPlaying,
    onVideoEnded
  }
}
