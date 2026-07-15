<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FolderTree, LayoutGrid, ChevronLeft, ChevronRight, RotateCw } from 'lucide-vue-next'
import TopBar from '@/components/layout/TopBar.vue'
import SourceTabs from '@/components/library/SourceTabs.vue'
import LibraryTabs from '@/components/library/LibraryTabs.vue'
import HeroBanner from '@/components/library/HeroBanner.vue'
import MediaRow from '@/components/library/MediaRow.vue'
import PosterGrid from '@/components/library/PosterGrid.vue'
import PosterCard from '@/components/library/PosterCard.vue'
import ContinueCard from '@/components/library/ContinueCard.vue'
import SkeletonCard from '@/components/library/SkeletonCard.vue'
import FolderBrowser from '@/components/library/FolderBrowser.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useSources } from '@/composables/useSources'
import { useEmby } from '@/composables/useEmby'
import { usePlayer } from '@/composables/usePlayer'
import { useBackground } from '@/composables/useBackground'
import type { MediaItem } from '@/types/media'

const router = useRouter()

const { error: connectError } = useEmby()
const { getSource } = useSources()

const {
  items,
  query,
  category,
  sort,
  counts,
  activeFilterCount,
  filtered,
  continueWatching,
  recentlyAdded,
  forYou,
  becauseYouWatched,
  movies,
  series,
  collections,
  featuredList,
  refreshFeatured,
  loading,
  error,
  loadFromEmby,
  activeSourceId,
  bySource,
  fileViewMode,
  setFileViewMode,
  toggleFavorite,
  setQuery,
  setCategory,
  setSort
} = useLibrary()

// 文件源「库视图」用的网格：当前源全部条目按标题排序（系列电影成员收进合集卡、不单列）
const fileGridItems = computed(() =>
  [...bySource.value]
    .filter((m) => !m.collectionId)
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
)

const player = usePlayer()

// 首页精选轮播：多部循环切换，7s 自动切；切源/列表变化时重置。slideDir 决定滑入/滑出方向
const heroIndex = ref(0)
const slideDir = ref<'next' | 'prev'>('next')
const heroItem = computed(() => featuredList.value[heroIndex.value] ?? featuredList.value[0])
let heroTimer: ReturnType<typeof setInterval> | undefined
function startHeroRotate() {
  clearInterval(heroTimer)
  heroTimer = setInterval(() => {
    const n = featuredList.value.length
    if (n > 1) {
      slideDir.value = 'next'
      heroIndex.value = (heroIndex.value + 1) % n
    }
  }, 7000)
}
function nextHero() {
  const n = featuredList.value.length
  if (n < 2) return
  slideDir.value = 'next'
  heroIndex.value = (heroIndex.value + 1) % n
  startHeroRotate() // 手动切后重置计时
}
function prevHero() {
  const n = featuredList.value.length
  if (n < 2) return
  slideDir.value = 'prev'
  heroIndex.value = (heroIndex.value - 1 + n) % n
  startHeroRotate()
}
function goHero(i: number) {
  slideDir.value = i >= heroIndex.value ? 'next' : 'prev'
  heroIndex.value = i
  startHeroRotate()
}
// 换一批精选：重挑 6 部（heroIndex 由 watch(featuredList) 归 0），并重置自动切换计时
function onRefreshFeatured() {
  refreshFeatured()
  startHeroRotate()
}
watch(featuredList, () => (heroIndex.value = 0))
startHeroRotate()
onBeforeUnmount(() => clearInterval(heroTimer))

// 全局海报背景：跟随当前精选（换批/自动切换时同步）
const { setBackdrop } = useBackground()
watch(heroItem, (it) => setBackdrop(it?.backdropUrl || it?.posterUrl), { immediate: true })

// 当前选中的是「文件浏览类源」（本机/WebDAV/SMB/DLNA）→ 默认视图走文件夹层级浏览
const FILE_KINDS = ['local', 'webdav', 'smb', 'dlna']
const activeFileSource = computed(() => {
  const s = getSource(activeSourceId.value)
  return s && FILE_KINDS.includes(s.kind) ? s : null
})

// 有搜索、切到具体分类、或启用了筛选时，都改为展示「筛选/结果网格」而非首页浏览布局
const browseMode = computed(
  () => category.value === 'all' && !query.value.trim() && activeFilterCount.value === 0
)

const gridTitle = computed(() => {
  if (query.value.trim()) return `搜索结果 · “${query.value.trim()}”`
  if (category.value === 'movie') return '全部电影'
  if (category.value === 'series') return '全部剧集'
  if (category.value === 'favorite') return '我的收藏'
  if (activeFilterCount.value > 0) return '筛选结果'
  return '全部'
})

