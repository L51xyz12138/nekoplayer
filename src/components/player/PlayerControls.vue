<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
  Captions,
  AudioLines,
  Gauge,
  Maximize,
  Airplay
} from 'lucide-vue-next'
import TrackMenu from './TrackMenu.vue'
import { usePlayer } from '@/composables/usePlayer'

const emit = defineEmits<{ fullscreen: [] }>()

const p = usePlayer()
const {
  current,
  episode,
  playing,
  currentTime,
  duration,
  volume,
  muted,
  rate,
  subtitle,
  audio,
  quality,
  availableQualities,
  availableAudios,
  hasPrev,
  hasNext
} = p

const bar = ref<HTMLElement>()
const played = computed(() => (duration.value ? currentTime.value / duration.value : 0))
const buffered = computed(() => Math.min(1, played.value + 0.12))
const isSeries = computed(() => current.value?.type === 'series' && !!episode.value)

function fmt(sec: number) {
  sec = Math.max(0, Math.floor(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

function ratioFromEvent(e: PointerEvent) {
  const rect = bar.value!.getBoundingClientRect()
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
}
function onDown(e: PointerEvent) {
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  p.seek(ratioFromEvent(e) * duration.value)
  const move = (ev: PointerEvent) => p.seek(ratioFromEvent(ev) * duration.value)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]
function cycleRate() {
  const i = rates.indexOf(rate.value)
  p.setRate(rates[(i + 1) % rates.length])
}

const activeMenu = ref<'none' | 'subtitle' | 'audio' | 'quality'>('none')
const subtitleOpts = ['关闭', '简体中文', '繁体中文', 'English']

function toggleMenu(m: 'subtitle' | 'audio' | 'quality') {
  activeMenu.value = activeMenu.value === m ? 'none' : m
}
function onSelect(kind: 'subtitle' | 'audio' | 'quality', v: string) {
  p.setTrack(kind, v)
  activeMenu.value = 'none'
}

const volIcon = computed(() => {
  if (muted.value || volume.value === 0) return VolumeX
  if (volume.value < 0.5) return Volume1
  return Volume2
})
</script>

<template>
  <div class="ctrl">
    <div ref="bar" class="ctrl__bar" @pointerdown="onDown">
      <div class="ctrl__buffer" :style="{ width: buffered * 100 + '%' }" />
      <div class="ctrl__played" :style="{ width: played * 100 + '%' }">
        <span class="ctrl__knob" />
      </div>
    </div>

    <div class="ctrl__row">
      <div class="ctrl__group">
        <button
          v-if="isSeries"
          class="ctrl__btn"
          :disabled="!hasPrev"
          title="上一集"
          @click="p.prev()"
        >
          <SkipBack :size="20" />
        </button>

        <button class="ctrl__btn ctrl__play" @click="p.togglePlay()">
          <component :is="playing ? Pause : Play" :size="24" fill="currentColor" />
        </button>

        <button
          v-if="isSeries"
          class="ctrl__btn"
          :disabled="!hasNext"
          title="下一集"
          @click="p.next()"
        >
          <SkipForward :size="20" />
        </button>

        <div class="ctrl__vol">
          <button class="ctrl__btn" title="音量" @click="p.toggleMute()">
            <component :is="volIcon" :size="20" />
          </button>
          <input
            class="ctrl__volbar"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="muted ? 0 : volume"
            @input="p.setVolume(+($event.target as HTMLInputElement).value)"
          />
        </div>

        <span class="ctrl__time">{{ fmt(currentTime) }} <i>/</i> {{ fmt(duration) }}</span>
      </div>

      <div class="ctrl__group ctrl__group--right">
        <button class="ctrl__btn ctrl__rate" title="播放速度" @click="cycleRate">
          {{ rate }}x
        </button>

        <div class="ctrl__anchor">
          <button
            class="ctrl__btn"
            :class="{ on: activeMenu === 'subtitle' }"
            title="字幕"
            @click="toggleMenu('subtitle')"
          >
            <Captions :size="20" />
          </button>
          <TrackMenu
            v-if="activeMenu === 'subtitle'"
            title="字幕"
            :options="subtitleOpts"
            :current="subtitle"
            @select="onSelect('subtitle', $event)"
          />
        </div>

        <div class="ctrl__anchor">
          <button
            class="ctrl__btn"
            :class="{ on: activeMenu === 'audio' }"
            title="音轨"
            @click="toggleMenu('audio')"
          >
            <AudioLines :size="20" />
          </button>
          <TrackMenu
            v-if="activeMenu === 'audio'"
            title="音轨"
            :options="availableAudios"
            :current="audio"
            @select="onSelect('audio', $event)"
          />
        </div>

        <div class="ctrl__anchor">
          <button
            class="ctrl__btn"
            :class="{ on: activeMenu === 'quality' }"
            title="画质"
            @click="toggleMenu('quality')"
          >
            <Gauge :size="20" />
          </button>
          <TrackMenu
            v-if="activeMenu === 'quality'"
            title="画质"
            :options="availableQualities"
            :current="quality"
            @select="onSelect('quality', $event)"
          />
        </div>

        <button class="ctrl__btn" title="投屏"><Airplay :size="20" /></button>
        <button class="ctrl__btn" title="全屏" @click="emit('fullscreen')">
          <Maximize :size="20" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctrl {
  width: 100%;
}

.ctrl__bar {
  position: relative;
  height: 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.18);
  cursor: pointer;
  margin-bottom: 16px;
  touch-action: none;
}
.ctrl__bar::before {
  content: '';
  position: absolute;
  inset: -8px 0;
}
.ctrl__buffer {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.28);
}
.ctrl__played {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}
.ctrl__knob {
  position: absolute;
  right: -7px;
  top: 50%;
  transform: translateY(-50%) scale(0);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  transition: transform var(--dur) var(--ease);
}
.ctrl__bar:hover .ctrl__knob {
  transform: translateY(-50%) scale(1);
}

.ctrl__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.ctrl__group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl__btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: #eef1f8;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
    opacity var(--dur);
}
.ctrl__btn:hover {
  background: rgba(255, 255, 255, 0.14);
}
.ctrl__btn:disabled {
  opacity: 0.32;
  cursor: default;
}
.ctrl__btn:disabled:hover {
  background: none;
}
.ctrl__btn.on {
  color: var(--accent);
  background: var(--accent-soft);
}
.ctrl__play {
  width: 48px;
  height: 48px;
  color: #0b0c11;
  background: #fff;
}
.ctrl__play:hover {
  background: #e9edfb;
}
.ctrl__rate {
  width: auto;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ctrl__vol {
  display: flex;
  align-items: center;
}
.ctrl__volbar {
  width: 0;
  opacity: 0;
  accent-color: var(--accent);
  transition: width var(--dur) var(--ease), opacity var(--dur) var(--ease);
  cursor: pointer;
}
.ctrl__vol:hover .ctrl__volbar {
  width: 84px;
  opacity: 1;
  margin: 0 6px 0 2px;
}

.ctrl__time {
  margin-left: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ctrl__time i {
  color: var(--text-mute);
  font-style: normal;
  margin: 0 2px;
}

.ctrl__anchor {
  position: relative;
}
</style>
