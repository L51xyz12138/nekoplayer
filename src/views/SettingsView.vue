<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Check, Palette, Film, Captions, Info, Clapperboard, Github, Tv } from 'lucide-vue-next'
import Segmented from '@/components/common/Segmented.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useSettings } from '@/composables/useSettings'
import { useTrakt } from '@/composables/useTrakt'
import iconUrl from '@/assets/icon.svg'

const appVersion = __APP_VERSION__
const { settings, themes } = useSettings()
const trakt = useTrakt()
const subColors = ['#ffffff', '#ffce53', '#7fe7ff', '#a0ff9d']

// 按当前平台提供可选播放器
const platform = window.nekoNative?.platform ?? 'darwin'
const playerOptions: string[] =
  (
    {
      darwin: ['mpv', 'IINA', 'VLC', 'Infuse'],
      win32: ['mpv', 'PotPlayer', 'VLC'],
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

// 刮削语言：UI 用中文/English，存 zh-CN/en-US
const tmdbLangLabel = computed({
  get: () => (settings.tmdbLang === 'en-US' ? 'English' : '中文'),
  set: (v: string | number) => {
    settings.tmdbLang = v === 'English' ? 'en-US' : 'zh-CN'
  }
})

const pathPlaceholder = computed(() => {
  const win = platform === 'win32'
  if (settings.playerMode === 'mpv') return win ? 'D:\\mpv\\mpv.exe' : '/opt/homebrew/bin/mpv'
  return win ? '如 D:\\PotPlayer\\PotPlayerMini64.exe' : '如 /Applications/VLC.app'
})

// mpv 可用性提示（缩略图/本地播放都依赖 mpv；dev 与打包版是不同配置档，路径需各填一次）
const mpvStatus = ref<{ ok: boolean; path: string } | null>(null)
async function refreshMpvStatus() {
  if (settings.playerMode !== 'mpv' || !window.nekoNative?.checkMpv) {
    mpvStatus.value = null
    return
  }
  try {
    mpvStatus.value = await window.nekoNative.checkMpv(settings.playerPaths.mpv || '')
  } catch {
    mpvStatus.value = null
  }
}
onMounted(refreshMpvStatus)
watch(() => [settings.playerMode, settings.playerPaths.mpv], refreshMpvStatus)
</script>

<template>
  <div class="settings">
    <header class="settings__head">
      <h1 class="settings__title">设置</h1>
      <p class="settings__sub">个性化你的 NekoPlayer 体验</p>
    </header>

    <div class="settings__scroll">
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
            <div class="path-cell">
              <input
                v-model="currentPlayerPath"
                class="path-input"
                :placeholder="pathPlaceholder"
                spellcheck="false"
              />
              <p
                v-if="settings.playerMode === 'mpv' && mpvStatus"
                class="path-status"
                :class="{ ok: mpvStatus.ok }"
              >
                {{
                  mpvStatus.ok
                    ? '✓ 已找到 mpv，缩略图与本地播放可用'
                    : '⚠ 未找到 mpv：缩略图和本地/网络视频播放都需要它，请在上方填完整路径'
                }}
              </p>
            </div>
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
            <div class="row__label"><h4>音轨语言</h4><p>播放时优先选择的音轨（原声即不强制切换）· 仅 mpv</p></div>
            <Segmented v-model="settings.audioLang" :options="['原声', '中文', '日文', '英文']" />
          </div>
          <div class="row">
            <div class="row__label"><h4>自动播放下一集</h4><p>剧集播放结束后自动续播</p></div>
            <ToggleSwitch v-model="settings.autoNext" />
          </div>
          <div class="row">
            <div class="row__label"><h4>跳过片头片尾</h4><p>按章节名自动跳过（需媒体带 Intro/OP/ED 等章节）· 仅 mpv</p></div>
            <ToggleSwitch v-model="settings.skipIntro" />
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
            <div class="row__label"><h4>字幕语言</h4><p>播放时优先的字幕（关闭=不显示字幕）· 仅 mpv</p></div>
            <Segmented v-model="settings.subLang" :options="['自动', '中文', '英文', '关闭']" />
          </div>
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

      <!-- 刮削 -->
      <section class="group">
        <h2 class="group__title"><Clapperboard :size="17" /> 刮削（文件源元数据）</h2>
        <div class="card">
          <div class="row">
            <div class="row__label">
              <h4>TMDB API Key</h4>
              <p>填入后，本机 / WebDAV / SMB / DLNA 的视频自动匹配海报与信息；留空则只显示 mpv 缩略图。Emby / Jellyfin 由服务器自己刮，不受此影响。免费申请：themoviedb.org → 设置 → API</p>
            </div>
            <input
              v-model="settings.tmdbKey"
              class="path-input"
              placeholder="TMDB v3 API Key"
              spellcheck="false"
            />
          </div>
          <div class="row">
            <div class="row__label"><h4>刮削语言</h4><p>匹配到的标题 / 简介语言</p></div>
            <Segmented v-model="tmdbLangLabel" :options="['中文', 'English']" />
          </div>
        </div>
      </section>

      <!-- Trakt -->
      <section class="group">
        <h2 class="group__title"><Tv :size="17" /> Trakt（观看记录同步）</h2>
        <div class="card">
          <!-- 已连接 -->
          <div v-if="trakt.connected.value" class="row">
            <div class="row__label">
              <h4>已连接 Trakt<span v-if="trakt.state.user?.username"> · {{ trakt.state.user.username }}</span></h4>
              <p>用 mpv 播放时会自动把观看进度同步到 Trakt、看完自动标记已看。</p>
            </div>
            <button class="trakt-btn trakt-btn--off" @click="trakt.disconnect">断开连接</button>
          </div>

          <!-- 配对中：显示配对码 + 授权链接，自动轮询 -->
          <div v-else-if="trakt.state.status === 'pairing'" class="row">
            <div class="row__label">
              <h4>在浏览器里输入配对码</h4>
              <p>打开授权页、输入下面的配对码完成授权，本页会自动检测（勿关闭）。</p>
              <div class="trakt-pair">
                <code class="trakt-code">{{ trakt.state.device?.user_code }}</code>
                <a
                  class="trakt-link"
                  :href="trakt.state.device?.verification_url"
                  target="_blank"
                  rel="noreferrer"
                >打开授权页 ↗</a>
                <span class="trakt-waiting">等待授权中…</span>
              </div>
            </div>
            <button class="trakt-btn trakt-btn--off" @click="trakt.cancelConnect">取消</button>
          </div>

          <!-- 未连接 -->
          <div v-else class="row">
            <div class="row__label">
              <h4>连接 Trakt 账号</h4>
              <p>连接后，用 mpv 播放会自动把进度同步到 Trakt、看完自动标记已看（其它外部播放器不支持自动同步）。后续还会支持想看列表 / 评分 / 推荐 / 历史。</p>
              <p v-if="trakt.state.error" class="trakt-err">{{ trakt.state.error }}</p>
            </div>
            <button class="trakt-btn" :disabled="!trakt.configured.value" @click="trakt.connect">
              {{ trakt.configured.value ? '连接 Trakt' : '未配置凭据' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section class="group">
        <h2 class="group__title"><Info :size="17" /> 关于</h2>
        <div class="card about">
          <img class="about__logo" :src="iconUrl" alt="NekoPlayer" />
          <div class="about__info">
            <h3>NekoPlayer <span>v{{ appVersion }}</span></h3>
            <p>跨平台媒体播放器 · 支持 Emby / Jellyfin / 本机 / WebDAV / SMB / DLNA</p>
            <p class="about__stack">Vue 3 · Vite · TypeScript · 由浮浮酱精心打造 ฅ'ω'ฅ</p>
            <a class="about__repo" href="https://github.com/L51xyz12138/nekoplayer" target="_blank" rel="noreferrer">
              <Github :size="15" /> github.com/L51xyz12138/nekoplayer
            </a>
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
  height: 100%;
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
  width: 62px;
  height: 62px;
  flex-shrink: 0;
  border-radius: 15px;
  box-shadow: 0 8px 22px rgba(111, 157, 255, 0.35);
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
.about__repo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  transition: color var(--dur) var(--ease);
}
.about__repo:hover {
  color: var(--accent-2);
}

.path-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.path-status {
  max-width: 280px;
  font-size: 12px;
  line-height: 1.4;
  text-align: right;
  color: #ffb454;
}
.path-status.ok {
  color: #46d17f;
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

/* Trakt 连接 */
.trakt-btn {
  flex-shrink: 0;
  height: 40px;
  padding: 0 22px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: var(--r-pill);
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.trakt-btn:hover {
  opacity: 0.9;
}
.trakt-btn:active {
  transform: scale(0.96);
}
.trakt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.trakt-btn--off {
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.trakt-pair {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 12px;
}
.trakt-code {
  padding: 8px 16px;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--accent);
  background: var(--bg-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  user-select: all;
}
.trakt-link {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--accent);
}
.trakt-link:hover {
  color: var(--accent-2);
}
.trakt-waiting {
  font-size: 13px;
  color: var(--text-mute);
}
.trakt-err {
  color: #ff6b6b !important;
}
</style>
