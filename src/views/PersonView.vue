<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Search, X } from 'lucide-vue-next'
import PosterGrid from '@/components/library/PosterGrid.vue'
import PosterImage from '@/components/common/PosterImage.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useSources } from '@/composables/useSources'
import { usePlayer } from '@/composables/usePlayer'
import { useBackground } from '@/composables/useBackground'
import type { MediaItem } from '@/types/media'

const route = useRoute()
const router = useRouter()
const { loadPersonWorks, toggleFavorite, items } = useLibrary()
const { sessionOf } = useSources()
const player = usePlayer()

// 库内条目 id 集合：文件源作品只有「已入库」的才可点开（有真实文件/信息）
const libIds = computed(() => new Set(items.value.map((m) => m.id)))
const inLib = (w: MediaItem) => libIds.value.has(w.id)

const name = computed(() => String(route.query.name || '演职人员'))
const role = computed(() => String(route.query.role || ''))
const avatar = computed(() => (route.query.avatar ? String(route.query.avatar) : undefined))
const sid = computed(() => String(route.query.sid || ''))
const pid = computed(() => String(route.query.pid || ''))
// Emby/Jellyfin 源有会话 → 库内条目可点开可播；文件源无会话 → TMDB 作品（点开看信息）
const isEmby = computed(() => !!sessionOf(sid.value))

const works = ref<MediaItem[]>([])
const loading = ref(false)
const query = ref('')
// 按作品名搜索过滤
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? works.value.filter((w) => w.title.toLowerCase().includes(q)) : works.value
})

watch(
  () => [sid.value, pid.value],
  async () => {
    if (!pid.value) return
    loading.value = true
    works.value = []
    query.value = ''
    try {
      works.value = await loadPersonWorks(sid.value, pid.value)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

// 全局海报背景：与媒体库一致（home 模糊）——用首个作品的背景/海报，退回人物头像
const { setBackdrop } = useBackground()
const bgImage = computed(() => works.value[0]?.backdropUrl || works.value[0]?.posterUrl || avatar.value)
watch(bgImage, (img) => setBackdrop(img), { immediate: true })

function playItem(m: MediaItem) {
  player.play(m)
}
// 文件源作品：仅「已入库」的可点开进详情（未入库的 TMDB 占位不可点）
function openWork(w: MediaItem) {
  if (inLib(w)) router.push({ name: 'detail', params: { id: w.id } })
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

      <div v-if="works.length" class="person__search">
        <Search :size="17" class="person__search-icon" />
        <input v-model="query" data-search-input placeholder="搜索作品…" spellcheck="false" />
        <button v-if="query" class="person__search-clear" title="清除" @click="query = ''">
          <X :size="15" />
        </button>
      </div>

      <div v-if="loading" class="person__hint">正在查找作品喵…</div>
      <div v-else-if="!works.length" class="person__hint">
        没有找到相关作品喵（文件源需在设置里填 TMDB Key）
      </div>
      <div v-else-if="!shown.length" class="person__hint">没有匹配「{{ query }}」的作品</div>

      <!-- Emby/Jellyfin：库内参演条目，可点开可播 -->
      <PosterGrid v-else-if="isEmby" :items="shown" @favorite="toggleFavorite" @play="playItem" />

      <!-- 文件源：TMDB 参演作品。已入库的可点开看详情/播放，未入库的仅展示海报（置灰不可点） -->
      <div v-else class="person__grid">
        <component
          :is="inLib(w) ? 'button' : 'div'"
          v-for="w in shown"
          :key="w.id"
          class="pwork"
          :class="{ 'pwork--off': !inLib(w) }"
          @click="openWork(w)"
        >
          <div class="pwork__poster">
            <PosterImage :seed="w.id" :title="w.title" :src="w.posterUrl" kind="poster" />
            <span v-if="!inLib(w)" class="pwork__badge">未入库</span>
          </div>
          <p class="pwork__title" :title="w.title">{{ w.title }}</p>
          <p class="pwork__year">{{ w.year || '' }}</p>
        </component>
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
.person__search {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 380px;
  margin-bottom: 24px;
}
.person__search-icon {
  position: absolute;
  left: 14px;
  color: var(--text-mute);
  pointer-events: none;
}
.person__search input {
  width: 100%;
  height: 42px;
  padding: 0 40px;
  font-size: 14px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  outline: none;
  transition: border-color var(--dur) var(--ease);
}
.person__search input:focus {
  border-color: var(--accent);
}
.person__search-clear {
  position: absolute;
  right: 10px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: var(--text-mute);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.person__search-clear:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.person__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 18px;
}
.pwork {
  text-align: left;
  transition: transform var(--dur) var(--ease);
}
button.pwork {
  cursor: pointer;
}
button.pwork:hover {
  transform: translateY(-3px);
}
/* 未入库：置灰、无交互，仅作展示 */
.pwork--off {
  cursor: default;
}
.pwork--off .pwork__poster {
  opacity: 0.5;
}
.pwork--off .pwork__title {
  color: var(--text-mute);
}
.pwork__poster {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--shadow-pop);
}
.pwork__badge {
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
