<script setup lang="ts">
import { computed } from 'vue'
import RatingPill from '@/components/common/RatingPill.vue'
import type { MediaItem } from '@/types/media'

const props = defineProps<{ item: MediaItem }>()

const seasonInfo = computed(() => {
  if (props.item.type !== 'series' || !props.item.seasons) return ''
  const s = props.item.seasons.length
  const e = props.item.seasons.reduce((n, x) => n + x.episodes.length, 0)
  return `${s} 季 · ${e} 集`
})
</script>

<template>
  <div class="meta">
    <span>{{ item.year }}</span>
    <span class="dot" />
    <span>{{ item.type === 'series' ? seasonInfo : item.runtime + ' 分钟' }}</span>
    <span class="dot" />
    <span class="cert">{{ item.certification }}</span>
    <span class="dot" />
    <RatingPill :rating="item.rating" />
  </div>
</template>

<style scoped>
.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-dim);
}
.dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-mute);
}
.cert {
  padding: 1px 7px;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  font-size: 12px;
}
</style>
