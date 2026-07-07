<script setup lang="ts">
import { ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

withDefaults(defineProps<{ title: string; itemWidth?: string }>(), {
  itemWidth: '158px'
})

const track = ref<HTMLElement>()

function scroll(dir: number) {
  const el = track.value
  if (!el) return
  el.scrollBy({ left: dir * el.clientWidth * 0.82, behavior: 'smooth' })
}
</script>

<template>
  <section class="row">
    <div class="row__head">
      <h2 class="row__title">{{ title }}</h2>
      <div class="row__nav">
        <button class="row__btn" title="向左" @click="scroll(-1)">
          <ChevronLeft :size="18" />
        </button>
        <button class="row__btn" title="向右" @click="scroll(1)">
          <ChevronRight :size="18" />
        </button>
      </div>
    </div>
    <div ref="track" class="row__track no-scrollbar" :style="{ '--col': itemWidth }">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.row {
  margin-bottom: 30px;
}
.row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.row__title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.row__nav {
  display: flex;
  gap: 8px;
}
.row__btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.row__btn:hover {
  color: #fff;
  background: var(--surface-hover);
}

.row__track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: var(--col);
  gap: 18px;
  overflow-x: auto;
  /* 上下留白，避免卡片 hover 上移/放大被裁剪（海报卡有 scale，需更多余量） */
  padding: 14px 4px 10px;
  margin-top: -14px;
  scroll-snap-type: x proximity;
}
.row__track > :deep(*) {
  scroll-snap-align: start;
}
</style>
