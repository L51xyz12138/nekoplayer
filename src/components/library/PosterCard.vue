<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Check, Heart, Play } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import RatingPill from '@/components/common/RatingPill.vue'
import type { MediaItem } from '@/types/media'

const props = defineProps<{ item: MediaItem }>()
const emit = defineEmits<{ favorite: [id: string]; play: [item: MediaItem] }>()

const router = useRouter()

function open() {
  router.push(`/detail/${props.item.id}`)
}
</script>

<template>
  <article class="card" @click="open">
    <div class="card__poster">
      <PosterImage
        :seed="item.id"
        :title="item.title"
        :src="item.posterUrl"
        kind="poster"
        :label="item.type === 'series' ? '剧集' : ''"
      />

      <div class="card__overlay">
        <button class="card__play" title="播放" @click.stop="emit('play', item)">
          <Play :size="20" fill="currentColor" />
        </button>
      </div>

      <button
        class="card__fav"
        :class="{ on: item.favorite }"
        title="收藏"
        @click.stop="emit('favorite', item.id)"
      >
        <Heart :size="15" :fill="item.favorite ? 'currentColor' : 'none'" />
      </button>

      <div v-if="item.watched" class="card__watched" title="已看完">
        <Check :size="13" />
      </div>

      <div v-if="item.progress" class="card__bar">
        <span :style="{ width: item.progress * 100 + '%' }" />
      </div>
    </div>

    <div class="card__meta">
      <h3 class="card__title">{{ item.title }}</h3>
      <div class="card__sub">
        <span>{{ item.year }}</span>
        <RatingPill :rating="item.rating" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  cursor: pointer;
  width: 100%;
}

.card__poster {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg-2);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.card:hover .card__poster {
  transform: translateY(-5px) scale(1.03);
  box-shadow: 0 0 0 2px var(--accent), var(--shadow-card);
}

.card__overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.35));
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.card:hover .card__overlay {
  opacity: 1;
}
.card__play {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  color: #0b0c11;
  background: rgba(255, 255, 255, 0.94);
  transform: scale(0.8);
  transition: transform var(--dur) var(--ease);
}
.card:hover .card__play {
  transform: scale(1);
}
.card__play:active {
  transform: scale(0.9);
}

.card__fav {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  opacity: 0;
  transition: opacity var(--dur) var(--ease), color var(--dur) var(--ease);
}
.card:hover .card__fav,
.card__fav.on {
  opacity: 1;
}
.card__fav.on {
  color: #ff6b8b;
}

.card__watched {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  background: var(--accent);
  box-shadow: 0 2px 8px var(--accent-glow);
}

.card__bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: rgba(0, 0, 0, 0.5);
}
.card__bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}

.card__meta {
  padding: 9px 2px 4px;
}
.card__title {
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card__sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-mute);
}
</style>
