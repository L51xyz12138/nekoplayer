import { computed, reactive, toRefs } from 'vue'
import { getEpisodes, getItems, getNextUp, getResume, setFavorite, setPlayed } from '@/api/emby'
import { mapEmbyItem, mapEpisodes, mapNextUp } from '@/api/mapper'
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
  loading: false,
  error: '',
  loaded: false
})

// 先按当前来源把媒体缩小到作用域，其余派生数据都基于它
const scoped = computed(() =>
  state.activeSourceId === 'all'
    ? state.items
    : state.items.filter((m) => m.sourceId === state.activeSourceId)
)

const counts = computed<Record<LibraryCategory, number>>(() => ({
  all: scoped.value.length,
  movie: scoped.value.filter((m) => m.type === 'movie').length,
  series: scoped.value.filter((m) => m.type === 'series').length,
  favorite: scoped.value.filter((m) => m.favorite).length
}))

const filtered = computed(() => {
  let list = scoped.value.slice()

  if (state.category === 'movie') list = list.filter((m) => m.type === 'movie')
  else if (state.category === 'series') list = list.filter((m) => m.type === 'series')
  else if (state.category === 'favorite') list = list.filter((m) => m.favorite)

  const q = state.query.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.genres.some((g) => g.toLowerCase().includes(q))
    )
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
    .slice()
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 12)
)

const movies = computed(() => scoped.value.filter((m) => m.type === 'movie'))
const series = computed(() => scoped.value.filter((m) => m.type === 'series'))

/** 首页 Hero 精选：当前来源里评分最高者 */
const featured = computed(() => scoped.value.slice().sort((a, b) => b.rating - a.rating)[0])

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
}

function clearLibrary() {
  state.items = []
  state.loaded = false
  state.activeSourceId = 'all'
  saveCache([])
}

/** 从真实 Emby 拉取媒体库 */
async function loadFromEmby() {
  const embySources = useSources().sources.value.filter(
    (s) => s.kind === 'emby' && s.enabled && s.session
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
        try {
          // 同时拉媒体列表、「下一集待看」、「继续观看」，用 SeriesId 把续看集挂到对应剧集上
          const [items, nextUps, resumes] = await Promise.all([
            getItems(src.session!),
            getNextUp(src.session!).catch(() => []),
            getResume(src.session!).catch(() => [])
          ])
          const mapped = items.map((it) => mapEmbyItem(it, src.session!))
          const byId = new Map(mapped.map((m) => [m.id, m]))
          // 端点已按最近活动排序：用其顺序赋「最近播放」时间戳
          // （魔改 Emby 常不给 LastPlayedDate，用排名兜底，rank 越小越近）
          const now = Date.now()
          const stamp = (m: MediaItem, lp: string | undefined, rank: number) => {
            if (m.lastPlayed != null) return
            m.lastPlayed = lp ? Date.parse(lp) : now - rank * 60_000
          }
          // Resume：正在看的电影/分集（最近在前）；剧集取最新一集作续看点
          resumes.forEach((e, i) => {
            const target =
              e.Type === 'Episode' ? (e.SeriesId ? byId.get(e.SeriesId) : undefined) : byId.get(e.Id)
            if (!target) return
            if (e.Type === 'Episode' && !target.nextUp) target.nextUp = mapNextUp(e, src.session!)
            stamp(target, e.UserData?.LastPlayedDate, i)
          })
          // NextUp：补「没有正在看的集」的剧（追完当前集 → 下一集），排在 Resume 之后
          nextUps.forEach((e, i) => {
            const series = e.SeriesId ? byId.get(e.SeriesId) : undefined
            if (!series || series.nextUp) return
            series.nextUp = mapNextUp(e, src.session!)
            stamp(series, e.UserData?.LastPlayedDate, resumes.length + i)
          })
          return mapped
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
    counts,
    filtered,
    continueWatching,
    recentlyAdded,
    movies,
    series,
    featured,
    getById,
    toggleFavorite,
    toggleWatched,
    updateProgress,
    setQuery,
    setCategory,
    setSort,
    setActiveSource,
    clearLibrary,
    loadFromEmby,
    loadSeasons
  }
}
