<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Server } from 'lucide-vue-next'
import SourceList from '@/components/source/SourceList.vue'
import AddSourceDialog from '@/components/source/AddSourceDialog.vue'
import { useSources } from '@/composables/useSources'
import { useLibrary } from '@/composables/useLibrary'
import type { MediaSource } from '@/types/source'

const router = useRouter()
const { sources, addSource, updateSource, toggleSource, removeSource } = useSources()
const { setActiveSource, loadFromEmby } = useLibrary()

// 删除媒体源后重新聚合剩余源
function remove(id: string) {
  removeSource(id)
  loadFromEmby()
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

    <div class="sources__scroll no-scrollbar">
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
      @add="addSource"
      @update="updateSource"
    />
  </div>
</template>

<style scoped>
.sources {
  display: flex;
  flex-direction: column;
  height: 100vh;
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
