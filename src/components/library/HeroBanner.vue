<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Play, Info } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import IconButton from '@/components/common/IconButton.vue'
import RatingPill from '@/components/common/RatingPill.vue'
import type { MediaItem } from '@/types/media'

const props = defineProps<{ item: MediaItem }>()
const emit = defineEmits<{ play: [item: MediaItem] }>()

const router = useRouter()

// 文件源条目 id 含斜杠/冒号，用具名路由让 vue-router 正确编码
function openDetail() {
  router.push({ name: 'detail', params: { id: props.item.id } })
}
</script>

<template>
  <section class="hero" @click="openDetail">
    <div class="hero__bg">
      <PosterImage :seed="item.id" :src="item.backdropUrl" kind="backdrop" />
    </div>
    <div class="hero__scrim" />

    <div class="hero__content">
      <span class="hero__badge">精选推荐</span>
      <h1 class="hero__title">{{ item.title }}</h1>

      <div class="hero__meta">
        <span>{{ item.year }}</span>
        <span class="dot" />
        <span>{{ item.type === 'series' ? '剧集' : item.runtime + ' 分钟' }}</span>
        <span class="dot" />
        <span class="cert">{{ item.certification }}</span>
        <span class="dot" />
        <RatingPill :rating="item.rating" />
      </div>

      <p class="hero__overview clamp-2">{{ item.overview }}</p>

      <div class="hero__genres">
        <span v-for="g in item.genres" :key="g" class="chip">{{ g }}</span>
      </div>

      <div class="hero__actions">
        <IconButton variant="solid" label="播放" @click.stop="emit('play', item)">
          <Play :size="18" fill="currentColor" />
        </IconButton>
        <IconButton variant="glass" label="更多信息" @click.stop="openDetail">
          <Info :size="18" />
        </IconButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  height: 420px;
  border-radius: var(--r-xl);
  overflow: hidden;
  cursor: pointer;
}
.hero__bg {
  position: absolute;
  inset: 0;
}
.hero__scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(6, 7, 11, 0.92) 12%, rgba(6, 7, 11, 0.5) 46%, transparent 72%),
    linear-gradient(0deg, rgba(6, 7, 11, 0.85), transparent 55%);
}

.hero__content {
  position: absolute;
  left: 44px;
  bottom: 40px;
  max-width: 560px;
}
.hero__badge {
  display: inline-block;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-pill);
  margin-bottom: 16px;
}
.hero__title {
  font-size: 48px;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.01em;
  /* 固定亮色（不随主题翻转）+ 阴影，压在背景海报上也清晰 */
  color: #fff;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6);
}
.hero__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
}
.hero__meta .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-mute);
}
.hero__meta .cert {
  padding: 1px 7px;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  font-size: 12px;
}
.hero__overview {
  margin-top: 16px;
  font-size: 15px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
}
.hero__genres {
  display: flex;
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
.hero__actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
</style>
