import { computed, reactive, toRefs } from 'vue'
import {
  getCollections,
  getEpisodes,
  getItem,
  getItems,
  getNextUp,
  getResume,
  getViews,
  setFavorite,
  setPlayed,
  type EmbyItem,
  type EmbySession
} from '@/api/emby'
import { mapEmbyItem, mapEpisodes, mapNextUp, progressOf } from '@/api/mapper'
import { useSources } from './useSources'
import { pget, pset } from './persist'
import type { LibraryCategory, MediaItem, SortMode } from '@/types/media'

// 上次成功加载的媒体库缓存：启动先渲染它，再后台刷新（stale-while-revalidate）
const CACHE_KEY = 'neko-library-cache'

function loadCache(): MediaItem[] {
  try {
    const raw = pget(CACHE_KEY)
    return raw ? (JSON.parse(raw) as MediaItem[]) : []
  } catch {
    return []
  }
}

let cacheTimer: ReturnType<typeof setTimeout> | undefined
function saveCache(items: MediaItem[]) {
  // 大库 JSON.stringify 较重：去抖 + 延后到空闲，避免阻塞加载后的首屏交互
  if (cacheTimer) clearTimeout(cacheTimer)
  cacheTimer = setTimeout(() => {
    cacheTimer = undefined
    pset(CACHE_KEY, JSON.stringify(items))
  }, 500)
}

interface LibraryState {
  items: MediaItem[]
  query: string
  category: LibraryCategory
  sort: SortMode
  /** 'all' 表示聚合全部来源，否则为具体媒体源 id */
  activeSourceId: string
  /** 'all' 表示全部媒体库，否则为具体库 id（`serverId:viewId`） */
  activeLibraryId: string
  loading: boolean
  error: string
  /** 是否已成功加载过一次真实数据 */
  loaded: boolean
}

// 模块级单例：全应用共享同一份库状态（启动即用缓存填充，保证首屏秒开）
const state = reactive<LibraryState>({
  items: loadCache(),
  query: '',
  category: 'all',
  sort: 'recent',
  activeSourceId: 'all',
  activeLibraryId: 'all',
  loading: false,
  error: '',
  loaded: false
})

// 先按来源缩小，再按媒体库缩小；其余派生数据都基于最终 scoped
const bySource = computed(() =>
  state.activeSourceId === 'all'
    ? state.items
    : state.items.filter((m) => m.sourceId === state.activeSourceId)
)

// 当前来源下的媒体库列表（服务器自带分类，去重；空库不会出现，因为其下无影视条目）
const libraries = computed(() => {
  const seen = new Map<string, { id: string; name: string }>()
  for (const m of bySource.value) {
    if (m.libraryId && !seen.has(m.libraryId)) {
      seen.set(m.libraryId, { id: m.libraryId, name: m.libraryName ?? '媒体库' })
    }
  }
  return [...seen.values()]
})

const scoped = computed(() =>
  state.activeLibraryId === 'all'
    ? bySource.value
    : bySource.value.filter((m) => m.libraryId === state.activeLibraryId)
)

const counts = computed<Record<LibraryCategory, number>>(() => ({
  all: scoped.value.length,
  movie: scoped.value.filter((m) => m.type === 'movie').length,
  series: scoped.value.filter((m) => m.type === 'series').length,
  favorite: scoped.value.filter((m) => m.favorite).length
}))

const filtered = computed(() => {
  const q = state.query.trim().toLowerCase()

  // 搜索时跨「全部媒体库 + 全部类型」（仅限当前源），确保能搜到剧集等任何条目；
  // 非搜索时才按当前分类 tab 过滤
  let list = (q ? bySource.value : scoped.value).slice()

  if (q) {
    list = list.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.genres.some((g) => g.toLowerCase().includes(q))
    )
  } else {
    if (state.category === 'movie') list = list.filter((m) => m.type === 'movie')
    else if (state.category === 'series') list = list.filter((m) => m.type === 'series')
    else if (state.category === 'favorite') list = list.filter((m) => m.favorite)
  }

  switch (state.sort) {
    case 'title':
      list.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
      break
    case 'rating':
      list.sort((a, b) => b.rating - a.rating)
      break
    case 'year':
      list.sort((a, b) => b.year - a.year)
      break
    default:
      list.sort((a, b) => b.addedAt - a.addedAt)
  }
  return list
})

// 继续观看：电影看自身进度；剧集看 nextUp（Resume/NextUp）。按最近播放时间倒序
const continueWatching = computed(() =>
  scoped.value
    .filter((m) =>
      m.type === 'series'
        ? !!m.nextUp
        : (m.progress ?? 0) > 0 && (m.progress ?? 0) < 1
    )
    .sort((a, b) => (b.lastPlayed ?? b.addedAt) - (a.lastPlayed ?? a.addedAt))
)

const recentlyAdded = computed(() =>
  scoped.value
    .filter((m) => m.type !== 'collection')
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 12)
)

