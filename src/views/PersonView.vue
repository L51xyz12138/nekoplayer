<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import PosterGrid from '@/components/library/PosterGrid.vue'
import PosterImage from '@/components/common/PosterImage.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useSources } from '@/composables/useSources'
import { usePlayer } from '@/composables/usePlayer'
import type { MediaItem } from '@/types/media'

const route = useRoute()
const router = useRouter()
const { loadPersonWorks, toggleFavorite } = useLibrary()
const { sessionOf } = useSources()
const player = usePlayer()

const name = computed(() => String(route.query.name || '演职人员'))
const role = computed(() => String(route.query.role || ''))
const avatar = computed(() => (route.query.avatar ? String(route.query.avatar) : undefined))
const sid = computed(() => String(route.query.sid || ''))
const pid = computed(() => String(route.query.pid || ''))
// Emby/Jellyfin 源有会话 → 库内条目可点开可播；文件源无会话 → TMDB 作品仅展示
const isEmby = computed(() => !!sessionOf(sid.value))

const works = ref<MediaItem[]>([])
const loading = ref(false)
watch(
  () => [sid.value, pid.value],
  async () => {
    if (!pid.value) return
    loading.value = true
    works.value = []
    try {
      works.value = await loadPersonWorks(sid.value, pid.value)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function playItem(m: MediaItem) {
  player.play(m)
}
</script>

<template>
  <div class="person">
    <header class="person__topbar">
      <button class="person__back" title="返回" @click="router.back()">
        <ArrowLeft :size="20" />
      </button>
    </header>

    <div class="person__scroll">
      <div class="person__head">
        <div class="person__avatar">
          <PosterImage :seed="name" :title="name" :src="avatar" kind="avatar" />
        </div>
        <div class="person__meta">
          <h1 class="person__name">{{ name }}</h1>
          <p v-if="role" class="person__role">{{ role }}</p>
          <p v-if="!loading" class="person__count">{{ works.length }} 部作品</p>
        </div>
      </div>

      <div v-if="loading" class="person__hint">正在查找作品喵…</div>
      <div v-else-if="!works.length" class="person__hint">
        没有找到相关作品喵（文件源需在设置里填 TMDB Key）
      </div>

      <!-- Emby/Jellyfin：库内参演条目，可点开可播 -->
      <PosterGrid v-else-if="isEmby" :items="works" @favorite="toggleFavorite" @play="playItem" />

      <!-- 文件源：TMDB 参演作品，仅展示（不在库、不可播） -->
      <div v-else class="person__grid">
        <div v-for="w in works" :key="w.id" class="pwork">
          <div class="pwork__poster">
            <PosterImage :seed="w.id" :title="w.title" :src="w.posterUrl" kind="poster" />
          </div>
          <p class="pwork__title" :title="w.title">{{ w.title }}</p>
          <p class="pwork__year">{{ w.year || '' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.person {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.person__topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  padding: 18px 26px;
}
.person__back {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border);
  backdrop-filter: var(--blur);
  transition: background var(--dur) var(--ease);
}
.person__back:hover {
  background: rgba(0, 0, 0, 0.62);
}
.person__scroll {
  height: 100%;
  overflow-y: auto;
  padding: 78px 44px 50px;
}
.person__head {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-bottom: 34px;
}
.person__avatar {
  width: 104px;
  height: 104px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border);
}
.person__name {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.person__role {
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-dim);
}
.person__count {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-mute);
}
.person__hint {
  padding: 60px 0;
  text-align: center;
  color: var(--text-dim);
}

.person__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 18px;
}
.pwork__poster {
  aspect-ratio: 2 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--shadow-pop);
}
.pwork__title {
  margin-top: 9px;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pwork__year {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-mute);
}
</style>
