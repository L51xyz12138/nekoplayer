<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSettings } from '@/composables/useSettings'

const { settings } = useSettings()

const props = withDefaults(
  defineProps<{
    /** 生成稳定配色的种子（通常用媒体 id） */
    seed: string
    title?: string
    kind?: 'poster' | 'backdrop' | 'still' | 'avatar'
    /** 右上角小角标，如「剧集」 */
    label?: string
    /** 真实图片 URL；提供且加载成功时优先显示，否则回退 SVG 占位 */
    src?: string
    /** 本机视频路径；无 src 时向主进程要 mpv 抽帧缩略图当封面 */
    localPath?: string
  }>(),
  { title: '', kind: 'poster', label: '', src: '' }
)

const failed = ref(false)
const loaded = ref(false) // 真图是否已加载（未加载时先显示占位、加载完淡入，避免过滤时卡片空白）
const localThumb = ref('')
watch(
  () => props.localPath,
  async (p) => {
    if (p && !props.src) {
      try {
        // 传渲染进程里配置的 mpv 路径（与播放同源，避免主进程读不到设置而回退到 PATH mpv.exe）
        localThumb.value = (await window.nekoNative?.getThumb?.(p, settings.playerPaths.mpv || '')) || ''
      } catch {
        localThumb.value = ''
      }
    }
  },
  { immediate: true }
)
const resolvedSrc = computed(() => props.src || localThumb.value)
const useImage = computed(() => !!resolvedSrc.value && !failed.value)
// 换图（如切条目复用组件 / 缩略图异步就绪）时重置加载态，重新走占位→淡入
watch(resolvedSrc, () => {
  failed.value = false
  loaded.value = false
})

/** FNV-1a 稳定哈希 */
function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const geo = computed(() => {
  if (props.kind === 'backdrop') return { w: 1280, h: 720 }
  if (props.kind === 'still') return { w: 480, h: 270 }
  if (props.kind === 'avatar') return { w: 300, h: 300 }
  return { w: 300, h: 450 }
})

const colors = computed(() => {
  const h = hash(props.seed)
  const hue1 = h % 360
  const hue2 = (hue1 + 35 + (h % 55)) % 360
  return {
    c1: `hsl(${hue1} 62% 42%)`,
    c2: `hsl(${hue2} 55% 16%)`,
    glow: `hsl(${hue1} 78% 64%)`,
    angle: 118 + (h % 64)
  }
})

const uid = computed(() => 'p' + (hash(props.seed) % 1_000_000))
const initial = computed(() => (props.title || '·').trim().charAt(0).toUpperCase())
const shortTitle = computed(() => {
  const t = (props.title || '').trim()
  return t.length > 13 ? t.slice(0, 12) + '…' : t
})
</script>

<template>
  <div class="poster-wrap">
    <svg
      class="poster-svg"
      :viewBox="`0 0 ${geo.w} ${geo.h}`"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
    <defs>
      <linearGradient
        :id="`g-${uid}`"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
        :gradientTransform="`rotate(${colors.angle} 0.5 0.5)`"
      >
        <stop offset="0" :stop-color="colors.c1" />
        <stop offset="1" :stop-color="colors.c2" />
      </linearGradient>
      <radialGradient :id="`spot-${uid}`" cx="0.72" cy="0.18" r="0.85">
        <stop offset="0" :stop-color="colors.glow" stop-opacity="0.5" />
        <stop offset="1" :stop-color="colors.glow" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="`shade-${uid}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.6" />
      </linearGradient>
    </defs>

    <rect :width="geo.w" :height="geo.h" :fill="`url(#g-${uid})`" />
    <rect :width="geo.w" :height="geo.h" :fill="`url(#spot-${uid})`" />

    <text
      v-if="kind !== 'backdrop'"
      :x="geo.w / 2"
      :y="geo.h * 0.46"
      text-anchor="middle"
      dominant-baseline="middle"
      :font-size="geo.h * 0.34"
      font-weight="800"
      fill="#fff"
      fill-opacity="0.12"
    >
      {{ initial }}
    </text>

    <template v-if="kind === 'poster'">
      <rect :width="geo.w" :height="geo.h" :fill="`url(#shade-${uid})`" />
      <text
        x="22"
        :y="geo.h - 26"
        font-size="25"
        font-weight="700"
        fill="#fff"
        fill-opacity="0.94"
      >
        {{ shortTitle }}
      </text>
    </template>

    <g v-if="label">
      <rect :x="geo.w - 94" y="16" width="78" height="30" rx="15" fill="#000" fill-opacity="0.34" />
      <text
        :x="geo.w - 55"
        y="36"
        text-anchor="middle"
        font-size="15"
        font-weight="700"
        fill="#fff"
      >
        {{ label }}
      </text>
    </g>
    </svg>
    <!-- 真图铺在占位之上，加载完淡入；未加载/失败时露出下方彩色占位（过滤时卡片不空白） -->
    <img
      v-if="useImage"
      class="poster-img"
      :class="{ 'is-loaded': loaded }"
      :src="resolvedSrc"
      :alt="title"
      loading="lazy"
      decoding="async"
      @load="loaded = true"
      @error="failed = true"
    />
  </div>
</template>

<style scoped>
.poster-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.poster-svg {
  display: block;
  width: 100%;
  height: 100%;
}
.poster-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.poster-img.is-loaded {
  opacity: 1;
}
</style>
