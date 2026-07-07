<script setup lang="ts">
import { computed } from 'vue'
import { Check, Palette, Film, Captions, Info } from 'lucide-vue-next'
import Segmented from '@/components/common/Segmented.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useSettings } from '@/composables/useSettings'

const { settings, themes } = useSettings()
const subColors = ['#ffffff', '#ffce53', '#7fe7ff', '#a0ff9d']

// 按当前平台提供可选播放器
const platform = window.nekoNative?.platform ?? 'darwin'
const playerOptions: string[] =
  (
    {
      darwin: ['mpv', 'IINA', 'VLC', 'Infuse'],
      win32: ['mpv', 'PotPlayer'],
      linux: ['mpv', 'VLC']
    } as Record<string, string[]>
  )[platform] ?? ['mpv']

// 当前所选播放器的自定义路径（双向绑定到 playerPaths）
const currentPlayerPath = computed({
  get: () => settings.playerPaths[settings.playerMode.toLowerCase()] ?? '',
  set: (v: string) => {
    settings.playerPaths[settings.playerMode.toLowerCase()] = v
  }
})
</script>

<template>
  <div class="settings">
    <header class="settings__head">
      <h1 class="settings__title">设置</h1>
      <p class="settings__sub">个性化你的 NekoPlayer 体验</p>
    </header>

    <div class="settings__scroll no-scrollbar">
      <!-- 外观 -->
      <section class="group">
        <h2 class="group__title"><Palette :size="17" /> 外观</h2>
        <div class="card">
          <div class="row row--block">
            <div class="row__label">
              <h4>主题强调色</h4>
              <p>选一个喜欢的颜色，即时生效并自动保存喵～</p>
            </div>
            <div class="themes">
              <button
                v-for="(t, i) in themes"
                :key="t.name"
                class="theme"
                :class="{ on: settings.themeIndex === i }"
                :style="{ background: `linear-gradient(135deg, ${t.c1}, ${t.c2})` }"
                :title="t.name"
                @click="settings.themeIndex = i"
              >
                <Check v-if="settings.themeIndex === i" :size="18" />
              </button>
            </div>
          </div>
          <div class="row">
            <div class="row__label"><h4>背景主题</h4><p>暗色 / 亮色 / 跟随系统</p></div>
            <Segmented v-model="settings.colorScheme" :options="['跟随系统', '暗色', '亮色']" />
          </div>
        </div>
      </section>

      <!-- 播放 -->
      <section class="group">
        <h2 class="group__title"><Film :size="17" /> 播放</h2>
        <div class="card">
          <div class="row">
            <div class="row__label"><h4>播放方式</h4><p>选择用哪个播放器打开（按当前系统显示可用项）</p></div>
            <Segmented v-model="settings.playerMode" :options="playerOptions" />
          </div>
          <div class="row">
            <div class="row__label">
              <h4>{{ settings.playerMode }} 路径</h4>
              <p>自定义所选播放器的程序路径；留空或无效则用系统默认</p>
            </div>
            <input
              v-model="currentPlayerPath"
              class="path-input"
              :placeholder="settings.playerMode === 'mpv' ? '/opt/homebrew/bin/mpv' : '如 /Applications/VLC.app'"
              spellcheck="false"
            />
          </div>
          <div class="row">
            <div class="row__label"><h4>默认画质</h4><p>网络良好时优先使用的清晰度</p></div>
            <Segmented v-model="settings.quality" :options="['自动', '4K', '1080P', '720P', '480P']" />
          </div>
          <div class="row">
            <div class="row__label"><h4>默认倍速</h4><p>开始播放时的默认速度</p></div>
            <Segmented v-model="settings.rate" :options="[0.75, 1, 1.25, 1.5, 2]" />
          </div>
          <div class="row">
            <div class="row__label"><h4>自动播放下一集</h4><p>剧集播放结束后自动续播</p></div>
            <ToggleSwitch v-model="settings.autoNext" />
          </div>
          <div class="row">
            <div class="row__label"><h4>硬件解码</h4><p>使用 GPU 加速解码，更省电流畅</p></div>
            <ToggleSwitch v-model="settings.hwdecode" />
          </div>
        </div>
      </section>

      <!-- 字幕 -->
      <section class="group">
        <h2 class="group__title"><Captions :size="17" /> 字幕</h2>
        <div class="card">
          <div class="row">
            <div class="row__label"><h4>字幕字号</h4><p>调整字幕文字的大小</p></div>
            <Segmented v-model="settings.subSize" :options="['小', '中', '大']" />
          </div>
          <div class="row">
            <div class="row__label"><h4>字幕颜色</h4><p>选择字幕文字的颜色</p></div>
            <div class="colors">
              <button
                v-for="c in subColors"
                :key="c"
                class="color"
                :class="{ on: settings.subColor === c }"
                :style="{ background: c }"
                @click="settings.subColor = c"
              />
            </div>
          </div>
          <div class="row">
            <div class="row__label"><h4>文字描边</h4><p>为字幕添加黑色描边，提升可读性</p></div>
            <ToggleSwitch v-model="settings.subOutline" />
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section class="group">
        <h2 class="group__title"><Info :size="17" /> 关于</h2>
        <div class="card about">
          <div class="about__logo">ネ</div>
          <div class="about__info">
            <h3>NekoPlayer <span>v0.1.0 · 开发中</span></h3>
            <p>跨平台媒体播放器 · 已接入真实 Emby</p>
            <p class="about__stack">Vue 3 · Vite · TypeScript · 由浮浮酱精心打造 ฅ'ω'ฅ</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.settings__head {
  flex-shrink: 0;
  /* 与滚动内容左右对齐，一起居中 */
  padding: 28px max(40px, calc((100% - 760px) / 2)) 18px;
}
.settings__title {
  font-size: 28px;
  font-weight: 800;
}
.settings__sub {
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-mute);
}
.settings__scroll {
  flex: 1;
  overflow-y: auto;
  /* 滚动容器占满整宽（整个区域都能滚），用左右 padding 把内容挤到中间实现居中 */
  padding: 6px max(40px, calc((100% - 760px) / 2)) 50px;
}

