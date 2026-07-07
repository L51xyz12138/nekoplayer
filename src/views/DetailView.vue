<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import DetailHero from '@/components/detail/DetailHero.vue'
import EpisodeList from '@/components/detail/EpisodeList.vue'
import CastRow from '@/components/detail/CastRow.vue'
import MediaTechInfo from '@/components/detail/MediaTechInfo.vue'
import MediaRow from '@/components/library/MediaRow.vue'
import PosterCard from '@/components/library/PosterCard.vue'
import { useLibrary } from '@/composables/useLibrary'
import { usePlayer } from '@/composables/usePlayer'
import type { Episode, MediaItem } from '@/types/media'

const props = defineProps<{ id: string }>()

const router = useRouter()
const { getById, items, toggleFavorite, toggleWatched, loadSeasons } = useLibrary()
const player = usePlayer()

const item = computed(() => getById(props.id))

// 续看集 id：用于剧集列表自动定位/高亮到「正在看的那一集」
const resumeId = computed(() => (item.value ? player.resumeEpisodeOf(item.value)?.id : undefined))

const related = computed(() => {
  const cur = item.value
  if (!cur) return []
  return items.value
    .filter((m) => m.id !== cur.id && m.genres.some((g) => cur.genres.includes(g)))
    .slice(0, 10)
})

// 剧集：懒加载季/集列表。监听 item 对象本身——loadFromEmby（刷新/播放结束）会用
// 无 seasons 的新对象替换 item，此时需为新对象重新加载，否则剧集列表会消失
watch(
  item,
  (it) => {
    if (it && it.type === 'series' && !it.seasons) loadSeasons(it.id)
  },
  { immediate: true }
)

// 滚过 Hero 一定距离后，顶栏渐显磨砂背景 + 标题
const scrolled = ref(false)
function onScroll(e: Event) {
  scrolled.value = (e.target as HTMLElement).scrollTop > 400
}

function play() {
  const it = item.value
  if (!it) return
  if (it.type === 'series') {
    // 剧集：播续看的那一集（优先 NextUp），没有则播第一集
    const resume = player.resumeEpisodeOf(it)
    if (resume) player.play(it, resume)
  } else {
    player.play(it)
  }
}
function playEpisode(ep: Episode) {
  if (item.value) player.play(item.value, ep)
}
function playWith(playerName: string) {
  const it = item.value
  if (!it) return
  if (it.type === 'series') {
    const resume = player.resumeEpisodeOf(it)
    if (resume) player.playWith(it, resume, playerName)
  } else {
    player.playWith(it, undefined, playerName)
  }
}
function fav() {
  if (item.value) toggleFavorite(item.value.id)
}
function watched() {
  if (item.value) toggleWatched(item.value.id)
}
function playItem(m: MediaItem) {
  player.play(m)
}
</script>

<template>
  <div v-if="item" class="detail">
    <header class="detail__topbar" :class="{ 'is-scrolled': scrolled }">
      <button class="detail__back" title="返回" @click="router.back()">
        <ArrowLeft :size="20" />
      </button>
      <transition name="fade">
        <span v-if="scrolled" class="detail__topbar-title">{{ item.title }}</span>
      </transition>
    </header>

    <div class="detail__scroll no-scrollbar" @scroll="onScroll">
      <DetailHero
        :item="item"
        @play="play"
        @favorite="fav"
        @play-with="playWith"
        @toggle-watched="watched"
      />

      <div class="detail__body">
        <MediaTechInfo v-if="item.tech" :tech="item.tech" />
        <EpisodeList
          v-if="item.type === 'series' && item.seasons"
          :seasons="item.seasons"
          :resume-id="resumeId"
          @play="playEpisode"
        />
        <CastRow v-if="item.cast.length" title="演职人员" :people="item.cast" />
        <MediaRow v-if="related.length" title="相关推荐" item-width="158px">
          <PosterCard
            v-for="it in related"
            :key="it.id"
            :item="it"
            @favorite="toggleFavorite"
            @play="playItem"
          />
        </MediaRow>
      </div>
    </div>
  </div>

  <div v-else class="detail-missing">
    <p>找不到这个内容喵 (⊙﹏⊙)</p>
    <button @click="router.push('/')">返回媒体库</button>
  </div>
</template>

<style scoped>
.detail {
  position: relative;
  height: 100vh;
  overflow: hidden;
}

.detail__topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 26px;
  border-bottom: 1px solid transparent;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.detail__topbar.is-scrolled {
  background: rgba(11, 12, 17, 0.72);
  backdrop-filter: var(--blur);
  border-bottom-color: var(--border);
}

.detail__back {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border);
  backdrop-filter: var(--blur);
  transition: background var(--dur) var(--ease);
}
.detail__back:hover {
  background: rgba(0, 0, 0, 0.62);
}
.detail__topbar.is-scrolled .detail__back {
  background: var(--surface-2);
}
.detail__topbar-title {
  font-size: 17px;
  font-weight: 700;
}

.detail__scroll {
  height: 100%;
  overflow-y: auto;
}
.detail__body {
  padding: 30px 44px 50px;
}

.detail-missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  height: 100vh;
  color: var(--text-dim);
}
.detail-missing button {
  padding: 10px 22px;
  border-radius: var(--r-pill);
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  font-weight: 600;
}
</style>
