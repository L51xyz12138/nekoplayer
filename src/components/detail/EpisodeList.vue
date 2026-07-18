<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Play, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import type { Episode, Season } from '@/types/media'

// 点单集 → 聚焦该集（详情页的简介/文件信息/音轨字幕切成该集）；播放走卡片播放键
const props = defineProps<{ seasons: Season[]; resumeId?: string; selectedId?: string }>()
const emit = defineEmits<{ play: [ep: Episode]; select: [ep: Episode] }>()

const active = ref(props.seasons[0]?.season ?? 1)
const current = computed(
  () => props.seasons.find((s) => s.season === active.value) ?? props.seasons[0]
)

const track = ref<HTMLElement>()
function scroll(dir: number) {
  const el = track.value
  if (!el) return
  el.scrollBy({ left: dir * el.clientWidth * 0.82, behavior: 'smooth' })
}

// 定位续看集：切到它所在季，并横向滚动到该集
function seasonOfEp(id?: string): number | undefined {
  if (!id) return undefined
  return props.seasons.find((s) => s.episodes.some((e) => e.id === id))?.season
}
function scrollToResume() {
  if (!props.resumeId) return
  const el = track.value
  const node = el?.querySelector<HTMLElement>(`[data-ep-id="${CSS.escape(props.resumeId)}"]`)
  if (!el || !node) return
  // 只横向滚动剧集行（不能用 scrollIntoView：block:'nearest' 会把整页垂直拉下去，进详情页落点就不在顶部了）
  const elRect = el.getBoundingClientRect()
  const nRect = node.getBoundingClientRect()
  const left = el.scrollLeft + (nRect.left - elRect.left) - el.clientWidth / 2 + nRect.width / 2
  el.scrollTo({ left, behavior: 'smooth' })
}
watch(
  () => props.resumeId,
  (id) => {
    const sea = seasonOfEp(id)
    if (sea != null) active.value = sea
    nextTick(scrollToResume)
  },
  { immediate: true }
)

// 判断标题是不是「没刮削到元数据的原始文件名」（字幕组命名 / S01E01 / 直接就是文件名）
function isRawName(title: string): boolean {
  const s = title.trim()
  if (!s) return true
  if (/\.(mkv|mp4|avi|mov|wmv|flv|webm|m2ts|ts|rmvb|mpg|mpeg|iso)$/i.test(s)) return true
  if (/^s\d{1,2}e\d{1,3}\b/i.test(s)) return true // S01E03 开头（含文件源兜底的 "S1E3" 整串）
  // 典型发布组命名：带 [字幕组] / 【字幕组】且含清晰度、编码等技术标签
  if (/[\[【][^\]】]*[\]】]/.test(s) && /(\d{3,4}p|x26[45]|hevc|avc|flac|aac2?|ma10p|10bit|8bit|bdrip|web[- ]?dl)/i.test(s))
    return true
  return false
}
// 主标题：真标题 → 「第 N 集 · 标题」；文件名 → 只留「第 N 集」，文件名降级成小字
function mainTitle(ep: Episode): string {
  const n = ep.episode > 0 ? `第 ${ep.episode} 集` : ''
  if (isRawName(ep.title)) return n || '未编号'
  return n ? `${n} · ${ep.title}` : ep.title
}
</script>

