<script setup lang="ts">
import PosterCard from './PosterCard.vue'
import type { MediaItem } from '@/types/media'

defineProps<{ items: MediaItem[]; title?: string }>()
const emit = defineEmits<{ favorite: [id: string]; play: [item: MediaItem] }>()
</script>

<template>
  <section class="grid-sec">
    <h2 v-if="title" class="grid-sec__title">{{ title }}</h2>
    <div v-if="items.length" class="grid">
      <PosterCard
        v-for="it in items"
        :key="it.id"
        :item="it"
        @favorite="emit('favorite', $event)"
        @play="emit('play', $event)"
      />
    </div>
    <p v-else class="grid-sec__empty">没有找到匹配的内容喵～ (´･_･`)</p>
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
</style>
