import { computed, reactive, ref, toRefs, watch } from 'vue'
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
import { parseEpisode, scrapeMedia, type ScrapeResult, type TmdbConfig } from '@/api/tmdb'
import { useSources } from './useSources'
import { useSettings } from './useSettings'
import { pget, pset } from './persist'
import type { LibraryCategory, MediaItem, SortMode } from '@/types/media'
import type { MediaSource } from '@/types/source'
import type { NekoVideoFile } from '@/types/native'

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
  /** 附加筛选：类型(genre) / 年份(十年代，如 '2010') / 只看未看；'' 表示不限 */
  genre: string
  year: string
  unwatched: boolean
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
  genre: '',
  year: '',
  unwatched: false,
  activeSourceId: 'all',
  activeLibraryId: 'all',
  loading: false,
  error: '',
  loaded: false
})

/** 文件源扫描状态（供「媒体源」页显示：扫描中/找到几个/失败原因），键=源 id */
const fileScan = reactive<Record<string, { scanning: boolean; count: number; error?: string }>>({})

/** 文件源视图模式：文件夹层级 / 媒体库网格（用户可切换） */
const fileViewMode = ref<'folder' | 'library'>('folder')
function setFileViewMode(m: 'folder' | 'library') {
  fileViewMode.value = m
}

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

