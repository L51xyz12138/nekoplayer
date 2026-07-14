<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import type { Person } from '@/types/media'

const props = defineProps<{ title: string; people: Person[] }>()
const emit = defineEmits<{ select: [person: Person] }>()

// 溢出时显示左右滚动按钮（桌面鼠标横向滚不动）；鼠标滚轮纵向也转横向
const track = ref<HTMLElement>()
const canLeft = ref(false)
const canRight = ref(false)
const overflowing = ref(false)
function update() {
  const el = track.value
  if (!el) return
  overflowing.value = el.scrollWidth > el.clientWidth + 4
  canLeft.value = el.scrollLeft > 4
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}
function scroll(dir: number) {
  const el = track.value
  if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
}
onMounted(() => {
  update()
  window.addEventListener('resize', update)
})
onBeforeUnmount(() => window.removeEventListener('resize', update))
watch(() => props.people, () => nextTick(update))
</script>

<template>
  <section class="cast">
    <div class="cast__bar">
      <h2 class="cast__title">{{ title }}</h2>
      <div v-if="overflowing" class="cast__nav">
        <button class="cast__navbtn" title="向左" :disabled="!canLeft" @click="scroll(-1)">
          <ChevronLeft :size="16" />
        </button>
        <button class="cast__navbtn" title="向右" :disabled="!canRight" @click="scroll(1)">
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>
    <div ref="track" class="cast__track no-scrollbar" @scroll="update">
      <button v-for="p in people" :key="p.id" class="person" :title="`${p.name} · 查看作品`" @click="emit('select', p)">
        <div class="person__avatar">
          <PosterImage :seed="p.name" :title="p.name" :src="p.avatarUrl" kind="avatar" />
        </div>
        <p class="person__name">{{ p.name }}</p>
        <p class="person__role">{{ p.role }}</p>
      </button>
    </div>
  </section>
</template>

<style scoped>
.cast {
  margin-bottom: 40px;
}
.cast__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.cast__title {
  font-size: 20px;
  font-weight: 700;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
}
:root[data-scheme='light'] .cast__title {
  text-shadow: 0 1px 4px rgba(255, 255, 255, 0.85);
}
.cast__nav {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.cast__navbtn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  transition: background var(--dur) var(--ease), opacity var(--dur) var(--ease);
}
.cast__navbtn:not(:disabled):hover {
  background: var(--surface-hover);
}
.cast__navbtn:disabled {
  opacity: 0.35;
  cursor: default;
}
.cast__track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 96px;
  gap: 16px;
  overflow-x: auto;
  /* 上下留白给悬浮上移的空间（overflow-x:auto 会把纵向也裁掉），margin 抵消以不改布局位置 */
  padding: 10px 4px 6px;
  margin-top: -10px;
  scroll-behavior: smooth;
}
.person {
  text-align: center;
  transition: transform var(--dur) var(--ease);
}
.person:hover {
  transform: translateY(-3px);
}
.person__avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--border);
  margin-bottom: 10px;
  transition: border-color var(--dur) var(--ease);
}
.person:hover .person__avatar {
  border-color: var(--accent);
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
