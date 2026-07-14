<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Sparkles, X, Minus, Square, Copy } from 'lucide-vue-next'
import SideBar from '@/components/layout/SideBar.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useSettings } from '@/composables/useSettings'
import { useHotkeys } from '@/composables/useHotkeys'
import { useUpdate } from '@/composables/useUpdate'
import { useBackground } from '@/composables/useBackground'
import iconUrl from '@/assets/icon.svg'

const { loadFromEmby, refreshAfterPlayback, applyFileProgress } = useLibrary()
const update = useUpdate()
const { backdropUrl, backdropMode, setBackdrop } = useBackground()

// 海报背景：首页/合集/演员页=模糊海报(home)、详情页=清晰大海报(focus)，各自挂载时设置；
// 其它页(媒体源/设置/Trakt)清空 → 回退纯渐变底色。
const BG_ROUTES = ['library', 'detail', 'collection', 'person']
const route = useRoute()
watch(
  () => route.name,
  (name) => {
    if (!BG_ROUTES.includes(String(name))) setBackdrop(undefined)
  },
  { immediate: true }
)

// 初始化并应用已保存的设置（主题色等）
useSettings()

// 全局键盘快捷键（/ 聚焦搜索、方向键选卡、Esc 返回/失焦）
useHotkeys()

// 自绘标题栏：平台判定 + 窗口控制
const native = window.nekoNative
const platform = native?.platform || ''
const isMac = platform === 'darwin' // mac 保留红绿灯，图标标题让开左上
const showWinButtons = platform === 'win32' // 只有 win32 自绘窗口按钮（mac 红绿灯 / linux 原生边框）
const maximized = ref(false)

// 启动：从持久化的媒体源聚合加载媒体库
onMounted(() => {
  loadFromEmby()
  // 外部播放器结束后，主进程通知前端「轻量刷新」（只刷继续观看+这条进度，不整库重拉）
  native?.onPlaybackEnded((itemId) => refreshAfterPlayback(itemId))
  // 文件源用 mpv 播放结束后，主进程回传本地进度 → 存本地 + 进「继续观看」/续播
  native?.onFileProgress((p) => applyFileProgress(p))
  // 窗口最大化状态 → 切换标题栏「最大化/还原」图标
  native?.onMaximizeChange?.((m) => (maximized.value = m))
  // 启动静默检查更新（延迟一下，不抢首屏）
  setTimeout(() => void update.check(), 4000)
})
</script>

<template>
  <div class="app">
    <!-- 全局海报模糊背景（最底层）：主页=精选海报、详情页=该片海报；上面盖渐变遮罩保证文字清晰 -->
    <div class="app__bg">
      <transition name="bgfade">
        <div v-if="backdropUrl" :key="backdropUrl" class="app__bg-media">
          <!-- 模糊底层（整幅） -->
          <img :src="backdropUrl" class="app__bg-blur" alt="" />
          <!-- 清晰叠层（仅详情页 focus）：中间偏上清晰、径向遮罩向四周淡出露出模糊底层 -->
          <img v-if="backdropMode === 'focus'" :src="backdropUrl" class="app__bg-sharp" alt="" />
        </div>
      </transition>
      <div v-if="backdropUrl" class="app__bg-scrim" :class="{ 'is-focus': backdropMode === 'focus' }" />
    </div>

    <!-- 自绘标题栏：图标+标题顶格左上，窗口按钮右上（win），中间可拖拽 -->
    <div class="app__titlebar" :class="{ 'is-mac': isMac }">
      <RouterLink to="/" class="app__brand no-drag" title="NekoPlayer · 返回主页">
        <img :src="iconUrl" alt="" draggable="false" />
        <span class="app__brand-name">NekoPlayer</span>
      </RouterLink>
      <div class="app__titlebar-fill" />
      <div v-if="showWinButtons" class="app__winctl no-drag">
        <button class="app__wbtn" title="最小化" @click="native?.windowMinimize()">
          <Minus :size="16" />
        </button>
        <button class="app__wbtn" :title="maximized ? '还原' : '最大化'" @click="native?.windowMaximize()">
          <component :is="maximized ? Copy : Square" :size="14" />
        </button>
        <button class="app__wbtn app__wbtn--close" title="关闭" @click="native?.windowClose()">
          <X :size="17" />
        </button>
      </div>
    </div>

    <div class="app__row" :class="{ 'has-bg': backdropUrl }">
      <SideBar />
      <main class="app__main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- 发现新版本：右下角悬浮提示。auto(Win/Linux 打包版)在软件内下载+重启安装；manual(mac/dev)前往下载页 -->
    <transition name="fade">
      <div
        v-if="(update.state.hasUpdate || update.state.downloaded) && !update.state.dismissed"
        class="update-toast"
      >
        <div class="update-toast__icon"><Sparkles :size="18" /></div>
        <div class="update-toast__text">
          <template v-if="update.state.downloaded">
            <strong>更新已就绪 v{{ update.state.latest }}</strong>
            <span>重启即可安装</span>
          </template>
          <template v-else-if="update.state.downloading">
            <strong>下载中… {{ update.state.progress }}%</strong>
            <span>v{{ update.state.latest }}</span>
          </template>
          <template v-else>
            <strong>发现新版本 v{{ update.state.latest }}</strong>
            <span>当前 v{{ update.current }}</span>
          </template>
        </div>
        <button v-if="update.state.downloaded" class="update-toast__go" @click="update.install()">
          重启安装
        </button>
        <template v-else-if="update.state.mode === 'auto'">
          <button
            v-if="!update.state.downloading"
            class="update-toast__go"
            @click="update.download()"
          >
            下载并安装
          </button>
        </template>
        <a
          v-else
          class="update-toast__go"
          :href="update.state.url"
          target="_blank"
          rel="noreferrer"
        >前往下载</a>
        <button class="update-toast__close" title="忽略本次" @click="update.dismiss()">
          <X :size="15" />
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  background:
    radial-gradient(900px 520px at 8% 116%, rgba(157, 123, 255, 0.1), transparent 55%),
    radial-gradient(1000px 520px at 100% 108%, rgba(91, 140, 255, 0.1), transparent 58%),
    linear-gradient(180deg, var(--bg-0), var(--bg-1));
}