// 当前作用域下可选的「类型(genre)」与「年份(十年代)」——供筛选面板列出
const genreOptions = computed(() => {
  const set = new Set<string>()
  for (const m of scoped.value) for (const g of m.genres) set.add(g)
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
})
const decadeOptions = computed(() => {
  const set = new Set<number>()
  for (const m of scoped.value) if (m.year) set.add(Math.floor(m.year / 10) * 10)
  return [...set].sort((a, b) => b - a) // 新的在前
})
const activeFilterCount = computed(
  () => (state.genre ? 1 : 0) + (state.year ? 1 : 0) + (state.unwatched ? 1 : 0)
)

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

  // 附加筛选：类型(genre) / 年份(十年代) / 未看
  if (state.genre) list = list.filter((m) => m.genres.includes(state.genre))
  if (state.year) {
    const d = Number(state.year)
    list = list.filter((m) => m.year >= d && m.year < d + 10)
  }
  if (state.unwatched) list = list.filter((m) => !m.watched)

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
function setGenre(v: string) {
  state.genre = v
}
function setYear(v: string) {
  state.year = v
}
function setUnwatched(v: boolean) {
  state.unwatched = v
}
function resetFilters() {
  state.genre = ''
  state.year = ''
  state.unwatched = false
}
function setActiveSource(id: string) {
  state.activeSourceId = id
  state.activeLibraryId = 'all' // 不同源的库不同，切源时重置到全部库
  resetFilters() // 不同作用域可选的类型/年份不同，切换时清空筛选
}
function setActiveLibrary(id: string) {
  state.activeLibraryId = id
  resetFilters()
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

/** 本机存储视频 → MediaItem（无元数据，封面走 mpv 抽帧，点卡片直接播文件） */
// ---- 文件源刮削（TMDB）：结果按「文件名派生标题」缓存，命中即复用，未命中不重试 ----
const SCRAPE_KEY = 'neko-scrape-cache'
// 刮削结果格式版本：加了演员/类型等字段就 +1，旧缓存作废重刮（否则老条目一直没演员/相关推荐）
const SCRAPE_VER = '2'
function loadScrapeCache(): Record<string, ScrapeResult | null> {
  try {
    if (pget('neko-scrape-ver') !== SCRAPE_VER) return {} // 版本变了 → 清空重刮
    const raw = pget(SCRAPE_KEY)
    const c = raw ? (JSON.parse(raw) as Record<string, ScrapeResult | null>) : {}
    // 清掉历史上「纯数字 key」的垃圾结果（如 "25"→某电影）——新逻辑不再刮纯数字标题
    for (const k of Object.keys(c)) if (!/\p{L}/u.test(k)) delete c[k]
    return c
  } catch {
    return {}
  }
}
const scrapeCache: Record<string, ScrapeResult | null> = loadScrapeCache()
let scrapeTimer: ReturnType<typeof setTimeout> | undefined
function saveScrapeCache() {
  if (scrapeTimer) clearTimeout(scrapeTimer)
  scrapeTimer = setTimeout(() => {
    scrapeTimer = undefined
    pset(SCRAPE_KEY, JSON.stringify(scrapeCache))
    pset('neko-scrape-ver', SCRAPE_VER)
  }, 800)
}

/** 把刮削结果套到条目上（有海报/年份/评分 → 卡片展示媒体信息而非缩略图） */
function applyScrape(item: MediaItem, r: ScrapeResult) {
  item.title = r.title || item.title
  if (r.year) item.year = r.year
  if (r.rating) item.rating = r.rating
  if (r.overview) item.overview = r.overview
  if (r.posterUrl) item.posterUrl = r.posterUrl
  if (r.backdropUrl) item.backdropUrl = r.backdropUrl
  if (r.tagline) item.tagline = r.tagline
  if (r.genres?.length) item.genres = r.genres
  if (r.cast?.length) item.cast = r.cast
  item.scraped = true
}

// ---- 手动元数据覆盖（编辑元数据）：按条目 id 存，永远盖过自动刮削 ----
const OVERRIDE_KEY = 'neko-scrape-override'
function loadOverrides(): Record<string, Partial<MediaItem>> {
  try {
    const raw = pget(OVERRIDE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Partial<MediaItem>>) : {}
  } catch {
    return {}
  }
}
const overrides: Record<string, Partial<MediaItem>> = loadOverrides()

/** 把手动覆盖套到条目上（在自动刮削之后调用，覆盖优先；标 scraped 防被自动刮盖回） */
function applyOverride(item: MediaItem) {
  const o = overrides[item.id]
  if (!o) return
  Object.assign(item, o)
  item.scraped = true
}

/** 保存手动元数据覆盖并即时套用到当前条目 */
function saveMetaOverride(id: string, data: Partial<MediaItem>) {
  overrides[id] = { ...(overrides[id] ?? {}), ...data }
  pset(OVERRIDE_KEY, JSON.stringify(overrides))
  const item = getById(id)
  if (item) applyOverride(item)
  saveCache(state.items)
}

/** 用指定名字重新匹配 TMDB（movie/剧集），供编辑弹窗「重新匹配」预览 */
async function scrapeByName(query: string, isTv: boolean): Promise<ScrapeResult | null> {
  const s = useSettings().settings
  if (!s.tmdbKey || !query.trim()) return null
  return scrapeMedia(
    {
      key: s.tmdbKey,
      lang: s.tmdbLang || 'zh-CN',
      apiBase: s.tmdbApiBase || 'https://api.themoviedb.org/3',
      imgBase: s.tmdbImgBase || 'https://image.tmdb.org/t/p/w500'
    },
    query,
    isTv
  )
}

// ---- 手动把散条目组成剧集 / 解散（自动聚合修不了时的兜底）----
const MANUAL_KEY = 'neko-manual-series'
interface ManualGroup {
  title: string
  ids: string[]
}
function loadManual(): Record<string, ManualGroup> {
  try {
    const raw = pget(MANUAL_KEY)
    return raw ? (JSON.parse(raw) as Record<string, ManualGroup>) : {}
  } catch {
    return {}
  }
}
const manualSeries: Record<string, ManualGroup> = loadManual()

// 最近一次扫到的原始文件条目（未聚合），供手动分组后免重扫、就地重聚合
let lastRawFileItems: MediaItem[] = []

/** 重新聚合文件源条目（不重扫），套手动覆盖后刷进库 */
function reaggregateFiles() {
  const embyItems = state.items.filter((m) => !isFileItem(m))
  const aggregated = aggregateFileItems(lastRawFileItems)
  for (const m of aggregated) applyOverride(m)
  state.items = [...embyItems, ...aggregated]
  saveCache(state.items)
  void scrapeFileItems()
}

/** 手动把一组文件条目（ids）组成一部剧集 */
function saveManualSeries(title: string, ids: string[]) {
  if (ids.length < 1) return
  manualSeries['m' + Date.now()] = { title: title.trim() || '未命名剧集', ids }
  pset(MANUAL_KEY, JSON.stringify(manualSeries))
  reaggregateFiles()
}

/** 解散手动剧集（id 形如 local-series:manual:<key>），成员还原为单个视频 */
function removeManualSeries(seriesId: string) {
  const key = seriesId.replace('local-series:manual:', '')
  if (!manualSeries[key]) return
  delete manualSeries[key]
  pset(MANUAL_KEY, JSON.stringify(manualSeries))
  reaggregateFiles()
}

/** 清除某条目的手动元数据覆盖，还原自动识别 */
function clearMetaOverride(id: string) {
  if (!overrides[id]) return
  delete overrides[id]
  pset(OVERRIDE_KEY, JSON.stringify(overrides))
  reaggregateFiles()
}

/** 后台刮削文件源条目（仅未命中缓存的走网络），更新条目并写缓存 */
async function scrapeFileItems() {
  const { settings } = useSettings()
  if (!settings.tmdbKey) return
  const cfg: TmdbConfig = {
    key: settings.tmdbKey,
    lang: settings.tmdbLang || 'zh-CN',
    apiBase: settings.tmdbApiBase || 'https://api.themoviedb.org/3',
    imgBase: settings.tmdbImgBase || 'https://image.tmdb.org/t/p/w500'
  }
  // 直接取 state.items（响应式代理）里的文件条目来改，改动才能触发卡片更新。
  // 电影文件（localPath）+ 聚合出的剧集（local-series:，按剧名强制剧集搜）
  const targets = state.items.filter(
    (m) => (m.localPath || m.id.startsWith('local-series:')) && !m.scraped
  )
  if (!targets.length) return
  let changed = false
  let idx = 0
  const worker = async () => {
    while (idx < targets.length) {
      const item = targets[idx++]
      const key = item.title // 电影=文件名派生标题、剧集=剧名（刮削前）
      const forceTv = item.id.startsWith('local-series:')
      let r: ScrapeResult | null
      if (key in scrapeCache) r = scrapeCache[key]
      else {
        r = await scrapeMedia(cfg, key, forceTv)
        scrapeCache[key] = r
      }
      if (r) {
        applyScrape(item, r)
        changed = true
      }
    }
  }
  // 限 4 并发，避免打爆 TMDB
  await Promise.all(Array.from({ length: 4 }, worker))
  if (changed) {
    saveScrapeCache()
    saveCache(state.items)
  }
}

// 用户填入/更换 TMDB Key 后，立即对已在库的文件源条目补刮（无需重启）
watch(
  () => useSettings().settings.tmdbKey,
  (k) => {
    if (k) void scrapeFileItems()
  }
)

function mapLocalVideo(v: NekoVideoFile, source: MediaSource): MediaItem {
  const ep = parseEpisode(v.name)
  const item: MediaItem = {
    id: 'local:' + v.path,
    sourceId: source.id,
    title: v.name.replace(/\.[^.]+$/, ''),
    type: 'movie',
    year: 0,
    runtime: 0,
    rating: 0,
    certification: '',
    genres: [],
    overview: '',
    cast: [],
    addedAt: v.mtime || Date.now(),
    localPath: v.path,
    folder: v.dir ?? '',
    // 文件源视频无服务器分类，统一归到「其他」库（所有文件源共用一个，避免多个同名 tab）
    libraryId: 'file:other',
    libraryName: '其他',
    episodeInfo: ep ?? undefined
  }
  // 电影文件：同步套已缓存的刮削结果（防闪）；剧集分集在聚合成剧集后按剧名刮。
  // 纯数字标题（DLNA 的 "25"/"1637"）不套缓存——那类刮出来多是垃圾，且会干扰文件夹聚合
  if (!ep && /\p{L}/u.test(item.title)) {
    const cached = scrapeCache[item.title]
    if (cached) applyScrape(item, cached)
  }
  return item
}

const isFileItem = (m: MediaItem) => m.id.startsWith('local:') || m.id.startsWith('local-series:')

/** 分集文件夹的公共前缀，作为剧集在文件夹视图里的所在文件夹 */
function commonFolder(folders: string[]): string {
  const rows = folders.map((f) => (f ? f.split('/').filter(Boolean) : []))
  if (!rows.length) return ''
  let n = rows[0].length
  for (const r of rows) {
    let i = 0
    while (i < n && i < r.length && r[i] === rows[0][i]) i++
    n = i
  }
  return rows[0].slice(0, n).join('/')
}

// 「Season 1 / 第2季 / S03」这类季文件夹段
const SEASON_SEG = /^(?:season\s*\d+|第\s*\d+\s*季|s\d{1,2})$/i
/** 剧集所在的「剧文件夹」：末段是季文件夹时取其父，否则取本身 */
function showFolder(folder: string): string {
  const parts = folder.split('/').filter(Boolean)
  if (parts.length >= 2 && SEASON_SEG.test(parts[parts.length - 1])) return parts.slice(0, -1).join('/')
  return parts.join('/')
}
/** 从文件夹末段推季号（无则第 1 季） */
function seasonFromFolder(folder: string): number {
  const last = folder.split('/').filter(Boolean).pop() ?? ''
  const m = last.match(/(?:season\s*|第\s*|s)(\d{1,2})/i)
  return m ? +m[1] : 1
}
/** 把文件夹名清成可搜的剧名：去「09.」序号、年份、画质标签 */
function folderShowName(seg: string): string {
  return (
    seg
      .replace(/^\d+[.\s_-]+/, '')
      .replace(/[（(]\s*(?:19|20)\d{2}\s*[)）]/g, '')
      .replace(/\b(?:19|20)\d{2}\b/g, '')
      .replace(/\b(?:4k|2160p|1080p|720p|blu-?ray|web-?dl|remux|hevc|x26[45]|hdr|dovi|uhd|repack)\b/gi, '')
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || seg
  )
}

/** 剧集条目外壳：从 scrapeCache[showKey] 取已刮信息填充（未刮则占位，稍后 scrapeFileItems 补） */
function seriesShell(id: string, sourceId: string, showKey: string, addedAt: number): MediaItem {
  const info = scrapeCache[showKey]
  return {
    id,
    sourceId,
    title: info?.title || showKey,
    type: 'series',
    year: info?.year || 0,
    runtime: 0,
    rating: info?.rating || 0,
    certification: '',
    genres: info?.genres || [],
    overview: info?.overview || '',
    tagline: info?.tagline,
    cast: info?.cast || [],
    addedAt,
    posterUrl: info?.posterUrl,
    backdropUrl: info?.backdropUrl,
    libraryId: 'file:other',
    libraryName: '其他',
    seasons: [],
    scraped: !!info
  }
}

/** 把文件源分集聚合成剧集条目；电影原样返回。两级：①文件名带集号(episodeInfo) ②同源同名的散条目(≥3) */
function aggregateFileItems(items: MediaItem[]): MediaItem[] {
  const out: MediaItem[] = []
  const seriesMap = new Map<string, MediaItem>()
  const foldersOf = new Map<string, string[]>()
  const loose: MediaItem[] = []
  // 手动分组优先：属于手动剧集的条目先建剧，其余再自动聚合
  const claimed = new Set<string>()
  for (const [key, g] of Object.entries(manualSeries)) {
    const members = items.filter((m) => g.ids.includes(m.id))
    if (!members.length) continue
    members.forEach((m) => claimed.add(m.id))
    const eps = [...members].sort((a, b) =>
      (a.localPath ?? '').localeCompare(b.localPath ?? '', undefined, { numeric: true })
    )
    const series = seriesShell(
      'local-series:manual:' + key,
      eps[0].sourceId,
      g.title,
      eps.reduce((a, m) => Math.max(a, m.addedAt), 0)
    )
    series.folder = commonFolder(eps.map((m) => m.folder ?? ''))
    series.seasons = [
      {
        season: 1,
        title: '第 1 季',
        episodes: eps.map((m, i) => ({
          id: m.id,
          season: 1,
          episode: i + 1,
          title: `第 ${i + 1} 集`,
          runtime: 0,
          overview: '',
          stillSeed: m.id,
          localPath: m.localPath,
          folder: m.folder
        }))
      }
    ]
    out.push(series)
  }
  for (const m of items) {
    if (claimed.has(m.id)) continue
    const ep = m.episodeInfo
    if (!ep) {
      loose.push(m)
      continue
    }
    const key = m.sourceId + '::' + ep.show
    let series = seriesMap.get(key)
    if (!series) {
      series = seriesShell('local-series:' + key, m.sourceId, ep.show, m.addedAt)
      seriesMap.set(key, series)
      foldersOf.set(key, [])
      out.push(series)
    }
    if (m.addedAt > series.addedAt) series.addedAt = m.addedAt
    foldersOf.get(key)!.push(m.folder ?? '')
    let season = series.seasons!.find((s) => s.season === ep.season)
    if (!season) {
      season = { season: ep.season, title: `第 ${ep.season} 季`, episodes: [] }
      series.seasons!.push(season)
    }
    season.episodes.push({
      id: m.id,
      season: ep.season,
      episode: ep.episode,
      title: ep.epTitle || `S${ep.season}E${ep.episode}`,
      runtime: 0,
      overview: '',
      stillSeed: m.id,
      localPath: m.localPath,
      folder: m.folder
    })
  }
  for (const [key, series] of seriesMap) {
    series.folder = commonFolder(foldersOf.get(key)!)
    series.seasons!.sort((a, b) => a.season - b.season)
    for (const s of series.seasons!) s.episodes.sort((a, b) => a.episode - b.episode)
  }
  // 兜底：媒体服务器多按「剧名/Season N/分集」组织，文件夹比文件名可靠。
  // 同源、同一「剧文件夹」下 ≥3 个散条目 → 剧集；若它们各自都刮成了不同电影，则是电影合集文件夹（保持电影）
  const byShowFolder = new Map<string, MediaItem[]>()
  for (const m of loose) {
    const k = m.sourceId + '::' + showFolder(m.folder ?? '')
    const g = byShowFolder.get(k) ?? (byShowFolder.set(k, []), byShowFolder.get(k)!)
    g.push(m)
  }
  for (const g of byShowFolder.values()) {
    // 电影合集文件夹（如三部曲）：都各自刮成了不同电影 → 保持电影。但 ≥5 个基本是剧集，直接聚合
    const isCollection =
      g.length < 5 && g.every((m) => m.scraped) && new Set(g.map((m) => m.title)).size === g.length
    if (g.length < 3 || isCollection) {
      out.push(...g)
      continue
    }
    const folder = showFolder(g[0].folder ?? '')
    const showKey = folderShowName(folder.split('/').filter(Boolean).pop() ?? g[0].title)
    const series = seriesShell(
      'local-series:' + g[0].sourceId + '::' + showKey,
      g[0].sourceId,
      showKey,
      g.reduce((a, m) => Math.max(a, m.addedAt), 0)
    )
    series.folder = commonFolder(g.map((m) => m.folder ?? ''))
    // 按（从文件夹推的）季分组，季内按文件名自然序当集号
    const bySeason = new Map<number, MediaItem[]>()
    for (const m of g) {
      const sn = seasonFromFolder(m.folder ?? '')
      const arr = bySeason.get(sn) ?? (bySeason.set(sn, []), bySeason.get(sn)!)
      arr.push(m)
    }
    series.seasons = [...bySeason.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([sn, arr]) => ({
        season: sn,
        title: `第 ${sn} 季`,
        episodes: arr
          .sort((a, b) => (a.localPath ?? '').localeCompare(b.localPath ?? '', undefined, { numeric: true }))
          .map((m, i) => ({
            id: m.id,
            season: sn,
            episode: i + 1,
            title: `第 ${i + 1} 集`,
            runtime: 0,
            overview: '',
            stillSeed: m.id,
            localPath: m.localPath,
            folder: m.folder
          }))
      }))
    out.push(series)
  }
  return out
}

const FILE_KINDS = ['local', 'webdav', 'smb', 'dlna']

/** 扫描所有启用的文件浏览类源（本机/WebDAV/SMB），把视频映射为 MediaItem */
/** 网络文件源可能慢或离线，给扫描加超时兜底，避免卡住整库加载 */
const SCAN_TIMEOUT = 25000
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(fallback)
      }
    )
  })
}

