<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Star } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useTrakt } from '@/composables/useTrakt'
import type { MediaItem } from '@/types/media'
import type { TraktListKind } from '@/api/trakt'

const router = useRouter()
const { loadTraktItems, items } = useLibrary()
const trakt = useTrakt()

const TABS: { kind: TraktListKind; label: string }[] = [
  { kind: 'watchlist', label: '想看' },
  { kind: 'ratings', label: '评分' },
  { kind: 'collection', label: '收藏' }
]
const activeKind = ref<TraktListKind>('watchlist')
const works = ref<MediaItem[]>([])
const loading = ref(false)

// 库内条目 id 集合：已入库（文件源刮到 tmdbId 的）才可点开进详情
const libIds = computed(() => new Set(items.value.map((m) => m.id)))
const inLib = (w: MediaItem) => libIds.value.has(w.id)

async function load() {
  loading.value = true
  works.value = []
  try {
    works.value = await loadTraktItems(activeKind.value)
  } finally {
    loading.value = false
  }
}
watch(activeKind, load, { immediate: true })

function openWork(w: MediaItem) {
  if (inLib(w)) router.push({ name: 'detail', params: { id: w.id } })
}
</script>

<template>
  <div class="trakt">
    <header class="trakt__head">
      <h1 class="trakt__title">Trakt</h1>
      <p v-if="trakt.state.user?.username" class="trakt__sub">{{ trakt.state.user.username }}</p>
    </header>

    <div class="trakt__tabs">
      <button
        v-for="t in TABS"
        :key="t.kind"
        class="trakt__tab"
        :class="{ on: activeKind === t.kind }"
        @click="activeKind = t.kind"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="trakt__scroll">
      <div v-if="loading" class="trakt__hint">正在从 Trakt 拉取…</div>
      <div v-else-if="!works.length" class="trakt__hint">这个列表还是空的喵～</div>
      <div v-else class="trakt__grid">
        <component
          :is="inLib(w) ? 'button' : 'div'"
          v-for="w in works"
          :key="w.id"
          class="twork"
          :class="{ 'twork--off': !inLib(w) }"
          @click="openWork(w)"
        >
          <div class="twork__poster">
            <PosterImage :seed="w.id" :title="w.title" :src="w.posterUrl" kind="poster" />
            <span v-if="!inLib(w)" class="twork__badge">未入库</span>
            <span v-if="activeKind === 'ratings' && w.rating" class="twork__rating">
              <Star :size="11" fill="currentColor" /> {{ w.rating }}
            </span>
          </div>
          <p class="twork__title" :title="w.title">{{ w.title }}</p>
          <p class="twork__year">{{ w.year || '' }}</p>
        </component>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trakt {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.trakt__head {
  flex-shrink: 0;
  padding: 28px 40px 4px;
}
.trakt__title {
  font-size: 28px;
  font-weight: 800;
}
.trakt__sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-mute);
}
.trakt__tabs {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding: 14px 40px 8px;
}
.trakt__tab {
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.trakt__tab:hover {
  color: var(--text);
}
.trakt__tab.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.trakt__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px 40px 50px;
}
.trakt__hint {
  padding: 60px 0;
  text-align: center;
  color: var(--text-dim);
}
.trakt__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 18px;
}
.twork {
  text-align: left;
  transition: transform var(--dur) var(--ease);
}
button.twork {
  cursor: pointer;
}
button.twork:hover {
  transform: translateY(-3px);
}
/* 未入库：置灰、不可点，仅展示 */
.twork--off {
  cursor: default;
}
.twork--off .twork__poster {
  opacity: 0.5;
}
.twork--off .twork__title {
  color: var(--text-mute);
}
.twork__poster {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--shadow-pop);
}
.twork__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  background: rgba(0, 0, 0, 0.6);
  border-radius: var(--r-pill);
  backdrop-filter: var(--blur);
}
.twork__rating {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 700;
  color: #ffce53;
  background: rgba(0, 0, 0, 0.6);
  border-radius: var(--r-pill);
  backdrop-filter: var(--blur);
}
.twork__title {
  margin-top: 9px;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.twork__year {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-mute);
}
</style>
