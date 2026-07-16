import { computed, ref } from 'vue'
import { useSources } from './useSources'
import { useToast } from './useToast'
import type { IptvChannel } from '@/types/native'

// IPTV 直播源：解析出的频道列表（与影视库分开，直播页用）。模块级单例。
// 按源分组保存（多个 IPTV 源时直播页做成 tab 切换）
export interface IptvSourceChannels {
  id: string
  name: string
  url: string
  channels: IptvChannel[]
}
const iptvSources = ref<IptvSourceChannels[]>([])
const loading = ref(false)
const loaded = ref(false)

/** 所有源合并后的频道（保留给需要总数的地方） */
const channels = computed(() => iptvSources.value.flatMap((s) => s.channels))

/** 是否有启用的 IPTV 源（侧栏「直播」入口据此显示） */
const hasIptv = computed(() =>
  useSources().sources.value.some((s) => s.kind === 'iptv' && s.enabled)
)

/** 拉取所有启用的 IPTV 源、按源分组（失败弹提示，不阻塞其它源） */
async function loadChannels() {
  const nn = window.nekoNative
  if (!nn?.scanIptv) return
  const srcs = useSources().sources.value.filter((s) => s.kind === 'iptv' && s.enabled)
  if (!srcs.length) {
    iptvSources.value = []
    loaded.value = true
    return
  }
  loading.value = true
  try {
    iptvSources.value = await Promise.all(
      srcs.map(async (s) => {
        // config 是 Vue 响应式 Proxy，过 IPC 前展开成普通对象（否则「could not be cloned」）
        const cfg = { ...(s.config ?? {}) } as Record<string, string>
        const r = await nn.scanIptv!(cfg)
        if (r.error) useToast().toast(`IPTV「${s.name}」加载失败：${r.error}`, 'error')
        return { id: s.id, name: s.name, url: cfg.url || '', channels: r.channels ?? [] }
      })
    )
    loaded.value = true
  } finally {
    loading.value = false
  }
}

export function useIptv() {
  return { iptvSources, channels, loading, loaded, hasIptv, loadChannels }
}
