<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Hls from 'hls.js'
import { ArrowLeft, Play } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import PlayerControls from './PlayerControls.vue'
import { usePlayer } from '@/composables/usePlayer'

const p = usePlayer()
const {
  isOpen,
  current,
  title,
  subtitleLine,
  currentTime,
  playing,
  streamUrl,
  streamType,
  live,
  buffering
} = p

const root = ref<HTMLElement>()
const videoEl = ref<HTMLVideoElement>()
let hls: Hls | null = null

const controlsVisible = ref(true)
let hideTimer: ReturnType<typeof setTimeout> | undefined

function destroyHls() {
  if (hls) {
    hls.destroy()
    hls = null
  }
}

function loadStream(url: string, type: string) {
  const el = videoEl.value
  if (!el || !url) return
  destroyHls()
  p.registerVideo(el)
  // HLS 转码流用 hls.js；Safari 原生支持 HLS 或直连文件走 src
  if (type === 'hls' && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true })
    hls.loadSource(url)
    hls.attachMedia(el)
  } else {
    el.src = url
  }
  el.play().catch(() => {})
}

watch(streamUrl, (url) => {
  if (url) loadStream(url, streamType.value)
})

function poke() {
  controlsVisible.value = true
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    if (playing.value) controlsVisible.value = false
  }, 2800)
}

function onKey(e: KeyboardEvent) {
  if (!isOpen.value) return
  if (e.code === 'Space') {
    e.preventDefault()
    p.togglePlay()
  } else if (e.code === 'Escape') {
    if (document.fullscreenElement) document.exitFullscreen()
    else p.close()
  } else if (e.code === 'ArrowRight') {
    p.seek(currentTime.value + 10)
  } else if (e.code === 'ArrowLeft') {
    p.seek(currentTime.value - 10)
  }
  poke()
}

function toggleFullscreen() {
  const el = root.value
  if (!el) return
  if (document.fullscreenElement) document.exitFullscreen()
  else el.requestFullscreen?.()
}

watch(isOpen, (v) => {
  if (v) {
    window.addEventListener('keydown', onKey)
    poke()
  } else {
    window.removeEventListener('keydown', onKey)
    clearTimeout(hideTimer)
    destroyHls()
    p.unregisterVideo()
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  destroyHls()
})
</script>

<template>
  <teleport to="body">
    <transition name="player">
      <div
        v-if="isOpen"
        ref="root"
        class="player"
        :class="{ 'hide-cursor': !controlsVisible }"
        @mousemove="poke"
      >
        <div class="player__screen" @click="p.togglePlay()">
          <video
            v-show="live"
            ref="videoEl"
            class="player__video"
            playsinline
            @timeupdate="p.onVideoTime"
            @loadedmetadata="p.onVideoLoaded"
            @durationchange="p.onVideoLoaded"
            @play="p.onVideoPlay"
            @pause="p.onVideoPause"
            @waiting="p.onVideoWaiting"
            @playing="p.onVideoPlaying"
            @ended="p.onVideoEnded"
          />

          <template v-if="!live">
            <PosterImage v-if="current" :seed="current.id" :src="current.backdropUrl" kind="backdrop" />
            <div class="player__vignette" />
          </template>

          <transition name="fade">
            <button
              v-if="!playing && !buffering"
              class="player__bigplay"
              @click.stop="p.togglePlay()"
            >
              <Play :size="38" fill="currentColor" />
            </button>
          </transition>

          <div v-if="buffering" class="player__spinner" aria-label="缓冲中" />
        </div>

        <transition name="fade">
          <div v-show="controlsVisible" class="player__top">
            <button class="player__back" title="返回" @click="p.close()">
              <ArrowLeft :size="20" />
            </button>
            <div class="player__titles">
              <h2>{{ title }}</h2>
              <p v-if="subtitleLine">{{ subtitleLine }}</p>
            </div>
          </div>
        </transition>

        <transition name="fade">
          <div v-show="controlsVisible" class="player__controls" @click.stop>
            <PlayerControls @fullscreen="toggleFullscreen" />
          </div>
        </transition>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.player {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: #000;
  overflow: hidden;
}
.player.hide-cursor {
  cursor: none;
}

.player__screen {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.player__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
.player__screen :deep(.poster-svg),
.player__screen :deep(.poster-img) {
  filter: brightness(0.72);
}
.player__vignette {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(0, 0, 0, 0.55)),
    linear-gradient(0deg, rgba(0, 0, 0, 0.7), transparent 30%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent 26%);
}
.player__bigplay {
  position: relative;
  display: grid;
  place-items: center;
  width: 86px;
  height: 86px;
  border-radius: 50%;
  color: #0b0c11;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  transition: transform var(--dur) var(--ease);
}
.player__bigplay:hover {
  transform: scale(1.06);
}
.player__spinner {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.player__top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 30px;
  z-index: 2;
}
.player__back {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: var(--blur);
  transition: background var(--dur) var(--ease);
}
.player__back:hover {
  background: rgba(255, 255, 255, 0.22);
}
.player__titles h2 {
  font-size: 18px;
  font-weight: 700;
}
.player__titles p {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-dim);
}

.player__controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 40px 34px 26px;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.72), transparent);
  z-index: 2;
}

.player-enter-active,
.player-leave-active {
  transition: opacity 0.28s var(--ease), transform 0.28s var(--ease);
}
.player-enter-from,
.player-leave-to {
  opacity: 0;
  transform: scale(1.02);
}
</style>
