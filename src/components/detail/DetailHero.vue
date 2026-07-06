<script setup lang="ts">
import { Play, Heart, Check, ExternalLink } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import IconButton from '@/components/common/IconButton.vue'
import MetaBar from './MetaBar.vue'
import type { MediaItem } from '@/types/media'

defineProps<{ item: MediaItem }>()
const emit = defineEmits<{ play: []; favorite: []; 'play-with': [player: string] }>()

// 当前平台可用的播放器（仅 Electron 显示快捷按钮）
const nn = (window as unknown as { nekoNative?: { platform?: string; playMpv?: unknown } }).nekoNative
const players: string[] = nn?.playMpv
  ? (
      {
        darwin: ['mpv', 'IINA', 'VLC', 'Infuse'],
        win32: ['mpv', 'PotPlayer'],
        linux: ['mpv', 'VLC']
      } as Record<string, string[]>
    )[nn.platform ?? 'darwin'] ?? []
  : []
</script>

<template>
  <header class="dhero">
    <div class="dhero__bg">
      <PosterImage :seed="item.id" :src="item.backdropUrl" kind="backdrop" />
    </div>
    <div class="dhero__scrim" />

    <div class="dhero__inner">
      <div class="dhero__poster">
        <PosterImage
          :seed="item.id"
          :title="item.title"
          :src="item.posterUrl"
          kind="poster"
          :label="item.type === 'series' ? '剧集' : ''"
        />
      </div>

      <div class="dhero__info">
        <h1 class="dhero__title">{{ item.title }}</h1>
        <p v-if="item.tagline" class="dhero__tagline">「{{ item.tagline }}」</p>

        <MetaBar :item="item" />

        <div class="dhero__genres">
          <span v-for="g in item.genres" :key="g" class="chip">{{ g }}</span>
        </div>

        <p class="dhero__overview clamp-3">{{ item.overview }}</p>

        <div class="dhero__actions">
          <IconButton variant="solid" label="播放" @click="emit('play')">
            <Play :size="18" fill="currentColor" />
          </IconButton>
          <IconButton
            v-for="p in players"
            :key="p"
            variant="glass"
            :label="p"
            @click="emit('play-with', p)"
          >
            <ExternalLink :size="16" />
          </IconButton>
          <IconButton
            variant="glass"
            round
            :class="{ 'is-fav': item.favorite }"
            :title="item.favorite ? '取消收藏' : '收藏'"
            @click="emit('favorite')"
          >
            <Heart :size="18" :fill="item.favorite ? 'currentColor' : 'none'" />
          </IconButton>
          <IconButton variant="glass" round title="标记已看">
            <Check :size="18" />
          </IconButton>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.dhero {
  position: relative;
  min-height: 64vh;
  display: flex;
  align-items: flex-end;
}
.dhero__bg {
  position: absolute;
  inset: 0;
}
.dhero__scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, var(--bg-1) 2%, rgba(11, 12, 17, 0.4) 40%, transparent 78%),
    linear-gradient(90deg, rgba(6, 7, 11, 0.7), transparent 60%);
}

.dhero__inner {
  position: relative;
  display: flex;
  gap: 34px;
  align-items: flex-end;
  padding: 0 44px 40px;
  width: 100%;
}
.dhero__poster {
  flex-shrink: 0;
  width: 196px;
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--shadow-pop);
  aspect-ratio: 2 / 3;
}
.dhero__info {
  flex: 1;
  min-width: 0;
  max-width: 640px;
  padding-bottom: 6px;
}
.dhero__title {
  font-size: 44px;
  font-weight: 800;
  line-height: 1.06;
  letter-spacing: -0.01em;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}
.dhero__tagline {
  margin-top: 10px;
  font-size: 15px;
  font-style: italic;
  color: var(--text-mute);
}
.dhero__info :deep(.meta) {
  margin-top: 16px;
}
.dhero__genres {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.chip {
  padding: 5px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.dhero__overview {
  margin-top: 16px;
  font-size: 15px;
  line-height: 1.65;
  color: var(--text-dim);
}
.dhero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}
.is-fav {
  color: #ff6b8b;
}
</style>
