import { computed, reactive, ref, toRefs, watch } from 'vue'
import {
  getCollections,
  getEpisodes,
  getItem,
  getItems,
  getMediaInfo,
  getNextUp,
  getPersonItems,
  getResume,
  getViews,
  setFavorite,
  setPlayed,
  type EmbyMediaInfo,
  type EmbyItem,
  type EmbySession
} from '@/api/emby'
import { mapEmbyItem, mapEpisodes, mapNextUp, progressOf } from '@/api/mapper'
import {
  getPersonCredits,
  getTmdbMeta,
  getTvEpisodes,
  getTvSeasons,
  parseEpisode,
  scrapeById,
  scrapeMedia,
  searchTmdb,
  type ScrapeResult,
  type TmdbCandidate,
  type TmdbEpisode,
  type TmdbSeason,
  type TmdbConfig
} from '@/api/tmdb'
import { useSources } from './useSources'
import { useSettings } from './useSettings'
import { useTrakt } from './useTrakt'
import type { TraktTab } from '@/api/trakt'
import { pget, pset } from './persist'
import type { Episode, LibraryCategory, MediaItem, MediaTech, MediaTracks, SortMode } from '@/types/media'
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

// 系列电影合集的成员从浏览区收起（只在合集里出现，避免重复）；搜索仍能搜到
const recentlyAdded = computed(() =>
  scoped.value
    .filter((m) => m.type !== 'collection' && !m.collectionId)
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 12)
)

const movies = computed(() => scoped.value.filter((m) => m.type === 'movie' && !m.collectionId))
const series = computed(() => scoped.value.filter((m) => m.type === 'series'))
const collections = computed(() => scoped.value.filter((m) => m.type === 'collection'))

/** 首页 Hero 精选：当前来源里评分最高的几部（合集不参与），首页轮播切换 */
const featuredList = computed(() =>
  scoped.value
    .filter((m) => m.type !== 'collection' && !m.collectionId && (m.backdropUrl || m.posterUrl))
    .slice()
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 6)
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
const SCRAPE_VER = '5' // 刮削结果加了 collection（所属系列，聚合系列电影用）→ +1 让旧缓存重刮补上
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
  if (r.tmdbId) item.tmdbId = r.tmdbId
  // 所属系列电影（belongs_to_collection）→ 供 regroupTmdbCollections 按此聚合成合集
  if (r.collection) {
    item.tmdbCollectionId = r.collection.id
    item.tmdbCollectionName = r.collection.name
  }
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

function tmdbCfg(): TmdbConfig {
  const s = useSettings().settings
  return {
    key: s.tmdbKey,
    lang: s.tmdbLang || 'zh-CN',
    apiBase: s.tmdbApiBase || 'https://api.themoviedb.org/3',
    imgBase: s.tmdbImgBase || 'https://image.tmdb.org/t/p/w500'
  }
}

/** 用指定名字重新匹配 TMDB（movie/剧集），供编辑弹窗「重新匹配」预览 */
async function scrapeByName(query: string, isTv: boolean): Promise<ScrapeResult | null> {
  if (!useSettings().settings.tmdbKey || !query.trim()) return null
  return scrapeMedia(tmdbCfg(), query, isTv)
}

/** 按名字搜 TMDB 返回多个候选（编辑弹窗有多个匹配时让用户选） */
async function searchByName(query: string, isTv: boolean): Promise<TmdbCandidate[]> {
  if (!useSettings().settings.tmdbKey || !query.trim()) return []
  return searchTmdb(tmdbCfg(), query, isTv)
}

/** 把用户选中的候选项拉成完整元数据（详情 + 演职人员） */
async function scrapeCandidate(cand: TmdbCandidate): Promise<ScrapeResult | null> {
  if (!useSettings().settings.tmdbKey) return null
  return scrapeById(tmdbCfg(), cand)
}

/** 取剧集的季列表（编辑元数据时多季可选） */
async function loadTvSeasons(tvId: number): Promise<TmdbSeason[]> {
  if (!useSettings().settings.tmdbKey) return []
  return getTvSeasons(tmdbCfg(), tvId)
}

