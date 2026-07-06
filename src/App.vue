<script setup lang="ts">
import { onMounted } from 'vue'
import SideBar from '@/components/layout/SideBar.vue'
import PlayerOverlay from '@/components/player/PlayerOverlay.vue'
import { useEmby } from '@/composables/useEmby'
import { useLibrary } from '@/composables/useLibrary'
import { useSources } from '@/composables/useSources'
import { useSettings } from '@/composables/useSettings'

const emby = useEmby()
const { loadFromEmby } = useLibrary()
const { upsertEmbySource } = useSources()

// 初始化并应用已保存的设置（主题色等）
useSettings()

// 启动：若已有 Emby 会话，反映到媒体源栏并拉库
onMounted(() => {
  if (emby.isConnected.value && emby.session.value) {
    upsertEmbySource(emby.session.value)
    loadFromEmby()
  }
})
</script>

<template>
  <div class="app">
    <SideBar />
    <main class="app__main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 全局播放器覆盖层：可从任意页面唤起 -->
    <PlayerOverlay />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  background:
    radial-gradient(1100px 560px at 72% -12%, rgba(91, 140, 255, 0.12), transparent 60%),
    radial-gradient(900px 500px at 0% 110%, rgba(157, 123, 255, 0.08), transparent 55%),
    linear-gradient(180deg, var(--bg-0), var(--bg-1));
}

.app__main {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
}
</style>
