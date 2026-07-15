<script setup lang="ts">
import { type Component, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Layers, Server, HardDrive, Cloud, Network, Cast, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useSources } from '@/composables/useSources'
import { useLibrary } from '@/composables/useLibrary'
import { sourceKindMeta } from '@/data/sourceKinds'
import type { SourceKind } from '@/types/source'

// 只显示启用的源（停用的不进媒体库、也不占标签位）
const { enabledSources } = useSources()
const { activeSourceId, setActiveSource } = useLibrary()

const kindIcon: Partial<Record<SourceKind, Component>> = {
  local: HardDrive,
  webdav: Cloud,
  smb: Network,
  dlna: Cast
}
function iconFor(kind: SourceKind): Component {
  return kindIcon[kind] ?? Server
}
// 各源类型的主题色（Emby 绿 / Jellyfin 紫 / 本机 / WebDAV 蓝 …），用于区分类型
function accentFor(kind: SourceKind): string {
  return sourceKindMeta(kind).accent
}
function labelFor(kind: SourceKind): string {
  return sourceKindMeta(kind).label
}

// 溢出时显示左右滚动按钮（桌面鼠标无法横向滚动，与「媒体库」筹码行一致）
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
watch(enabledSources, () => nextTick(update))
</script>

<template>
  <div class="stabs-wrap">
    <div ref="track" class="stabs no-scrollbar" @scroll="update">
      <button class="stab" :class="{ on: activeSourceId === 'all' }" @click="setActiveSource('all')">
        <Layers :size="16" />
        全部资料库
      </button>
      <button
        v-for="s in enabledSources"
        :key="s.id"
        class="stab"
        :class="{ on: activeSourceId === s.id }"
        @click="setActiveSource(s.id)"
      >
        <component
          :is="iconFor(s.kind)"
          :size="16"
          :style="activeSourceId === s.id ? undefined : { color: accentFor(s.kind) }"
        />
        {{ s.name }}
        <span
          class="stab__kind"
          :style="
            activeSourceId === s.id
              ? undefined
              : { color: accentFor(s.kind), background: accentFor(s.kind) + '22' }
          "
          >{{ labelFor(s.kind) }}</span
        >
      </button>
    </div>

    <!-- 到头则禁用而非消失，位置不跳（与 LibraryTabs 一致） -->
    <div v-if="overflowing" class="stabs-nav-group">
      <button class="stabs-nav" title="向左" :disabled="!canLeft" @click="scroll(-1)">
        <ChevronLeft :size="16" />
      </button>
      <button class="stabs-nav" title="向右" :disabled="!canRight" @click="scroll(1)">
        <ChevronRight :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.stabs-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.stabs {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  /* 留白容纳选中 tab 的辉光阴影（0 8px 20px），否则被 overflow 裁成方角；等量负 margin 抵消、不影响布局
     （滚动条已 no-scrollbar 隐藏，加大 padding 不会露出滚动条） */
  padding: 14px 22px 26px;
  margin: -14px -22px -26px;
  scroll-behavior: smooth;
}
.stab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  white-space: nowrap;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.stab:hover {
  color: #fff;
  background: var(--surface-2);
}
.stab.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
  box-shadow: 0 8px 20px var(--accent-glow);
}
.stab__kind {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: var(--r-pill);
}
.stab.on .stab__kind {
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
}

.stabs-nav-group {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
}
.stabs-nav {
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
.stabs-nav:not(:disabled):hover {
  background: var(--surface-hover);
}
.stabs-nav:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
