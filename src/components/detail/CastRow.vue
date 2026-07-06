<script setup lang="ts">
import PosterImage from '@/components/common/PosterImage.vue'
import type { Person } from '@/types/media'

defineProps<{ title: string; people: Person[] }>()
</script>

<template>
  <section class="cast">
    <h2 class="cast__title">{{ title }}</h2>
    <div class="cast__track no-scrollbar">
      <div v-for="p in people" :key="p.id" class="person">
        <div class="person__avatar">
          <PosterImage :seed="p.name" :title="p.name" :src="p.avatarUrl" kind="avatar" />
        </div>
        <p class="person__name">{{ p.name }}</p>
        <p class="person__role">{{ p.role }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cast {
  margin-bottom: 40px;
}
.cast__title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 18px;
}
.cast__track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 96px;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.person {
  text-align: center;
}
.person__avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border);
  margin-bottom: 10px;
}
.person__name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.person__role {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-mute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