function play(item: MediaItem) {
  player.play(item)
}
</script>

<template>
  <div class="library">
    <div class="library__topbar">
      <SourceTabs />
      <LibraryTabs />
      <TopBar
        :query="query"
        :category="category"
        :sort="sort"
        :counts="counts"
        @update:query="setQuery"
        @update:category="setCategory"
        @update:sort="setSort"
      />
    </div>

    <div class="library__scroll">
      <!-- 已有内容时的后台拉取提示（首次无内容走下方骨架屏） -->
      <div v-if="loading && items.length" class="library__loading-pill">
        <span class="library__mini-spin" />
        正在拉取媒体信息…
      </div>

      <!-- 首次加载（无缓存）：骨架屏。有缓存时直接显示旧内容并后台刷新 -->
      <div v-if="loading && !items.length" class="library__body library__body--filter">
        <div class="library__skeleton">
          <SkeletonCard v-for="n in 18" :key="n" />
        </div>
      </div>

      <!-- 加载失败 -->
      <div v-else-if="error" class="library__state">
        <p class="library__state-title">媒体库加载失败喵 (⊙﹏⊙)</p>
        <p class="library__state-sub">{{ error }}</p>
        <button class="library__state-btn" :disabled="loading" @click="loadFromEmby()">
          {{ loading ? '重试中…' : '重试' }}
        </button>
      </div>

      <!-- 空 / 连接失败 -->
      <div v-else-if="!items.length" class="library__state">
        <template v-if="connectError">
          <p class="library__state-title">连接 Emby 失败喵 (⊙﹏⊙)</p>
          <p class="library__state-sub">{{ connectError }}</p>
        </template>
        <template v-else>
          <p class="library__state-title">还没有媒体内容</p>
          <p class="library__state-sub">去「媒体源」页添加你的媒体服务器就能看到内容啦喵～</p>
        </template>
        <button class="library__state-btn" @click="router.push('/sources')">前往媒体源</button>
      </div>

      <!-- 正常内容 -->
      <template v-else>
        <!-- 文件源：文件夹层级浏览 / 库网格 可切换（搜索/切分类时仍回退到下方结果网格） -->
        <div v-if="activeFileSource && browseMode" class="library__body library__body--filter">
          <div class="viewtoggle">
            <button
              class="viewtoggle__btn"
              :class="{ on: fileViewMode === 'folder' }"
              @click="setFileViewMode('folder')"
            >
              <FolderTree :size="15" /> 文件夹
            </button>
            <button
              class="viewtoggle__btn"
              :class="{ on: fileViewMode === 'library' }"
              @click="setFileViewMode('library')"
            >
              <LayoutGrid :size="15" /> 库视图
            </button>
          </div>
          <FolderBrowser
            v-if="fileViewMode === 'folder'"
            :items="bySource"
            :root-name="activeFileSource.name"
            @favorite="toggleFavorite"
            @play="play"
          />
          <PosterGrid v-else :items="fileGridItems" @favorite="toggleFavorite" @play="play" />
        </div>

        <template v-else-if="browseMode">
          <div v-if="heroItem" class="library__hero">
            <div class="library__hero-track">
              <transition :name="'hero-' + slideDir">
                <HeroBanner :key="heroItem.id" :item="heroItem" @play="play" />
              </transition>
            </div>
            <button class="library__hero-refresh" title="换一批精选" @click="onRefreshFeatured">
              <RotateCw :size="16" /> 换一批
            </button>
            <template v-if="featuredList.length > 1">
              <button
                class="library__hero-nav library__hero-nav--prev"
                title="上一个"
                @click="prevHero"
              >
                <ChevronLeft :size="26" />
              </button>
              <button
                class="library__hero-nav library__hero-nav--next"
                title="下一个"
                @click="nextHero"
              >
                <ChevronRight :size="26" />
              </button>
              <div class="library__hero-dots">
                <button
                  v-for="(f, i) in featuredList"
                  :key="f.id"
                  class="library__hero-dot"
                  :class="{ on: i === heroIndex }"
                  :title="f.title"
                  @click="goHero(i)"
                />
              </div>
            </template>
          </div>

          <div class="library__body">
            <MediaRow v-if="continueWatching.length" title="继续观看" item-width="300px">
              <ContinueCard
                v-for="it in continueWatching"
                :key="it.id"
                :item="it"
                @play="play"
              />
            </MediaRow>

            <!-- 个性化推荐（从库内已看的类型偏好推得，纯本地） -->
            <MediaRow v-if="forYou.length" title="为你推荐" item-width="158px">
              <PosterCard
                v-for="it in forYou"
                :key="it.id"
                :item="it"
                @favorite="toggleFavorite"
                @play="play"
              />
            </MediaRow>

            <MediaRow
              v-for="rec in becauseYouWatched"
              :key="rec.anchor.id"
              :title="`因为你看了《${rec.anchor.title}》`"
              item-width="158px"
            >
              <PosterCard
                v-for="it in rec.items"
                :key="it.id"
                :item="it"
                @favorite="toggleFavorite"
                @play="play"
              />
            </MediaRow>

            <MediaRow v-if="recentlyAdded.length" title="最近添加" item-width="158px">
              <PosterCard
                v-for="it in recentlyAdded"
                :key="it.id"
                :item="it"
                @favorite="toggleFavorite"
                @play="play"
              />
            </MediaRow>

            <PosterGrid v-if="collections.length" title="合集" :items="collections" @favorite="toggleFavorite" @play="play" />
            <PosterGrid v-if="movies.length" title="电影" :items="movies" @favorite="toggleFavorite" @play="play" />
            <PosterGrid v-if="series.length" title="剧集" :items="series" @favorite="toggleFavorite" @play="play" />
          </div>
        </template>

        <div v-else class="library__body library__body--filter">
          <PosterGrid
            :title="gridTitle"
            :items="filtered"
            @favorite="toggleFavorite"
            @play="play"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.library {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.library__topbar {
  flex-shrink: 0;
  padding: 20px 34px 0;
}
.library__scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 44px;
}
.library__hero {
  position: relative;
  padding: 6px 34px 0;
  /* HeroBanner 自身不再带下边距，改由此处给与下方内容的间距 */
  margin-bottom: 34px;
}
/* 轮播「视口」：裁掉滑动中溢出的旧/新横幅，实现旧滑出、新紧跟滑入（无空白） */
.library__hero-track {
  position: relative;
  overflow: hidden;
  border-radius: var(--r-xl);
}
/* 换一批精选：和左右切换按钮一样，平时隐藏、悬浮 Hero 才显示 */
.library__hero-refresh {
  position: absolute;
  top: 22px;
  right: 52px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--r-pill);
  backdrop-filter: var(--blur);
  opacity: 0;
  transition: opacity var(--dur) var(--ease), background var(--dur) var(--ease);
}
.library__hero:hover .library__hero-refresh {
  opacity: 1;
}
.library__hero-refresh:hover {
  background: rgba(0, 0, 0, 0.72);
}
.library__hero-refresh:active {
  transform: scale(0.96);
}

