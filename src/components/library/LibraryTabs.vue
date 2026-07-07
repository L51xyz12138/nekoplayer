<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Layers, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useLibrary } from '@/composables/useLibrary'

// 媒体库筹码行：全部来自服务器自带分类（useLibrary.libraries）
const { libraries, activeLibraryId, setActiveLibrary } = useLibrary()

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
  if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' })
}

onMounted(() => {
  update()
  window.addEventListener('resize', update)
})
onBeforeUnmount(() => window.removeEventListener('resize', update))
watch(libraries, () => nextTick(update))
</script>

<template>
  <div v-if="libraries.length > 1" class="ltabs-wrap">
    <div ref="track" class="ltabs no-scrollbar" @scroll="update">
      <button
        class="ltab"
        :class="{ on: activeLibraryId === 'all' }"
        @click="setActiveLibrary('all')"
      >
        <Layers :size="14" />
        全部
      </button>
      <button
        v-for="l in libraries"
        :key="l.id"
        class="ltab"
        :class="{ on: activeLibraryId === l.id }"
        @click="setActiveLibrary(l.id)"
      >
        {{ l.name }}
      </button>
    </div>

    <!-- 滚动按钮统一放右侧，筹码行左对齐（与上下行对齐）；到头则禁用而非消失，位置不跳 -->
    <div v-if="overflowing" class="ltabs-nav-group">
      <button class="ltabs-nav" title="向左" :disabled="!canLeft" @click="scroll(-1)">
        <ChevronLeft :size="16" />
      </button>
      <button class="ltabs-nav" title="向右" :disabled="!canRight" @click="scroll(1)">
        <ChevronRight :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ltabs-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.ltabs {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scroll-behavior: smooth;
}
.ltab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  white-space: nowrap;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.ltab:hover {
  color: var(--text);
  background: var(--surface-2);
}
.ltab.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
  box-shadow: 0 6px 16px var(--accent-glow);
}

.ltabs-nav-group {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
}
.ltabs-nav {
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
.ltabs-nav:not(:disabled):hover {
  background: var(--surface-hover);
}
.ltabs-nav:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
