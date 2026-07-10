<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Folder, ChevronRight, House, Layers } from 'lucide-vue-next'
import PosterCard from './PosterCard.vue'
import { useLibrary } from '@/composables/useLibrary'
import type { MediaItem } from '@/types/media'

const props = defineProps<{ items: MediaItem[]; rootName?: string }>()
const emit = defineEmits<{ favorite: [id: string]; play: [item: MediaItem] }>()

const { saveManualSeries } = useLibrary()

// 当前所在文件夹（路径段）；切源（rootName 变）时回到根
const path = ref<string[]>([])
watch(
  () => props.rootName,
  () => (path.value = [])
)

const prefix = computed(() => path.value.join('/'))
const depth = computed(() => path.value.length)
const parts = (folder: string) => (folder ? folder.split('/').filter(Boolean) : [])

// 该文件夹是否在当前路径分支之下
function inBranch(folder: string) {
  if (!prefix.value) return true
  return folder === prefix.value || folder.startsWith(prefix.value + '/')
}

// 当前层的子文件夹（去重，附子树内视频数）
const folders = computed(() => {
  const map = new Map<string, number>()
  for (const m of props.items) {
    const f = m.folder ?? ''
    if (!inBranch(f)) continue
    const p = parts(f)
    if (p.length > depth.value) {
      const name = p[depth.value]
      map.set(name, (map.get(name) ?? 0) + 1)
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
})

// 当前层直接包含的视频
const videos = computed(() => props.items.filter((m) => (m.folder ?? '') === prefix.value))

// 当前文件夹（含子文件夹）下的所有「单个视频」——可手动组成一部剧集
const groupable = computed(() =>
  props.items.filter((m) => m.type === 'movie' && !!m.localPath && inBranch(m.folder ?? ''))
)
function makeSeries() {
  if (groupable.value.length < 2) return
  const name = path.value[path.value.length - 1] || props.rootName || '剧集'
  saveManualSeries(name, groupable.value.map((m) => m.id))
}
</script>

<template>
  <div class="fb">
    <!-- 面包屑 + 手动组成剧集 -->
    <div class="fb__bar">
      <div class="fb__crumbs">
        <button class="fb__crumb" :class="{ on: !path.length }" @click="path = []">
          <House :size="15" />
          {{ rootName || '根目录' }}
        </button>
        <template v-for="(seg, i) in path" :key="i">
          <ChevronRight :size="14" class="fb__sep" />
          <button
            class="fb__crumb"
            :class="{ on: i === path.length - 1 }"
            @click="path = path.slice(0, i + 1)"
          >
            {{ seg }}
          </button>
        </template>
      </div>
      <button
        v-if="groupable.length >= 2"
        class="fb__group"
        title="把此文件夹（含子文件夹）里的视频合并成一部剧集"
        @click="makeSeries"
      >
        <Layers :size="14" /> 组成剧集 ({{ groupable.length }})
      </button>
    </div>

    <p v-if="!folders.length && !videos.length" class="fb__empty">这个文件夹里没有视频喵～</p>

    <!-- 子文件夹 -->
    <div v-if="folders.length" class="fb__folders">
      <button v-for="f in folders" :key="f.name" class="fb__folder" @click="path = [...path, f.name]">
        <Folder :size="20" class="fb__folder-icon" />
        <span class="fb__folder-name" :title="f.name">{{ f.name }}</span>
        <span class="fb__folder-count">{{ f.count }}</span>
      </button>
    </div>

    <!-- 当前层视频 -->
    <div v-if="videos.length" class="fb__grid">
      <PosterCard
        v-for="v in videos"
        :key="v.id"
        :item="v"
        @favorite="emit('favorite', $event)"
        @play="emit('play', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.fb {
  padding-top: 4px;
}
.fb__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.fb__crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}
.fb__group {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: var(--r-pill);
  box-shadow: 0 6px 16px var(--accent-glow);
  transition: transform var(--dur) var(--ease);
}
.fb__group:active {
  transform: scale(0.96);
}
.fb__crumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-dim);
  border-radius: var(--r-pill);
  transition: color var(--dur), background var(--dur);
}
.fb__crumb:hover {
  color: var(--text);
  background: var(--surface-2);
}
.fb__crumb.on {
  color: var(--text);
  background: var(--surface-2);
}
.fb__sep {
  color: var(--text-mute);
  flex-shrink: 0;
}

.fb__folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 26px;
}
.fb__folder {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: border-color var(--dur), background var(--dur), transform var(--dur);
}
.fb__folder:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
  transform: translateY(-2px);
}
.fb__folder-icon {
  flex-shrink: 0;
  color: var(--accent);
}
.fb__folder-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fb__folder-count {
  flex-shrink: 0;
  padding: 1px 9px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-mute);
  background: var(--surface-2);
  border-radius: var(--r-pill);
  font-variant-numeric: tabular-nums;
}

.fb__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 20px;
}
.fb__empty {
  padding: 60px 0;
  text-align: center;
  font-size: 14px;
  color: var(--text-mute);
}
</style>
