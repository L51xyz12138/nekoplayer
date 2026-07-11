<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import PosterGrid from '@/components/library/PosterGrid.vue'
import { getItems } from '@/api/emby'
import { mapEmbyItem } from '@/api/mapper'
import { useLibrary } from '@/composables/useLibrary'
import { useSources } from '@/composables/useSources'
import { usePlayer } from '@/composables/usePlayer'
import type { MediaItem } from '@/types/media'

const props = defineProps<{ id: string }>()
const router = useRouter()
const { getById, items, toggleFavorite } = useLibrary()
const player = usePlayer()

const collection = computed(() => getById(props.id))
// 文件源系列电影合集：成员就在库里，按 collectionId 找（响应式，成员刮到信息会实时联动）
const isFileCollection = computed(() => props.id.startsWith('local-collection:'))
const embyChildren = ref<MediaItem[]>([])
const children = computed(() =>
  isFileCollection.value
    ? items.value
        .filter((m) => m.collectionId === props.id)
        .slice()
        .sort((a, b) => (a.year || 0) - (b.year || 0))
    : embyChildren.value
)
const loading = ref(false)

watch(
  () => props.id,
  async () => {
    if (isFileCollection.value) return // 文件源合集是本地过滤，无需请求
    const col = collection.value
    const s = col && useSources().sessionOf(col.sourceId)
    if (!s) return
    loading.value = true
    try {
      const list = await getItems(s, { ParentId: props.id, SortBy: 'ProductionYear,SortName' })
      // 优先复用库里已有的响应式条目（收藏/进度可实时联动），没有的再新建
      embyChildren.value = list.map((it) => getById(it.Id) ?? mapEmbyItem(it, s))
    } catch (e) {
      console.warn('[NekoPlayer] 拉取合集内容失败：', e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function play(m: MediaItem) {
  player.play(m)
}
</script>

<template>
  <div class="col">
    <header class="col__topbar">
      <button class="col__back" title="返回" @click="router.back()">
        <ArrowLeft :size="20" />
      </button>
      <h1 class="col__title">{{ collection?.title ?? '合集' }}</h1>
      <span v-if="children.length" class="col__count">{{ children.length }} 部</span>
    </header>

    <div class="col__scroll">
      <div v-if="loading && !children.length" class="col__state">正在加载合集内容…</div>
      <div v-else-if="!children.length" class="col__state">这个合集暂时没有内容喵～</div>
      <div v-else class="col__body">
        <PosterGrid :items="children" @favorite="toggleFavorite" @play="play" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.col {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.col__topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  padding: 22px 40px 16px;
}
.col__back {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 50%;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  transition: background var(--dur) var(--ease);
}
.col__back:hover {
  background: var(--surface-hover);
}
.col__title {
  font-size: 26px;
  font-weight: 800;
}
.col__count {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-mute);
}
.col__scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 44px;
}
.col__body {
  padding: 8px 40px 0;
}
.col__state {
  display: grid;
  place-items: center;
  height: 50vh;
  color: var(--text-mute);
  font-size: 14px;
}
</style>