/* 海报模糊背景层（在 .app 渐变之上、内容之下） */
.app__bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.app__bg-media {
  position: absolute;
  inset: 0;
}
.app__bg-blur {
  position: absolute;
  inset: -8%;
  width: 116%;
  height: 116%;
  object-fit: cover;
  filter: blur(40px) saturate(1.35);
  transform: scale(1.08);
}
/* 清晰叠层：中间偏上清晰、径向遮罩向四周淡出露出下层模糊（详情页整窗大海报效果） */
.app__bg-sharp {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  -webkit-mask-image: radial-gradient(122% 90% at 50% 24%, #000 32%, transparent 78%);
  mask-image: radial-gradient(122% 90% at 50% 24%, #000 32%, transparent 78%);
}
.app__bg-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, var(--scrim-1), var(--scrim-2));
}
/* 详情页 focus：一条平滑的全宽底部渐深遮罩（顶部透出清晰大海报、往下渐暗给简介/内容垫底）——不再有局部黑块 */
.app__bg-scrim.is-focus {
  background: linear-gradient(180deg, transparent 0%, transparent 18%, rgba(8, 9, 13, 0.5) 52%, rgba(8, 9, 13, 0.86) 100%);
}
:root[data-scheme='light'] .app__bg-scrim.is-focus {
  background: linear-gradient(180deg, transparent 0%, transparent 18%, rgba(238, 242, 248, 0.55) 52%, rgba(245, 247, 251, 0.92) 100%);
}
.bgfade-enter-active,
.bgfade-leave-active {
  transition: opacity 0.7s ease;
}
.bgfade-enter-from,
.bgfade-leave-to {
  opacity: 0;
}

.app__titlebar {
  /* 悬浮在内容之上（不占布局高度）→ 内容/海报可拉通到窗口最顶，标题栏浮在其上 */
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  height: 44px;
  -webkit-app-region: drag;
}
.app__titlebar.is-mac .app__brand {
  padding-left: 82px; /* 让开 macOS 红绿灯 */
}
.app__titlebar-fill {
  flex: 1;
  align-self: stretch;
}
.no-drag {
  -webkit-app-region: no-drag;
}
.app__brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 100%;
  padding: 0 14px 0 16px;
  color: var(--text);
}
.app__brand img {
  width: 23px;
  height: 23px;
  border-radius: 6px;
}
.app__brand-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.app__winctl {
  display: flex;
  align-items: stretch;
  height: 100%;
}
.app__wbtn {
  display: grid;
  place-items: center;
  width: 46px;
  height: 100%;
  color: var(--text-dim);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.app__wbtn:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.app__wbtn--close:hover {
  background: #e81123;
  color: #fff;
}

.app__row {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  min-height: 0;
}
/* 仅当有海报背景时（首页/详情页）给文字一层淡阴影提升可读性（子元素经继承生效；标题等自设更强阴影会覆盖）。
   其它页是纯渐变底、文字本就清晰，不加阴影（免得干净 UI 上多余的阴影）。背景恒有遮罩→暗色深阴影、亮色浅阴影 */
.app__row.has-bg {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
:root[data-scheme='light'] .app__row.has-bg {
  text-shadow: 0 1px 3px rgba(255, 255, 255, 0.95);
}
.app__main {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  /* 给悬浮标题栏留出高度（普通视图从标题栏下方开始）；详情页用负 margin 让海报顶到最上 */
  padding-top: 44px;
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
