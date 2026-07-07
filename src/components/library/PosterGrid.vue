<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PosterCard from './PosterCard.vue'
import type { MediaItem } from '@/types/media'

const props = defineProps<{ items: MediaItem[]; title?: string }>()
const emit = defineEmits<{ favorite: [id: string]; play: [item: MediaItem] }>()

// 增量渲染：大库一次性渲染上千张卡片会卡，先渲染一页，滚到底再加载更多
const PAGE = 60
const limit = ref(PAGE)
const visible = computed(() => props.items.slice(0, limit.value))
const hasMore = computed(() => limit.value < props.items.length)

// 切换分类/筛选（items 变化）时重置到第一页
watch(
  () => props.items,
  () => {
    limit.value = PAGE
  }
)

const sentinel = ref<HTMLElement>()
let io: IntersectionObserver | undefined
onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore.value) limit.value += PAGE
    },
    { rootMargin: '800px' }
  )
  if (sentinel.value) io.observe(sentinel.value)
})
onBeforeUnmount(() => io?.disconnect())
</script>

<template>
  <section class="grid-sec">
    <h2 v-if="title" class="grid-sec__title">{{ title }}</h2>
    <div v-if="items.length" class="grid">
      <PosterCard
        v-for="it in visible"
        :key="it.id"
        :item="it"
        @favorite="emit('favorite', $event)"
        @play="emit('play', $event)"
      />
    </div>
    <p v-else class="grid-sec__empty">没有找到匹配的内容喵～ (´･_･`)</p>
    <!-- 触底哨兵：进入视口即多加载一页 -->
    <div ref="sentinel" class="grid-sec__sentinel" aria-hidden="true" />
  </section>
</template>

<style scoped>
.grid-sec {
  margin-bottom: 30px;
}
.grid-sec__title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 20px;
}
.grid-sec__empty {
  padding: 40px 0;
  text-align: center;
  color: var(--text-mute);
  font-size: 14px;
}
.grid-sec__sentinel {
  height: 1px;
}
</style>
