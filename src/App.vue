<script setup lang="ts">
import { onMounted } from 'vue'
import { Sparkles, X } from 'lucide-vue-next'
import SideBar from '@/components/layout/SideBar.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useSettings } from '@/composables/useSettings'
import { useHotkeys } from '@/composables/useHotkeys'
import { useUpdate } from '@/composables/useUpdate'

const { loadFromEmby, refreshAfterPlayback, applyFileProgress } = useLibrary()
const update = useUpdate()

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
  // 启动静默检查更新（延迟一下，不抢首屏）
  setTimeout(() => void update.check(), 4000)
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

    <!-- 发现新版本：右下角悬浮提示（点前往下载打开 release 页；× 忽略本次） -->
    <transition name="fade">
      <div v-if="update.state.hasUpdate && !update.state.dismissed" class="update-toast">
        <div class="update-toast__icon"><Sparkles :size="18" /></div>
        <div class="update-toast__text">
          <strong>发现新版本 v{{ update.state.latest }}</strong>
          <span>当前 v{{ update.current }}</span>
        </div>
        <a class="update-toast__go" :href="update.state.url" target="_blank" rel="noreferrer">前往下载</a>
        <button class="update-toast__close" title="忽略本次" @click="update.dismiss()">
          <X :size="15" />
        </button>
      </div>
    </transition>
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

/* 发现新版本提示条（右下角悬浮） */
.update-toast {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 380px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
  backdrop-filter: var(--blur);
}
.update-toast__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.update-toast__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.update-toast__text strong {
  font-size: 14px;
  font-weight: 700;
}
.update-toast__text span {
  font-size: 12px;
  color: var(--text-mute);
}
.update-toast__go {
  flex-shrink: 0;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: var(--r-pill);
}
.update-toast__close {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  color: var(--text-mute);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.update-toast__close:hover {
  color: var(--text);
  background: var(--surface-hover);
}
</style>