const movies = computed(() => scoped.value.filter((m) => m.type === 'movie'))
const series = computed(() => scoped.value.filter((m) => m.type === 'series'))
const collections = computed(() => scoped.value.filter((m) => m.type === 'collection'))

/** 首页 Hero 精选：当前来源里评分最高者（合集不参与） */
const featured = computed(
  () =>
    scoped.value
      .filter((m) => m.type !== 'collection')
      .slice()
      .sort((a, b) => b.rating - a.rating)[0]
)

function getById(id: string) {
  return state.items.find((m) => m.id === id)
}

function toggleFavorite(id: string) {
  const m = getById(id)
  if (!m) return
  m.favorite = !m.favorite
  const s = useSources().sessionOf(m.sourceId)
  if (s) {
    setFavorite(s, id, m.favorite).catch((e) =>
      console.warn('[NekoPlayer] 收藏同步失败：', e)
    )
  }
  saveCache(state.items)
}

/** 标记已看 / 取消已看（乐观更新 + 回写服务器） */
function toggleWatched(id: string) {
  const m = getById(id)
  if (!m) return
  m.watched = !m.watched
  // 标记已看：清掉进度与下一集待看，使其移出「继续观看」
  if (m.watched) {
    m.progress = undefined
    m.nextUp = undefined
  }
  const s = useSources().sessionOf(m.sourceId)
  if (s) {
    setPlayed(s, id, m.watched).catch((e) =>
      console.warn('[NekoPlayer] 已看状态同步失败：', e)
    )
  }
  saveCache(state.items)
}

function updateProgress(id: string, progress: number) {
  const m = getById(id)
  if (m) m.progress = Math.max(0, Math.min(1, progress))
}

function setQuery(v: string) {
  state.query = v
}
function setCategory(v: LibraryCategory) {
  state.category = v
}
function setSort(v: SortMode) {
  state.sort = v
}
function setActiveSource(id: string) {
  state.activeSourceId = id
  state.activeLibraryId = 'all' // 不同源的库不同，切源时重置到全部库
}
function setActiveLibrary(id: string) {
  state.activeLibraryId = id
}

function clearLibrary() {
  state.items = []
  state.loaded = false
  state.activeSourceId = 'all'
  saveCache([])
}

/** 把 NextUp/Resume 挂到对应条目上（续看点 + 最近播放时间 + 在看电影进度）。loadFromEmby 与播放后刷新共用 */
function applyContinueWatching(
  items: MediaItem[],
  nextUps: EmbyItem[],
  resumes: EmbyItem[],
  session: EmbySession
) {
  const byId = new Map(items.map((m) => [m.id, m]))
  const now = Date.now()
  const stamp = (m: MediaItem, lp: string | undefined, rank: number) => {
    if (m.lastPlayed != null) return
    m.lastPlayed = lp ? Date.parse(lp) : now - rank * 60_000
  }
  // Resume：正在看的电影/分集（最近在前）；剧集取最新一集作续看点，电影更新自身进度
  resumes.forEach((e, i) => {
    const target =
      e.Type === 'Episode' ? (e.SeriesId ? byId.get(e.SeriesId) : undefined) : byId.get(e.Id)
    if (!target) return
    if (e.Type === 'Episode') {
      if (!target.nextUp) target.nextUp = mapNextUp(e, session)
    } else {
      target.progress = progressOf(e.UserData, e.RunTimeTicks)
      target.positionTicks = e.UserData?.PlaybackPositionTicks || undefined
    }
    stamp(target, e.UserData?.LastPlayedDate, i)
  })
  // NextUp：补「没有正在看的集」的剧（追完当前集 → 下一集），排在 Resume 之后
  nextUps.forEach((e, i) => {
    const series = e.SeriesId ? byId.get(e.SeriesId) : undefined
    if (!series || series.nextUp) return
    series.nextUp = mapNextUp(e, session)
    stamp(series, e.UserData?.LastPlayedDate, resumes.length + i)
  })
}