// TMDB 分集缓存（按 tmdbId:season），避免重复请求
const tvEpisodeCache: Record<string, TmdbEpisode[]> = {}
/** 文件源剧集：用 TMDB 分集数据填每集真实集名/简介/剧照/时长（详情页按需，按 episode 号对应）。
 * 分集号来自文件名自然序，与 TMDB 对得上就填、对不上就保持「第 N 集」——尽力而为、不强求。 */
async function loadEpisodeNames(item: MediaItem) {
  if (!item.id.startsWith('local-series:') || !item.tmdbId || !item.seasons?.length) return
  if (!useSettings().settings.tmdbKey) return
  const cfg = tmdbCfg()
  const tvId = item.tmdbId
  for (const season of item.seasons) {
    const key = `${tvId}:${season.season}`
    let eps = tvEpisodeCache[key]
    if (!eps) {
      eps = await getTvEpisodes(cfg, tvId, season.season)
      tvEpisodeCache[key] = eps
    }
    if (!eps.length) continue
    const byNum = new Map(eps.map((e) => [e.episode, e]))
    for (const ep of season.episodes) {
      const te = byNum.get(ep.episode)
      if (!te) continue
      if (te.title) ep.title = te.title
      if (te.overview) ep.overview = te.overview
      if (te.stillUrl) ep.stillUrl = te.stillUrl
      if (te.runtime) ep.runtime = te.runtime
    }
  }
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

// 用户手动标记「这些视频是电影、别聚合成剧集」（如指环王三部曲被误当剧集时）；按视频 id 记
const FORCE_MOVIES_KEY = 'neko-force-movies'
function loadForceMovies(): Record<string, true> {
  try {
    const raw = pget(FORCE_MOVIES_KEY)
    return raw ? (JSON.parse(raw) as Record<string, true>) : {}
  } catch {
    return {}
  }
}
const forceMovies: Record<string, true> = loadForceMovies()

// 最近一次扫到的原始文件条目（未聚合），供手动分组后免重扫、就地重聚合
let lastRawFileItems: MediaItem[] = []

/** 重新聚合文件源条目（不重扫），套手动覆盖后刷进库 */
function reaggregateFiles() {
  const embyItems = state.items.filter((m) => !isFileItem(m))
  const aggregated = aggregateFileItems(lastRawFileItems)
  for (const m of aggregated) applyOverride(m)
  state.items = [...embyItems, ...aggregated]
  regroupTmdbCollections()
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

/** 把一部（被误聚合的）剧集拆成单独的电影：成员视频标记为「强制电影」，不再参与聚合。
 * 用于指环王三部曲这类「系列电影」被当成剧集时。 */
function disbandToMovies(seriesItem: MediaItem) {
  const ids = seriesItem.seasons?.flatMap((s) => s.episodes.map((e) => e.id)) ?? []
  if (!ids.length) return
  for (const id of ids) forceMovies[id] = true
  pset(FORCE_MOVIES_KEY, JSON.stringify(forceMovies))
  // 若它同时是手动剧集，也一并撤掉手动分组
  if (seriesItem.id.startsWith('local-series:manual:')) {
    delete manualSeries[seriesItem.id.replace('local-series:manual:', '')]
    pset(MANUAL_KEY, JSON.stringify(manualSeries))
  }
  reaggregateFiles()
}
/** 撤销「强制电影」标记（还原自动识别）——供把误拆的重新交回自动聚合 */
function clearForceMovies(ids: string[]) {
  let changed = false
  for (const id of ids) if (forceMovies[id]) (delete forceMovies[id], (changed = true))
  if (changed) {
    pset(FORCE_MOVIES_KEY, JSON.stringify(forceMovies))
    reaggregateFiles()
  }
}

/** 清除某条目的手动元数据覆盖，还原自动识别 */
function clearMetaOverride(id: string) {
  if (!overrides[id]) return
  delete overrides[id]
  pset(OVERRIDE_KEY, JSON.stringify(overrides))
  reaggregateFiles()
}

// ---- 文件源视频媒体信息探测（tech，用 mpv）----
const PROBE_KEY = 'neko-probe-cache'
const PROBE_VER = '3' // 探测字段变了（加音轨/字幕轨道）就 +1，旧缓存作废重探
/** 一条探测结果：技术信息 + 轨道列表 */
interface ProbeEntry {
  tech: MediaTech
  tracks: MediaTracks
}
function loadProbeCache(): Record<string, ProbeEntry> {
  try {
    if (pget('neko-probe-ver') !== PROBE_VER) return {}
    const raw = pget(PROBE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, ProbeEntry>) : {}
  } catch {
    return {}
  }
}
const probeCache: Record<string, ProbeEntry> = loadProbeCache()
let probeTimer: ReturnType<typeof setTimeout> | undefined
function saveProbeCache() {
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = setTimeout(() => {
    pset(PROBE_KEY, JSON.stringify(probeCache))
    pset('neko-probe-ver', PROBE_VER)
  }, 800)
}
function humanSize(n: number): string {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}
interface ProbeInfo {
  width: number
  height: number
  duration: number
  videoCodec: string
  audioCodec: string
  channels: number
  gamma: string
  size: number
}
function buildTech(path: string, info: ProbeInfo): MediaTech {
  const h = info.height
  const quality =
    h >= 2000 ? '4K' : h >= 1080 ? '1080P' : h >= 720 ? '720P' : h >= 480 ? '480P' : h ? h + 'P' : '—'
  const hdr = /pq|hlg|smpte2084|arib-std-b67|2020/i.test(info.gamma) ? 'HDR' : 'SDR'
  const ext = (path.split(/[?#]/)[0].split('.').pop() || '').toUpperCase()
  return {
    resolution: info.width && info.height ? `${info.width}×${info.height}` : '—',
    quality,
    dynamicRange: hdr,
    videoCodec: (info.videoCodec || '—').toUpperCase(),
    audioCodec: (info.audioCodec || '—').toUpperCase() + (info.channels ? ` · ${info.channels}ch` : ''),
    fileSize: humanSize(info.size),
    bitrate:
      info.size && info.duration ? Math.round((info.size * 8) / info.duration / 1000) + ' kbps' : '—',
    container: ext || '—',
    filePath: path,
    resolutions: [],
    audioTracks: []
  }
}

// 探测某个文件路径的媒体信息 + 轨道，挂到 target.tech/tracks（缓存、需 mpv）。target 可是条目或单集
async function probePath(target: { tech?: MediaTech; tracks?: MediaTracks }, path: string) {
  const nn = window.nekoNative
  if (!nn?.probeMedia || target.tech) return
  const cached = probeCache[path]
  if (cached) {
    target.tech = cached.tech
    target.tracks = cached.tracks
    return
  }
  const info = await nn.probeMedia(path, useSettings().settings.playerPaths.mpv || '')
  if (!info || !info.width) return // 没探到真实画面信息（mpv 缺失等）→ 不显示半空的信息框，保留路径行
  const tech = buildTech(path, info)
  const tracks: MediaTracks = info.tracks || { audio: [], sub: [] }
  probeCache[path] = { tech, tracks }
  target.tech = tech
  target.tracks = tracks
  saveProbeCache()
}
/** 探测文件源条目媒体信息 + 轨道并挂到 item.tech/tracks（缓存、按需，需 mpv）；剧集探首集作代表 */
async function probeFileTech(item: MediaItem) {
  const path = item.localPath || item.seasons?.[0]?.episodes?.[0]?.localPath
  if (path) await probePath(item, path)
}
/** 探测文件源某一集的媒体信息 + 轨道并挂到 ep.tech/tracks（详情页点该集时用） */
async function probeFileEpisode(ep: Episode) {
  if (ep.localPath) await probePath(ep, ep.localPath)
}

// 从 Emby 媒体信息组技术信息。总返回一个（哪怕无视频流也带回大小/码率/路径，先即时显示）；
// 分辨率/编码/HDR 缺失时用 '—' 占位，随后由 mpv 探测覆盖成完整值。
function buildEmbyTech(info: EmbyMediaInfo): MediaTech {
  const v = info.video
  const h = v?.height || 0
  const quality =
    h >= 2000 ? '4K' : h >= 1080 ? '1080P' : h >= 720 ? '720P' : h >= 480 ? '480P' : h ? h + 'P' : '—'
  const hdr = v ? (/hdr|hlg|dovi|dolby|pq|2020/i.test(v.range) ? 'HDR' : 'SDR') : '—'
  const ext = (info.container || info.path.split(/[?#]/)[0].split('.').pop() || '').toUpperCase()
  const a = info.audioPrimary
  return {
    resolution: v?.width && v?.height ? `${v.width}×${v.height}` : '—',
    quality,
    dynamicRange: hdr,
    videoCodec: v?.codec ? v.codec.toUpperCase() : '—',
    audioCodec: a ? (a.codec || '—').toUpperCase() + (a.channels ? ` · ${a.channels}ch` : '') : '—',
    fileSize: humanSize(info.size),
    bitrate: info.bitrate ? Math.round(info.bitrate / 1000) + ' kbps' : '—',
    container: ext || '—',
    filePath: info.path || '',
    resolutions: [],
    audioTracks: []
  }
}

// Emby/Jellyfin 条目媒体信息（内存缓存，按取轨的目标 id）；供详情页音轨/字幕预选 + 视频格式/路径
const embyTracksCache: Record<string, { tracks: MediaTracks; tech?: MediaTech }> = {}
// 拉 targetId 的媒体信息（音轨/字幕 + 视频格式/路径）挂到 target.tech/tracks。target 可是条目或单集
async function loadEmbyInfo(target: { tech?: MediaTech; tracks?: MediaTracks }, s: EmbySession, targetId: string) {
  if (target.tracks) return
  const cached = embyTracksCache[targetId]
  if (cached) {
    target.tracks = cached.tracks
    if (cached.tech) target.tech = cached.tech
    return
  }
  try {
    const info = await getMediaInfo(s, targetId)
    let tracks = info.tracks
    let tech = buildEmbyTech(info)
    // 服务器信息先即时上屏（大小/码率/路径；标准 Emby 还含分辨率/编码）——让「文件信息」框先出来，不空等探测
    target.tech = tech
    // 魔改/网盘版 Emby 常不返回 MediaStreams（实测 tv.bmhyk.vip 连 PlaybackInfo 都空）→ 用自带 mpv 探测直连流
    // 补齐分辨率/编码/HDR + 轨道（复用 info.streamUrl，省一次条目详情请求；轨道号必与播放一致）
    if (!info.video || (!tracks.audio.length && !tracks.sub.length)) {
      const nn = window.nekoNative
      if (nn?.probeMedia && info.streamUrl) {
        const probe = await nn.probeMedia(info.streamUrl, useSettings().settings.playerPaths.mpv || '')
        if (probe?.tracks && (probe.tracks.audio.length || probe.tracks.sub.length)) tracks = probe.tracks
        // 探到真实画面 → 用探测结果覆盖成完整技术信息（路径优先用服务器给的）
        if (probe?.width) {
          tech = buildTech(info.path || info.streamUrl.split('?')[0], probe)
          target.tech = tech
        }
      }
    }
    embyTracksCache[targetId] = { tracks, tech }
    target.tracks = tracks
  } catch {
    /* 取信息失败：忽略（播放器里仍可切轨） */
  }
}
/** 拉 Emby/Jellyfin 条目的音轨/字幕 + 视频格式/路径挂到 item（详情页按需）。
 * 电影取自身；剧集取代表集（续看集/第一集，需季集已加载，未加载则等加载后重调）。 */
async function loadEmbyTracks(item: MediaItem) {
  if (item.tracks || item.localPath || item.id.startsWith('local-series:') || item.type === 'collection')
    return
  const s = useSources().sessionOf(item.sourceId)
  if (!s) return // 非 Emby/Jellyfin 源（无会话）
  let targetId = item.id
  if (item.type === 'series') {
    const eps = item.seasons?.flatMap((se) => se.episodes) ?? []
    if (!eps.length) return // 季集还没加载完，seasons 到位后 DetailView 会再调
    const rep =
      eps.find((e) => (e.progress ?? 0) > 0 && (e.progress ?? 0) < 1) ||
      eps.find((e) => !e.watched) ||
      eps[0]
    targetId = rep.id
  }
  await loadEmbyInfo(item, s, targetId)
}
/** 拉 Emby/Jellyfin 某一集的音轨/字幕 + 视频格式并挂到 ep（详情页点该集时用） */
async function loadEmbyEpisode(ep: Episode, sourceId: string) {
  const s = useSources().sessionOf(sourceId)
  if (s) await loadEmbyInfo(ep, s, ep.id)
}

// 把外部拉到的条目并入库（按 id 去重），使详情页 getById 能找到、可导航
function mergeItems(list: MediaItem[]) {
  const have = new Set(state.items.map((m) => m.id))
  const add = list.filter((m) => !have.has(m.id))
  if (add.length) state.items.push(...add)
}
/** 「发现作品」：取某演职人员的参演作品。
 * Emby/Jellyfin → 库内条目（并入库、可点开可播）；文件源 → TMDB 组合作品（仅展示、不可播）。 */
async function loadPersonWorks(sourceId: string, personId: string): Promise<MediaItem[]> {
  const s = useSources().sessionOf(sourceId)
  if (s) {
    const raw = await getPersonItems(s, personId).catch(() => [] as EmbyItem[])
    const works = raw.map((it) => mapEmbyItem(it, s))
    mergeItems(works)
    return works
  }
  // 文件源：无服务器，走 TMDB combined_credits（人物 id 即 TMDB person id）
  const settings = useSettings().settings
  if (!settings.tmdbKey) return []
  const cfg: TmdbConfig = {
    key: settings.tmdbKey,
    lang: settings.tmdbLang || 'zh-CN',
    apiBase: settings.tmdbApiBase || 'https://api.themoviedb.org/3',
    imgBase: settings.tmdbImgBase || 'https://image.tmdb.org/t/p/w500'
  }
  const credits = await getPersonCredits(personId, cfg)
  // 已入库的同一作品（按 tmdbId + 类型匹配）→ 换成库内真实条目（可点开、有 localPath/文件信息）；
  // 未入库的保留 TMDB 占位（PersonView 里不可点，只展示海报）
  return credits.map((w) => {
    if (!w.tmdbId) return w
    const lib = state.items.find(
      (m) => m.tmdbId === w.tmdbId && m.type === w.type && !m.id.startsWith('tmdb-person-work:')
    )
    return lib || w
  })
}

// Trakt 列表条目的 TMDB 元数据缓存（按 type:tmdbId），避免重复请求
const traktMetaCache: Record<string, Partial<MediaItem> | null> = {}

/** 「Trakt 列表」：拉某个列表（想看/评分/收藏）→ 已入库的（按 tmdbId+类型匹配）换成库内条目（可点开进详情）、
 * 未入库的建占位并从 TMDB 补海报/简介（返回前补齐，故交给 ref 后即有海报）。需已连接 Trakt。 */
async function loadTraktItems(kind: TraktTab): Promise<MediaItem[]> {
  const raw = await useTrakt().loadList(kind)
  if (!raw.length) return []
  const s = useSettings().settings
  const cfg: TmdbConfig | null = s.tmdbKey
    ? {
        key: s.tmdbKey,
        lang: s.tmdbLang || 'zh-CN',
        apiBase: s.tmdbApiBase || 'https://api.themoviedb.org/3',
        imgBase: s.tmdbImgBase || 'https://image.tmdb.org/t/p/w500'
      }
    : null
  const result: MediaItem[] = []
  const stubs: { tmdb: number; isTv: boolean; item: MediaItem }[] = []
  for (const it of raw) {
    const wantSeries = it.type === 'show'
    // 已入库（文件源刮削后有 tmdbId）→ 用库内条目，可点开进详情
    const lib = it.ids.tmdb
      ? state.items.find(
          (m) => m.tmdbId === it.ids.tmdb && (wantSeries ? m.type === 'series' : m.type === 'movie')
        )
      : undefined
    if (lib) {
      result.push(lib)
      continue
    }
    // 未入库 → 建占位（Trakt 只给标题/年份，海报稍后从 TMDB 补）
    const stub: MediaItem = {
      id: `trakt:${kind}:${it.type}:${it.ids.trakt ?? it.ids.tmdb ?? it.title}`,
      sourceId: '',
      title: it.title,
      type: wantSeries ? 'series' : 'movie',
      year: it.year,
      runtime: 0,
      rating: it.rating ?? 0, // 评分列表用用户评分；其余等 TMDB 补
      certification: '',
      genres: [],
      overview: '',
      cast: [],
      addedAt: 0,
      tmdbId: it.ids.tmdb,
      scraped: true
    }
    result.push(stub)
    if (cfg && it.ids.tmdb) stubs.push({ tmdb: it.ids.tmdb, isTv: wantSeries, item: stub })
  }
  // 并发补 TMDB 海报/简介（占位条目）；限 8 并发、最多补前 120 个（避免超大列表首次久等，
  // 靠后的先用 PosterImage 的占位封面，缓存后再访问会补上）
  if (cfg && stubs.length) {
    const cap = Math.min(stubs.length, 120)
    let idx = 0
    const worker = async () => {
      while (idx < cap) {
        const { tmdb, isTv, item } = stubs[idx++]
        const key = `${isTv ? 'tv' : 'movie'}:${tmdb}`
        if (!(key in traktMetaCache)) traktMetaCache[key] = await getTmdbMeta(cfg, isTv, tmdb)
        const meta = traktMetaCache[key]
        if (meta) {
          if (meta.posterUrl) item.posterUrl = meta.posterUrl
          if (meta.backdropUrl) item.backdropUrl = meta.backdropUrl
          if (meta.overview) item.overview = meta.overview
          if (!item.rating && meta.rating) item.rating = meta.rating
          if (meta.genres?.length) item.genres = meta.genres
        }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker))
  }
  return result
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
    regroupTmdbCollections() // 刮到「所属系列」后按 TMDB 聚合系列电影为合集（散落目录也能归组）
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

const isFileItem = (m: MediaItem) =>
  m.id.startsWith('local:') ||
  m.id.startsWith('local-series:') ||
  m.id.startsWith('local-collection:')

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
const SEASON_SEG = /^(?:season\s*\d+|第\s*[\d一二三四五六七八九十]+\s*季|s\d{1,2})$/i
// 中文数字 → 阿拉伯数字（一~九十九，季号够用）
function cnNum(s: string): number {
  const D: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  if (/^\d+$/.test(s)) return +s
  if (s in D) return D[s]
  const m = s.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/)
  if (m) return (m[1] ? D[m[1]] : 1) * 10 + (m[2] ? D[m[2]] : 0)
  return 0
}
// 从文件夹段解析「剧名 base + 季号」，使同剧各季归到一个 showFolder（爱情公寓1/2/3… → 爱情公寓 第1/2/3 季）。
// 先经 folderShowName 清掉序号/年份/画质，再识别：第X季(含中文数字)/Season N/SNN/**末尾裸数字**。
function parseShowSeason(seg: string): { base: string; season: number } {
  const cleaned = folderShowName(seg)
  let m = cleaned.match(/^(.*?)[\s._-]*(?:第\s*([\d一二三四五六七八九十]+)\s*季|season\s*(\d{1,2})|s(\d{1,2}))\s*$/i)
  if (m) {
    const n = cnNum(m[2] || m[3] || m[4])
    if (n) return { base: m[1].trim() || cleaned, season: n }
  }
  // 末尾裸数字当季号（爱情公寓2 → 爱情公寓 第2季）；要求前面有非数字（避免「25」这类纯数字标题被拆）
  m = cleaned.match(/^(.*?\D)\s*(\d{1,2})\s*$/)
  if (m) return { base: m[1].trim(), season: +m[2] }
  return { base: cleaned, season: 1 }
}
/** 剧集所在的「剧文件夹」：末段是季文件夹时取其父，否则取本身 */
function showFolder(folder: string): string {
  const parts = folder.split('/').filter(Boolean)
  if (!parts.length) return ''
  const last = parts[parts.length - 1]
  // 纯季子文件夹（「剧名/Season 2」）→ 取父文件夹当剧
  if (parts.length >= 2 && SEASON_SEG.test(last)) return parts.slice(0, -1).join('/')
  // 季/番号写在文件夹名里（「剧名 第二季」「爱情公寓2」）→ 取 base 归并各季 → 聚合成一部多季剧
  const { base } = parseShowSeason(last)
  return [...parts.slice(0, -1), base].join('/')
}
/** 从文件夹末段推季号（无则第 1 季）；支持 Season N / 第N季（含中文数字）/ SNN / 末尾裸数字 */
function seasonFromFolder(folder: string): number {
  const last = folder.split('/').filter(Boolean).pop() ?? ''
  return parseShowSeason(last).season
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
    tmdbId: info?.tmdbId,
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
    if (forceMovies[m.id]) {
      out.push(m) // 用户手动标记为电影 → 原样保留、不聚合成剧集
      continue
    }
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
    // 电影合集（如指环王三部曲）判定 → 保持电影、不聚合。两种信号（任一即可，且都要求 <5 个）：
    // ①每个视频各占一个子文件夹（指环王1/指环王2/… 各 1 个文件）——剧集的一季文件夹里是一堆分集，不会各占一夹；
    // ②都各自刮成了不同电影名。≥5 个基本是剧集，直接聚合。
    const distinctFolders = new Set(g.map((m) => m.folder ?? '')).size
    const isCollection =
      g.length < 5 &&
      (distinctFolders === g.length ||
        (g.every((m) => m.scraped) && new Set(g.map((m) => m.title)).size === g.length))
    // 看着像「各自独立的电影」（各占一子文件夹 / 各刮成不同片名）→ 不聚合成剧集，按电影处理。
    // 系列电影的合集化改由 regroupTmdbCollections 事后按 TMDB belongs_to_collection 归组
    //（依据媒体信息而非文件夹，故散落在不同目录的系列电影也能聚合，见 issue「指环王」）。
    if (isCollection && g.length >= 2) {
      out.push(...g)
      continue
    }
    if (g.length < 3) {
      out.push(...g) // 太少且非系列 → 各是电影
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

/** 按 TMDB「所属系列」(belongs_to_collection) 把文件源系列电影聚合成合集条目。
 * 依据媒体信息而非文件夹——散落在不同目录的系列电影也能归组（如指环王）。
 * 刮削完成后调用；幂等，可重复执行（会清理失效合集、重建有效合集）。 */
function regroupTmdbCollections() {
  // 1. 收集带「所属系列」的文件源电影，按 源 + 系列 id 分组
  const groups = new Map<string, MediaItem[]>()
  for (const m of state.items) {
    if (m.type !== 'movie' || !m.localPath || !m.tmdbCollectionId) continue
    const key = m.sourceId + ':' + m.tmdbCollectionId
    ;(groups.get(key) ?? (groups.set(key, []), groups.get(key)!)).push(m)
  }
  // 2. ≥2 部才成合集
  const validIds = new Set<string>()
  for (const [key, members] of groups) {
    if (members.length >= 2) validIds.add('local-collection:' + key)
  }
  // 3. 清理失效：不再属于有效合集的电影去掉 collectionId；删掉成员不足的自动合集条目
  for (const m of state.items) {
    if (m.collectionId?.startsWith('local-collection:') && !validIds.has(m.collectionId)) {
      m.collectionId = undefined
    }
  }
  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i]
    if (it.type === 'collection' && it.id.startsWith('local-collection:') && !validIds.has(it.id)) {
      state.items.splice(i, 1)
    }
  }
  // 4. 建立/更新有效合集，成员打上 collectionId（从浏览区收起，只在合集里出现）
  for (const [key, members] of groups) {
    if (members.length < 2) continue
    const id = 'local-collection:' + key
    const sorted = members.slice().sort((a, b) => (a.year || 0) - (b.year || 0))
    for (const m of sorted) m.collectionId = id
    const cover = sorted.find((m) => m.posterUrl) ?? sorted[0]
    const name = sorted.find((m) => m.tmdbCollectionName)?.tmdbCollectionName || cover.title
    const rating = sorted.reduce((a, m) => Math.max(a, m.rating), 0)
    const existing = state.items.find((it) => it.id === id)
    if (existing) {
      existing.title = name
      existing.posterUrl = cover.posterUrl
      existing.backdropUrl = existing.backdropUrl || cover.backdropUrl
      existing.rating = rating
    } else {
      state.items.push({
        id,
        sourceId: sorted[0].sourceId,
        title: name,
        type: 'collection',
        year: 0,
        runtime: 0,
        rating,
        certification: '',
        genres: [],
        overview: '',
        cast: [],
        addedAt: sorted.reduce((a, m) => Math.max(a, m.addedAt), 0),
        posterUrl: cover.posterUrl,
        backdropUrl: cover.backdropUrl,
        libraryId: 'file:other',
        libraryName: '其他'
      })
    }
  }
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
    regroupTmdbCollections() // 用缓存里的所属系列信息即时聚合系列电影（未刮到的等 scrapeFileItems 补）
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
    featuredList,
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
    searchByName,
    scrapeCandidate,
    loadTvSeasons,
    loadEpisodeNames,
    clearMetaOverride,
    saveManualSeries,
    removeManualSeries,
    disbandToMovies,
    probeFileTech,
    probeFileEpisode,
    loadEmbyTracks,
    loadEmbyEpisode,
    loadPersonWorks,
    loadTraktItems,
    mergeItems
  }
}
