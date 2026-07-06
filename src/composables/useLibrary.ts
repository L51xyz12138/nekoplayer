import { computed, reactive, toRefs } from 'vue'
import { getEpisodes, getItems, setFavorite } from '@/api/emby'
import { mapEmbyItem, mapEpisodes } from '@/api/mapper'
import { useEmby } from './useEmby'
import type { LibraryCategory, MediaItem, SortMode } from '@/types/media'

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

// 模块级单例：全应用共享同一份库状态（纯真实数据）
const state = reactive<LibraryState>({
  items: [],
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

const continueWatching = computed(() =>
  scoped.value
    .filter((m) => (m.progress ?? 0) > 0 && (m.progress ?? 0) < 1)
    .sort((a, b) => b.addedAt - a.addedAt)
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
  const { session } = useEmby()
  if (session.value) {
    setFavorite(session.value, id, m.favorite).catch((e) =>
      console.warn('[NekoPlayer] 收藏同步失败：', e)
    )
  }
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
}

/** 从真实 Emby 拉取媒体库 */
async function loadFromEmby() {
  const { session } = useEmby()
  const s = session.value
  if (!s) return

  state.loading = true
  state.error = ''
  try {
    const items = await getItems(s)
    state.items = items.map((it) => mapEmbyItem(it, s))
    state.loaded = true
    state.activeSourceId = 'all'
  } catch (e) {
    state.error = e instanceof Error ? e.message : '媒体库加载失败'
  } finally {
    state.loading = false
  }
}

/** 按需拉取某部剧集的季/集并填充 */
async function loadSeasons(seriesId: string) {
  const { session } = useEmby()
  const s = session.value
  if (!s) return
  const item = getById(seriesId)
  if (!item || item.type !== 'series' || item.seasons) return
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