.group {
  margin-bottom: 28px;
}
.group__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--text-dim);
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 4px 20px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 0;
  border-bottom: 1px solid var(--border);
}
.row:last-child {
  border-bottom: none;
}
.row--block {
  align-items: flex-start;
}
.row__label h4 {
  font-size: 15px;
  font-weight: 600;
}
.row__label p {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-mute);
}

.themes {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}
.theme {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: #fff;
  border: 2px solid transparent;
  transition: transform var(--dur) var(--ease);
}
.theme:hover {
  transform: scale(1.1);
}
.theme.on {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--bg-1), 0 0 14px rgba(255, 255, 255, 0.3);
}

.colors {
  display: flex;
  gap: 12px;
}
.color {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: transform var(--dur) var(--ease);
}
.color:hover {
  transform: scale(1.1);
}
.color.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--bg-1), 0 0 0 4px var(--accent);
}

.about {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px 20px;
}
.about__logo {
  display: grid;
  place-items: center;
  width: 62px;
  height: 62px;
  flex-shrink: 0;
  border-radius: 18px;
  font-size: 30px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 8px 22px var(--accent-glow);
}
.about__info h3 {
  font-size: 18px;
  font-weight: 700;
}
.about__info h3 span {
  margin-left: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-mute);
}
.about__info p {
  margin-top: 5px;
  font-size: 13.5px;
  color: var(--text-dim);
}
.about__stack {
  color: var(--text-mute) !important;
}

.path-input {
  width: 280px;
  height: 40px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--text);
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  outline: none;
  font-family: 'SF Mono', ui-monospace, monospace;
  transition: border-color var(--dur) var(--ease);
}
.path-input:focus {
  border-color: var(--accent);
}
</style>
