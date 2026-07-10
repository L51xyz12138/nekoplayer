<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Server } from 'lucide-vue-next'
import SourceList from '@/components/source/SourceList.vue'
import AddSourceDialog from '@/components/source/AddSourceDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { useSources } from '@/composables/useSources'
import { useLibrary } from '@/composables/useLibrary'
import type { MediaSource } from '@/types/source'

const router = useRouter()
const { sources, addSource, updateSource, toggleSource, removeSource } = useSources()
const { setActiveSource, loadFromEmby } = useLibrary()

// 新增/编辑源后都要重新聚合媒体库（否则文件源加了却不扫描、编辑了连接也不生效）
function onAdd(s: MediaSource) {
  addSource(s)
  loadFromEmby()
}
function onUpdate(s: MediaSource) {
  updateSource(s)
  loadFromEmby()
}

// 删除媒体源：先二次确认，确认后再移除并重新聚合剩余源
const pendingRemove = ref<MediaSource | null>(null)
function remove(id: string) {
  pendingRemove.value = sources.value.find((s) => s.id === id) ?? null
}
function confirmRemove() {
  if (pendingRemove.value) {
    removeSource(pendingRemove.value.id)
    loadFromEmby()
  }
  pendingRemove.value = null
}
// 启用 / 停用源后刷新媒体库
function toggle(id: string) {
  toggleSource(id)
  loadFromEmby()
}

const dialogOpen = ref(false)
const editing = ref<MediaSource | null>(null)

function openAdd() {
  editing.value = null
  dialogOpen.value = true
}
function openEdit(source: MediaSource) {
  editing.value = source
  dialogOpen.value = true
}
function closeDialog() {
  dialogOpen.value = false
  editing.value = null
}
function browse(source: MediaSource) {
  // 所有源（含本机存储）都进聚合媒体库，按该源过滤（本机视频已并入库）
  setActiveSource(source.id)
  router.push('/')
}
</script>

<template>
  <div class="sources">
    <header class="sources__head">
      <div>
        <h1 class="sources__title">媒体源</h1>
        <p class="sources__sub">管理媒体服务器与网络存储连接 · 点击卡片可浏览该源内容</p>
      </div>
      <button class="sources__add" @click="openAdd">
        <Plus :size="18" />
        添加媒体源
      </button>
    </header>

    <div class="sources__scroll">
      <SourceList
        v-if="sources.length"
        :sources="sources"
        @toggle="toggle"
        @remove="remove"
        @edit="openEdit"
        @browse="browse"
      />
      <div v-else class="sources__empty">
        <Server :size="40" />
        <p>还没有连接任何媒体源喵～</p>
        <button class="sources__add" @click="openAdd">
          <Plus :size="18" />
          添加第一个
        </button>
      </div>
    </div>

    <AddSourceDialog
      :open="dialogOpen"
      :editing="editing"
      @close="closeDialog"
      @add="onAdd"
      @update="onUpdate"
    />

    <ConfirmDialog
      :open="!!pendingRemove"
      danger
      title="移除媒体源"
      :message="`确定移除「${pendingRemove?.name}」吗？该源的媒体会从库中消失（不影响服务器上的文件，之后可重新添加）。`"
      confirm-text="移除"
      @confirm="confirmRemove"
      @cancel="pendingRemove = null"
    />
  </div>
</template>

<style scoped>
.sources {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.sources__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 28px 40px 22px;
}
.sources__title {
  font-size: 28px;
  font-weight: 800;
}
.sources__sub {
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-mute);
}
.sources__add {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 650;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: var(--r-pill);
  box-shadow: 0 8px 22px var(--accent-glow);
  transition: transform var(--dur) var(--ease);
}
.sources__add:active {
  transform: scale(0.96);
}
.sources__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 40px 44px;
}
.sources__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 90px 0;
  color: var(--text-mute);
}
.sources__empty p {
  font-size: 15px;
}
</style>