/* 悬浮时左右两侧的切换按钮 */
.library__hero-nav {
  position: absolute;
  top: 50%;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: var(--blur);
  opacity: 0;
  transform: translateY(-50%) scale(0.9);
  transition: opacity var(--dur) var(--ease), background var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.library__hero:hover .library__hero-nav {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}
.library__hero-nav:hover {
  background: rgba(0, 0, 0, 0.72);
}
.library__hero-nav:active {
  transform: translateY(-50%) scale(0.92);
}
.library__hero-nav--prev {
  left: 16px;
}
.library__hero-nav--next {
  right: 16px;
}
/* 底部居中触点：直接切到对应精选（active 拉长成胶囊） */
.library__hero-dots {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  display: flex;
  gap: 9px;
  padding: 7px 12px;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: var(--blur);
}
.library__hero-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  transition: background var(--dur) var(--ease), width var(--dur) var(--ease);
}
.library__hero-dot:hover {
  background: rgba(255, 255, 255, 0.75);
}
.library__hero-dot.on {
  width: 22px;
  border-radius: var(--r-pill);
  background: #fff;
}
.library__body {
  padding: 0 34px;
}
.library__body--filter {
  padding-top: 8px;
}

.viewtoggle {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.viewtoggle__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  border-radius: var(--r-pill);
  transition: color var(--dur), background var(--dur);
}
.viewtoggle__btn:hover {
  color: var(--text);
}
.viewtoggle__btn.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}

.library__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  height: 60vh;
  color: var(--text-mute);
}
.library__state-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-dim);
}
.library__state-sub {
  font-size: 14px;
}
.library__state-btn {
  margin-top: 8px;
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: var(--r-pill);
  box-shadow: 0 8px 22px var(--accent-glow);
}
.library__skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 20px;
}

.library__loading-pill {
  position: sticky;
  top: 6px;
  z-index: 5;
  width: fit-content;
  margin: 0 auto 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  backdrop-filter: var(--blur);
}
.library__mini-spin {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
