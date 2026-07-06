import { computed, ref } from 'vue'
import type { EmbySession } from '@/api/emby'
import type { MediaSource } from '@/types/source'

// 模块级单例：媒体库首页与媒体源管理页共享同一份源列表
const sources = ref<MediaSource[]>([])

const enabledSources = computed(() => sources.value.filter((s) => s.enabled))

function addSource(s: MediaSource) {
  sources.value.unshift(s)
}
function updateSource(s: MediaSource) {
  sources.value = sources.value.map((x) => (x.id === s.id ? s : x))
}
function toggleSource(id: string) {
  const s = sources.value.find((x) => x.id === id)
  if (s) s.enabled = !s.enabled
}
function removeSource(id: string) {
  sources.value = sources.value.filter((x) => x.id !== id)
}
function getSource(id: string) {
  return sources.value.find((x) => x.id === id)
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** 把 Emby 登录会话反映为一个媒体源（id 用 serverId，与媒体的 sourceId 对齐） */
function upsertEmbySource(session: EmbySession, name?: string) {
  const src: MediaSource = {
    id: session.serverId,
    kind: 'emby',
    name: name?.trim() || `${session.userName} @ ${hostOf(session.serverUrl)}`,
    address: session.serverUrl,
    status: 'online',
    mediaCount: 0,
    enabled: true,
    session
  }
  const i = sources.value.findIndex((x) => x.id === src.id)
  if (i >= 0) sources.value[i] = src
  else sources.value.unshift(src)
}

export function useSources() {
  return {
    sources,
    enabledSources,
    addSource,
    updateSource,
    toggleSource,
    removeSource,
    getSource,
    upsertEmbySource
  }
}