/** 从真实 Emby 拉取媒体库 */
async function loadFromEmby() {
  const embySources = useSources().sources.value.filter(
    (s) => (s.kind === 'emby' || s.kind === 'jellyfin') && s.enabled && s.session
  )
  if (!embySources.length) {
    state.items = []
    state.loaded = false
    saveCache([])
    return
  }

  state.loading = true
  state.error = ''
  try {
    // 并发拉取每个启用源，聚合为一个媒体库（单源失败不影响其它源）
    const groups = await Promise.all(
      embySources.map(async (src) => {
        const session = src.session!
        try {
          // 拉服务器自带的媒体库（Views）+「下一集待看」+「继续观看」+ 合集
          const [views, nextUps, resumes, collections] = await Promise.all([
            getViews(session).catch(() => []),
            getNextUp(session).catch(() => []),
            getResume(session).catch(() => []),
            getCollections(session).catch(() => [])
          ])
          // 只取含影视的库（跳过纯音乐/图片库，避免无意义请求；boxsets 会与电影重复故排除）
          const videoViews = views.filter(
            (v) => !v.CollectionType || ['movies', 'tvshows', 'mixed'].includes(v.CollectionType)
          )

          let mapped: MediaItem[]
          if (videoViews.length) {
            // 按库分别拉取，给每条打上服务器的库归属（分类完全由服务器决定）
            const perView = await Promise.all(
              videoViews.map(async (v) => {
                const items = await getItems(session, { ParentId: v.Id }).catch(() => [])
                return items.map((it) => {
                  const m = mapEmbyItem(it, session)
                  m.libraryId = `${session.serverId}:${v.Id}`
                  m.libraryName = v.Name
                  return m
                })
              })
            )
            // 保险去重（一条目理论上只属一个库）
            const uniq = new Map<string, MediaItem>()
            for (const m of perView.flat()) if (!uniq.has(m.id)) uniq.set(m.id, m)
            mapped = [...uniq.values()]
          } else {
            // 服务器无 Views（或都非视频库）：退回一次性拉全库，不分类
            const items = await getItems(session).catch(() => [])
            mapped = items.map((it) => mapEmbyItem(it, session))
          }

          applyContinueWatching(mapped, nextUps, resumes, session)
          // 合集追加进来（无 libraryId，仅在「全部库」下出现；可搜索、可浏览）
          return [...mapped, ...collections.map((c) => mapEmbyItem(c, session))]
        } catch (e) {
          console.warn('[NekoPlayer] 媒体源加载失败：', src.name, e)
          return [] as MediaItem[]
        }
      })
    )
    // 保留已懒加载的季/集：loadFromEmby 只拉列表不含 seasons，替换 items 时
    // 若不迁移，正在看的详情页会因新 item 无 seasons 而丢失剧集列表
    const prevSeasons = new Map(
      state.items.filter((m) => m.seasons).map((m) => [m.id, m.seasons])
    )
    const next = groups.flat()
    for (const m of next) {
      const sea = prevSeasons.get(m.id)
      if (sea) m.seasons = sea
    }
    state.items = next
    state.loaded = true
    saveCache(state.items)
  } catch (e) {
    state.error = e instanceof Error ? e.message : '媒体库加载失败'
  } finally {
    state.loading = false
  }
}

/**
 * 播放结束后的轻量刷新：不整库重拉（避免高频大流量、降低触发风控风险），
 * 只拉每源的 NextUp+Resume 两个小请求刷新继续观看，再拉「刚看完那条」的详情更新其进度。
 */
async function refreshAfterPlayback(playedId?: string) {
  const embySources = useSources().sources.value.filter(
    (s) => (s.kind === 'emby' || s.kind === 'jellyfin') && s.enabled && s.session
  )
  if (!embySources.length) return

  // 1) 更新刚看完的顶层条目（电影/剧集）自身进度——决定它是否离开继续观看
  if (playedId) {
    const played = getById(playedId)
    const s = played ? useSources().sessionOf(played.sourceId) : undefined
    if (played && s) {
      try {
        const d = await getItem(s, playedId)
        played.progress = progressOf(d.UserData, d.RunTimeTicks)
        played.positionTicks = d.UserData?.PlaybackPositionTicks || undefined
        played.watched = d.UserData?.Played
      } catch (e) {
        console.warn('[NekoPlayer] 刷新条目进度失败：', e)
      }
    }
  }

  // 2) 只刷新继续观看：每源仅 NextUp+Resume；重置本源条目的续看点后重挂
  await Promise.all(
    embySources.map(async (src) => {
      const session = src.session!
      const [nextUps, resumes] = await Promise.all([
        getNextUp(session).catch(() => []),
        getResume(session).catch(() => [])
      ])
      const sourceItems = state.items.filter((m) => m.sourceId === session.serverId)
      for (const m of sourceItems) {
        m.nextUp = undefined
        m.lastPlayed = undefined
      }
      applyContinueWatching(sourceItems, nextUps, resumes, session)
    })
  )
  saveCache(state.items)
}

/** 按需拉取某部剧集的季/集并填充 */
async function loadSeasons(seriesId: string) {
  const item = getById(seriesId)
  if (!item || item.type !== 'series' || item.seasons) return
  const s = useSources().sessionOf(item.sourceId)
  if (!s) return
  try {
    const episodes = await getEpisodes(s, seriesId)
    if (episodes.length) item.seasons = mapEpisodes(episodes, s)
  } catch (e) {
    console.warn('[NekoPlayer] 拉取剧集分集失败：', e)
  }
}

export function useLibrary() {
  return {
    ...toRefs(state),
    scoped,
    libraries,
    counts,
    filtered,
    continueWatching,
    recentlyAdded,
    movies,
    series,
    collections,
    featured,
    getById,
    toggleFavorite,
    toggleWatched,
    updateProgress,
    setQuery,
    setCategory,
    setSort,
    setActiveSource,
    setActiveLibrary,
    clearLibrary,
    loadFromEmby,
    refreshAfterPlayback,
    loadSeasons
  }
}
