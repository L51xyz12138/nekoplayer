<script setup lang="ts">
import { onMounted } from 'vue'
import SideBar from '@/components/layout/SideBar.vue'
import iconUrl from '@/assets/icon.svg'
import { useLibrary } from '@/composables/useLibrary'
import { useSettings } from '@/composables/useSettings'
import { useHotkeys } from '@/composables/useHotkeys'

// macOS 下标题栏左侧要让开红绿灯
const isMac = window.nekoNative?.platform === 'darwin'

const { loadFromEmby, refreshAfterPlayback } = useLibrary()

// 初始化并应用已保存的设置（主题色等）
useSettings()

// 全局键盘快捷键（/ 聚焦搜索、方向键选卡、Esc 返回/失焦）
useHotkeys()

// 启动：从持久化的媒体源聚合加载媒体库
onMounted(() => {
  loadFromEmby()
  // 外部播放器结束后，主进程通知前端「轻量刷新」（只刷继续观看+这条进度，不整库重拉）
  window.nekoNative?.onPlaybackEnded((itemId) => refreshAfterPlayback(itemId))
})
</script>

<template>
  <div class="app">
    <!-- 无原生标题栏：自绘一条拉通到顶的标题栏（左：图标+名称，右：悬浮系统窗口按钮），整条可拖拽 -->
    <div class="app__titlebar" :class="{ 'app__titlebar--mac': isMac }">
      <img class="app__logo" :src="iconUrl" alt="" draggable="false" />
      <span class="app__name">NekoPlayer</span>
    </div>
    <div class="app__row">
      <SideBar />
      <main class="app__main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  /* 顶部保持纯 --bg-0（去掉了原来右上角的蓝色径向光），右上角悬浮按钮区(纯色 --bg-0)才能完全一致；
     辉光挪到底部一侧、不影响顶部 */
  background:
    radial-gradient(900px 520px at 8% 116%, rgba(157, 123, 255, 0.1), transparent 55%),
    radial-gradient(1000px 520px at 100% 108%, rgba(91, 140, 255, 0.1), transparent 58%),
    linear-gradient(180deg, var(--bg-0), var(--bg-1));
}
.app__titlebar {
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 16px;
  /* 透明：让 .app 的渐变直接流过，与内容区完全一致（overlay 用渐变顶色 --bg-0 近似匹配） */
  background: transparent;
  -webkit-app-region: drag;
}
.app__titlebar--mac {
  padding-left: 80px;
}
.app__logo {
  width: 27px;
  height: 27px;
  flex-shrink: 0;
  border-radius: 7px;
}
.app__name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-dim);
}
.app__row {
  display: flex;
  flex: 1;
  min-height: 0;
}
.app__main {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
</style>
