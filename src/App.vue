<script setup lang="ts">
import { onMounted } from 'vue'
import SideBar from '@/components/layout/SideBar.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useSettings } from '@/composables/useSettings'
import { useHotkeys } from '@/composables/useHotkeys'

const { loadFromEmby, refreshAfterPlayback, applyFileProgress } = useLibrary()

// 初始化并应用已保存的设置（主题色等）
useSettings()

// 全局键盘快捷键（/ 聚焦搜索、方向键选卡、Esc 返回/失焦）
useHotkeys()

// 启动：从持久化的媒体源聚合加载媒体库
onMounted(() => {
  loadFromEmby()
  // 外部播放器结束后，主进程通知前端「轻量刷新」（只刷继续观看+这条进度，不整库重拉）
  window.nekoNative?.onPlaybackEnded((itemId) => refreshAfterPlayback(itemId))
  // 文件源用 mpv 播放结束后，主进程回传本地进度 → 存本地 + 进「继续观看」/续播
  window.nekoNative?.onFileProgress((p) => applyFileProgress(p))
})
</script>

<template>
  <div class="app">
    <!-- 无原生标题栏：留一条拉通到顶、可拖拽的空条，只承载系统窗口按钮（min/全屏/关闭）；图标已移到侧栏顶部 -->
    <div class="app__titlebar" />
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
  /* 透明：让 .app 的渐变直接流过，与内容区完全一致（overlay 用渐变顶色 --bg-0 近似匹配） */
  background: transparent;
  -webkit-app-region: drag;
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
