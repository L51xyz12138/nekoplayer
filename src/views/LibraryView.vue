<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { FolderTree, LayoutGrid } from 'lucide-vue-next'
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
  movies,
  series,
  collections,
  featured,
  loading,
  error,
  activeSourceId,
  bySource,
  fileViewMode,
  setFileViewMode,
  toggleFavorite,
  setQuery,
  setCategory,
  setSort
} = useLibrary()

// 文件源「库视图」用的网格：当前源全部条目按标题排序
const fileGridItems = computed(() =>
  [...bySource.value].sort((a, b) => a.title.localeCompare(b.title, 'zh'))
)

const player = usePlayer()

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
          <div v-if="featured" class="library__hero">
            <HeroBanner :item="featured" @play="play" />
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
  padding: 6px 34px 0;
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
