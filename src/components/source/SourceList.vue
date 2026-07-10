<script setup lang="ts">
import { Server, Pencil, Trash2 } from 'lucide-vue-next'
import { sourceKindMeta } from '@/data/sourceKinds'
import { useLibrary } from '@/composables/useLibrary'
import type { MediaSource, SourceKind } from '@/types/source'

defineProps<{ sources: MediaSource[] }>()
const emit = defineEmits<{
  toggle: [id: string]
  remove: [id: string]
  edit: [source: MediaSource]
  browse: [source: MediaSource]
}>()

const { fileScan } = useLibrary()
const FILE_KINDS: SourceKind[] = ['local', 'webdav', 'smb', 'dlna']
const isFile = (k: SourceKind) => FILE_KINDS.includes(k)

const statusText: Record<MediaSource['status'], string> = {
  online: '在线',
  offline: '离线',
  connecting: '连接中'
}

// 文件源用实时扫描状态；Emby/Jellyfin 用连接状态
function statusFor(s: MediaSource): { text: string; cls: string } {
  if (isFile(s.kind)) {
    const sc = fileScan[s.id]
    if (!sc) return { text: '待扫描', cls: 'connecting' }
    if (sc.scanning) return { text: '扫描中', cls: 'connecting' }
    if (sc.error) return { text: '失败', cls: 'error' }
    return { text: '在线', cls: 'online' }
  }
  return { text: statusText[s.status], cls: s.status }
}
function countFor(s: MediaSource): string {
  if (isFile(s.kind)) {
    const sc = fileScan[s.id]
    if (sc?.scanning) return '…'
    return (sc?.count ?? s.mediaCount ?? 0) + ' 视频'
  }
  return s.mediaCount ? s.mediaCount + ' 项' : '—'
}
function errorFor(s: MediaSource): string {
  return isFile(s.kind) ? (fileScan[s.id]?.error ?? '') : ''
}
</script>

<template>
  <ul class="slist">
    <li v-for="s in sources" :key="s.id" class="src" @click="emit('browse', s)">
      <div
        class="src__icon"
        :style="{ color: sourceKindMeta(s.kind).accent, background: sourceKindMeta(s.kind).accent + '22' }"
      >
        <Server :size="22" />
      </div>

      <div class="src__main">
        <div class="src__name">
          {{ s.name }}
          <span class="src__badge">{{ sourceKindMeta(s.kind).label }}</span>
        </div>
        <div class="src__addr">{{ s.address }}</div>
        <div v-if="errorFor(s)" class="src__err" :title="errorFor(s)">扫描失败：{{ errorFor(s) }}</div>
      </div>

      <div class="src__status" :class="statusFor(s).cls">
        <span class="src__dot" />
        {{ statusFor(s).text }}
      </div>

      <div class="src__count">{{ countFor(s) }}</div>

      <label class="switch" :title="s.enabled ? '已启用' : '已停用'" @click.stop>
        <input type="checkbox" :checked="s.enabled" @change="emit('toggle', s.id)" />
        <span class="switch__track"><span class="switch__thumb" /></span>
      </label>

      <button class="src__edit" title="编辑" @click.stop="emit('edit', s)">
        <Pencil :size="16" />
      </button>

      <button class="src__del" title="移除" @click.stop="emit('remove', s.id)">
        <Trash2 :size="17" />
      </button>
    </li>
  </ul>
</template>

<style scoped>
.slist {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.src {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.src:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.src__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--r-md);
}

.src__main {
  flex: 1;
  min-width: 0;
}
.src__name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15.5px;
  font-weight: 650;
}
.src__badge {
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.src__addr {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-mute);
  font-family: 'SF Mono', ui-monospace, monospace;
}
.src__err {
  margin-top: 5px;
  font-size: 12.5px;
  color: #ff8b8b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.src__status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  width: 74px;
}
.src__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.src__status.online {
  color: #46d17f;
}
.src__status.online .src__dot {
  background: #46d17f;
  box-shadow: 0 0 8px rgba(70, 209, 127, 0.7);
}
.src__status.offline {
  color: var(--text-mute);
}
.src__status.offline .src__dot {
  background: var(--text-mute);
}
.src__status.connecting {
  color: #ffce53;
}
.src__status.connecting .src__dot {
  background: #ffce53;
}
.src__status.error {
  color: #ff6b6b;
}
.src__status.error .src__dot {
  background: #ff6b6b;
}

.src__count {
  width: 64px;
  text-align: right;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.switch {
  cursor: pointer;
}
.switch input {
  display: none;
}
.switch__track {
  display: block;
  width: 42px;
  height: 24px;
  border-radius: var(--r-pill);
  background: var(--surface-hover);
  border: 1px solid var(--border);
  transition: background var(--dur) var(--ease);
}
.switch__thumb {
  display: block;
  width: 18px;
  height: 18px;
  margin: 2px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--dur) var(--ease);
}
.switch input:checked + .switch__track {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.switch input:checked + .switch__track .switch__thumb {
  transform: translateX(18px);
}

.src__edit,
.src__del {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: var(--text-mute);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.src__edit:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.src__del:hover {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.12);
}
</style>
