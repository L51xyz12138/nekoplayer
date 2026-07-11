<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Play } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import type { MediaItem } from '@/types/media'

const props = defineProps<{ item: MediaItem }>()
const emit = defineEmits<{ play: [item: MediaItem] }>()

const router = useRouter()
// 点卡片进详情页（文件源 id 含斜杠/冒号，用具名路由让 vue-router 正确编码）；播放走播放键/空格
function open() {
  router.push({ name: 'detail', params: { id: props.item.id } })
}

// 剧集用 NextUp 的下一集信息；电影用自身进度
const nextUp = computed(() => props.item.nextUp)
const progress = computed(() => nextUp.value?.progress ?? props.item.progress ?? 0)
const still = computed(() => nextUp.value?.stillUrl || props.item.backdropUrl)
const remain = computed(() => Math.round(props.item.runtime * (1 - progress.value)))
const info = computed(() =>
  nextUp.value
    ? `S${nextUp.value.season}E${nextUp.value.episode} · ${nextUp.value.title}`
    : `剩余 ${remain.value} 分钟`
)
</script>

<template>
  <article
    class="cc"
    tabindex="0"
    data-nav-card
    @click="open"
    @keydown.enter="open"
    @keydown.space.prevent="emit('play', item)"
  >
    <div class="cc__thumb">
      <PosterImage :seed="nextUp?.episodeId ?? item.id" :src="still" kind="backdrop" />
      <div class="cc__scrim" />
      <button class="cc__play" title="继续播放" @click.stop="emit('play', item)">
        <Play :size="22" fill="currentColor" />
      </button>
      <div v-if="progress > 0" class="cc__bar">
        <span :style="{ width: progress * 100 + '%' }" />
      </div>
    </div>
    <div class="cc__meta">
      <h3 class="cc__title">{{ item.title }}</h3>
      <p class="cc__info">{{ info }}</p>
    </div>
  </article>
</template>

<style scoped>
.cc {
  cursor: pointer;
  width: 100%;
}

.cc__thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg-2);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.cc:hover .cc__thumb {
  transform: translateY(-4px);
  box-shadow: 0 0 0 2px var(--accent), var(--shadow-card);
}
.cc:focus-visible {
  outline: none;
}
.cc:focus-visible .cc__thumb {
  box-shadow: 0 0 0 2px var(--accent), var(--shadow-card);
}
.cc:focus-visible .cc__play {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.cc__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 45%, rgba(0, 0, 0, 0.55));
}

.cc__play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.8);
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  color: #0b0c11;
  background: rgba(255, 255, 255, 0.94);
  opacity: 0;
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.cc:hover .cc__play {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.cc__bar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  height: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.28);
  overflow: hidden;
}
.cc__bar span {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}

.cc__meta {
  padding: 10px 2px 4px;
}
.cc__title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cc__info {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-mute);
}
</style>
