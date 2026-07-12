<script setup lang="ts">
import { computed } from 'vue'
import { Clapperboard, Server, Settings, Tv } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { useTrakt } from '@/composables/useTrakt'
import iconUrl from '@/assets/icon.svg'

const route = useRoute()
const trakt = useTrakt()

// 连接 Trakt 后才出现「Trakt」入口
const items = computed(() => [
  { name: 'library', label: '媒体库', icon: Clapperboard, to: '/' },
  ...(trakt.connected.value ? [{ name: 'trakt', label: 'Trakt', icon: Tv, to: '/trakt' }] : []),
  { name: 'sources', label: '媒体源', icon: Server, to: '/sources' },
  { name: 'settings', label: '设置', icon: Settings, to: '/settings' }
])

function isActive(name: string) {
  if (name === 'library') {
    return route.name === 'library' || route.name === 'detail'
  }
  return route.name === name
}
</script>

<template>
  <aside class="rail">
    <RouterLink to="/" class="rail__logo" title="NekoPlayer · 返回主页">
      <img :src="iconUrl" alt="NekoPlayer" draggable="false" />
    </RouterLink>

    <nav class="rail__nav">
      <RouterLink
        v-for="item in items"
        :key="item.name"
        :to="item.to"
        class="rail__item"
        :class="{ 'is-active': isActive(item.name) }"
        :title="item.label"
      >
        <span class="rail__glow" />
        <component :is="item.icon" :size="22" :stroke-width="2" />
        <span class="rail__label">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="rail__spacer" />
  </aside>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--rail-w);
  flex-shrink: 0;
  padding: 18px 0 20px;
  gap: 8px;
  /* 极淡的左侧染色，向右渐隐为透明 → 没有硬边/边线，和内容区柔和相接（不突兀） */
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.012) 60%, transparent);
  /* 侧栏空白处也可拖动窗口（按钮/链接下面设了 no-drag） */
  -webkit-app-region: drag;
}
.rail__logo,
.rail__item {
  -webkit-app-region: no-drag;
}

.rail__logo {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-bottom: 10px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 22px var(--accent-glow);
  transition: transform var(--dur) var(--ease);
}
.rail__logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rail__logo:hover {
  transform: translateY(-1px);
}

.rail__nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  align-items: center;
}

.rail__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 60px;
  padding: 11px 0 9px;
  border-radius: var(--r-md);
  color: var(--text-mute);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.rail__item:hover {
  color: var(--text-dim);
  background: var(--surface);
}
.rail__item.is-active {
  color: var(--accent);
}
.rail__item.is-active .rail__glow {
  opacity: 1;
}

.rail__glow {
  position: absolute;
  inset: 0;
  border-radius: var(--r-md);
  background: linear-gradient(160deg, var(--accent-soft), transparent 70%);
  border: 1px solid var(--border-strong);
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.rail__item.is-active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--accent), var(--accent-2));
  box-shadow: 0 0 12px var(--accent-glow);
}

.rail__label {
  position: relative;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.rail__spacer {
  flex: 1;
}
</style>