<template>
  <section class="eps">
    <div class="eps__head">
      <h2 class="eps__title">剧集</h2>
      <div class="eps__actions">
        <div v-if="seasons.length > 1" class="eps__seasons">
          <button
            v-for="s in seasons"
            :key="s.season"
            class="stab"
            :class="{ on: active === s.season }"
            @click="active = s.season"
          >
            {{ s.title }}
          </button>
        </div>
        <span v-else-if="current" class="eps__single">{{ current.title }}</span>
        <div class="eps__nav">
          <button class="eps__btn" title="向左" @click="scroll(-1)"><ChevronLeft :size="18" /></button>
          <button class="eps__btn" title="向右" @click="scroll(1)"><ChevronRight :size="18" /></button>
        </div>
      </div>
    </div>

    <div ref="track" class="eps__track no-scrollbar">
      <article
        v-for="ep in current.episodes"
        :key="ep.id"
        class="ep"
        :class="{ resuming: ep.id === resumeId, 'is-selected': ep.id === selectedId }"
        :data-ep-id="ep.id"
        :title="ep.localPath"
        tabindex="0"
        data-nav-card
        @click="emit('select', ep)"
        @keydown.enter="emit('select', ep)"
        @keydown.space.prevent="emit('play', ep)"
      >
        <div class="ep__thumb">
          <PosterImage :seed="ep.stillSeed" :src="ep.stillUrl" :local-path="ep.localPath" kind="still" />
          <div class="ep__scrim" />
          <button class="ep__play" title="播放本集" @click.stop="emit('play', ep)">
            <Play :size="18" fill="currentColor" />
          </button>
          <span v-if="ep.id === resumeId" class="ep__badge ep__badge--resume">续看</span>
          <span v-else class="ep__badge">第 {{ ep.episode }} 集</span>
          <span v-if="ep.runtime" class="ep__dur">{{ ep.runtime }} 分钟</span>
          <div v-if="ep.progress" class="ep__bar"><span :style="{ width: ep.progress * 100 + '%' }" /></div>
        </div>
        <div class="ep__info">
          <h3 class="ep__name" :class="{ 'ep__name--plain': isRawName(ep.title) }">{{ mainTitle(ep) }}</h3>
          <p v-if="isRawName(ep.title)" class="ep__file" :title="ep.title">{{ ep.title }}</p>
          <p v-if="ep.overview" class="ep__overview clamp-2">{{ ep.overview }}</p>
        </div>
      </article>
    </div>
  </section>
</template>


<style scoped>
.eps {
  margin-bottom: 40px;
}
.eps__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 16px;
}
.eps__title {
  font-size: 20px;
  font-weight: 700;
}
.eps__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.eps__seasons {
  display: flex;
  gap: 6px;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.stab {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  border-radius: var(--r-pill);
  transition: color var(--dur), background var(--dur);
}
.stab.on {
  color: #fff;
  background: var(--surface-hover);
}
.eps__single {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.eps__nav {
  display: flex;
  gap: 8px;
}
.eps__btn {
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
.eps__btn:hover {
  color: #fff;
  background: var(--surface-hover);
}

.eps__track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 290px;
  gap: 16px;
  overflow-x: auto;
  /* 上下留白，避免单集 hover 上移/描边被裁剪 */
  padding: 8px 2px 6px;
  margin-top: -8px;
  scroll-snap-type: x proximity;
}
.ep {
  cursor: pointer;
  scroll-snap-align: start;
}

.ep__thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg-2);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.ep:hover .ep__thumb {
  transform: translateY(-4px);
  box-shadow: 0 0 0 2px var(--accent), var(--shadow-card);
}
.ep:focus-visible {
  outline: none;
}
.ep:focus-visible .ep__thumb {
  box-shadow: 0 0 0 2px var(--accent), var(--shadow-card);
}
.ep:focus-visible .ep__play {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
/* 当前聚焦的那一集：常驻强调色描边 */
.ep.is-selected .ep__thumb {
  box-shadow: 0 0 0 2px var(--accent);
}
.ep__badge--resume {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.ep__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.5));
}
.ep__play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.8);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #0b0c11;
  background: rgba(255, 255, 255, 0.94);
  opacity: 0;
  transition: opacity var(--dur), transform var(--dur);
}
.ep:hover .ep__play {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.ep__badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 9px;
  font-size: 11.5px;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  border-radius: var(--r-pill);
}
.ep__dur {
  position: absolute;
  bottom: 10px;
  right: 10px;
  padding: 3px 9px;
  font-size: 11.5px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  border-radius: var(--r-pill);
}
.ep__bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: rgba(0, 0, 0, 0.5);
}
.ep__bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}

.ep__info {
  padding: 11px 2px 0;
}
.ep__name {
  font-size: 14.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 没刮到元数据：主标题只显示「第 N 集」，弱化一点，把识别度让给缩略图 */
.ep__name--plain {
  font-weight: 650;
  color: var(--text-dim);
}
/* 原始文件名降级成弱化小字（仍可见、hover 有完整 title） */
.ep__file {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-mute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ep__overview {
  margin-top: 5px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-mute);
}
</style>