// 花絮/预告/特典/菜单/SP 等附加内容（非正片）：按名排除，避免乱刮成电影
const EXTRA_RE =
  /花絮|预告|彩蛋|特典|片花|幕后|访谈|删减|菜单|sample|trailer|teaser|preview|featurette|deleted|\bextras?\b|behind|\[(?:menu|sp|nc(?:op|ed)|pv|cm|op|ed)\s*\d*\]|\bmenu\s*\d|\bSPs\b/i

/** 扫描结果清洗：去花絮/预告/SP + 蓝光/DVD 原盘（BDMV/VIDEO_TS，含 DLNA 放在文件夹里的）同一碟只留最大正片 */
function cleanScanned(videos: NekoVideoFile[]): NekoVideoFile[] {
  const kept = videos.filter((v) => !EXTRA_RE.test(v.name) && !EXTRA_RE.test(v.dir ?? ''))
  const discs = new Map<string, NekoVideoFile[]>()
  const out: NekoVideoFile[] = []
  for (const v of kept) {
    // BDMV/VIDEO_TS 可能在路径里（本机/SMB）或文件夹里（DLNA 的 path 是 URL、结构在 dir）
    const dir = (v.dir ?? '').replace(/\\/g, '/')
    const p = v.path.replace(/\\/g, '/')
    const md = dir.match(/^(.*?)\/?(?:BDMV|VIDEO_TS)(?:\/|$)/i)
    const mp = p.match(/^(.*?)\/(?:BDMV|VIDEO_TS)\//i)
    const disc = md ? 'd:' + md[1] : mp ? 'p:' + mp[1] : null
    if (disc) {
      const g = discs.get(disc) ?? (discs.set(disc, []), discs.get(disc)!)
      g.push(v)
    } else {
      out.push(v)
    }
  }
  // 每张原盘只留体积最大的（正片），丢弃 00001.m2ts 之类碎片
  for (const g of discs.values()) out.push(g.reduce((a, b) => ((b.size || 0) > (a.size || 0) ? b : a)))
  return out
}

async function loadFileSourceItems(): Promise<MediaItem[]> {
  const nn = window.nekoNative
  if (!nn) return []
  const fileSources = useSources().sources.value.filter(
    (s) => FILE_KINDS.includes(s.kind) && s.enabled
  )
  if (!fileSources.length) return []
  const groups = await Promise.all(
    fileSources.map(async (src) => {
      fileScan[src.id] = { scanning: true, count: fileScan[src.id]?.count ?? 0 }
      try {
        let scan: Promise<{ videos?: NekoVideoFile[]; error?: string }> | null = null
        // config 是 Vue 响应式 Proxy，直接过 IPC 会报 "An object could not be cloned"，
        // 必须展开成普通对象再传（local 传的是字符串路径，故本来就没事）
        const cfg = { ...src.config }
        if (src.kind === 'local') {
          if (src.config?.path && nn.scanVideos) scan = nn.scanVideos(src.config.path)
        } else if (src.kind === 'webdav') {
          if (nn.scanWebdav) scan = nn.scanWebdav(cfg)
        } else if (src.kind === 'smb') {
          if (nn.scanSmb) scan = nn.scanSmb(cfg)
        } else if (src.kind === 'dlna') {
          if (nn.scanDlna) scan = nn.scanDlna(cfg)
        }
        const r: { videos?: NekoVideoFile[]; error?: string } = scan
          ? await withTimeout(scan, SCAN_TIMEOUT, { error: '扫描超时（源无响应）' })
          : { error: '缺少必要的连接信息' }
        const items = cleanScanned(r.videos ?? []).map((v) => mapLocalVideo(v, src))
        if (r.error) console.warn('[NekoPlayer] 文件源扫描失败：', src.name, r.error)
        fileScan[src.id] = { scanning: false, count: items.length, error: r.error }
        return items
      } catch (e) {
        fileScan[src.id] = {
          scanning: false,
          count: 0,
          error: e instanceof Error ? e.message : '扫描出错'
        }
        return [] as MediaItem[]
      }
    })
  )
  return groups.flat()
}

/** 后台加载文件源视频并并入库：用最新的 Emby 条目 + 新文件条目，替换掉旧文件条目 */
async function appendFileSourceItems() {
  try {
    const fileItems = await loadFileSourceItems()
    lastRawFileItems = fileItems // 存原始条目，供手动分组后免重扫重聚合
    const embyItems = state.items.filter((m) => !isFileItem(m))
    // 把剧集分集聚合成剧集条目，套上手动覆盖（覆盖优先），再并入库
    const aggregated = aggregateFileItems(fileItems)
    for (const m of aggregated) applyOverride(m)
    state.items = [...embyItems, ...aggregated]
    saveCache(state.items)
    // 后台刮削（未命中缓存的走 TMDB），命中后更新卡片为海报/信息
    void scrapeFileItems()
  } catch {
    /* 文件源失败不影响主库 */
  }
}

/** 加载媒体库：Emby/Jellyfin 聚合 + 本机存储视频，合并为一个库 */
async function loadFromEmby() {
  const embySources = useSources().sources.value.filter(
    (s) => (s.kind === 'emby' || s.kind === 'jellyfin') && s.enabled && s.session
  )
  const hasFileSource = useSources().sources.value.some(
    (s) => FILE_KINDS.includes(s.kind) && s.enabled
  )
  if (!embySources.length && !hasFileSource) {
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
    // 先让 Emby 内容立即渲染，文件源（可能是慢/离线的网络盘）后台补进来，
    // 避免一个掉线的网络源把整库卡在加载态；旧文件条目先占位（SWR）防闪烁
    const prevFileItems = hasFileSource ? state.items.filter((m) => isFileItem(m)) : []
    state.items = [...next, ...prevFileItems]
    state.loaded = true
    saveCache(state.items)
    if (hasFileSource) void appendFileSourceItems()
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
    fileScan,
    fileViewMode,
    setFileViewMode,
    bySource,
    scoped,
    libraries,
    counts,
    genreOptions,
    decadeOptions,
    activeFilterCount,
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
    setGenre,
    setYear,
    setUnwatched,
    resetFilters,
    setActiveSource,
    setActiveLibrary,
    clearLibrary,
    loadFromEmby,
    refreshAfterPlayback,
    loadSeasons,
    saveMetaOverride,
    scrapeByName,
    clearMetaOverride,
    saveManualSeries,
    removeManualSeries
  }
}
