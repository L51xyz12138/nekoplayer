<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Radio, Search, X, RotateCw, Play } from 'lucide-vue-next'
import { useIptv } from '@/composables/useIptv'
import { usePlayer } from '@/composables/usePlayer'
import type { IptvChannel } from '@/types/native'

const { iptvSources, channels, loading, loaded, loadChannels } = useIptv()
const player = usePlayer()
const query = ref('')
// 台标加载状态：ok=成功显示、failed=加载失败/空图（回退到彩色名字块）
const okLogos = ref<Set<string>>(new Set())
const failedLogos = ref<Set<string>>(new Set())

// 多个 IPTV 源 → 顶部 tab 切换；同名源用 URL 末段（/txt、/iptv）区分
const activeSource = ref('')
const tabLabel = (s: { name: string; url: string }) => {
  const dup = iptvSources.value.filter((x) => x.name === s.name).length > 1
  const tail = s.url.split(/[?#]/)[0].split('/').filter(Boolean).pop()
  return dup && tail ? `${s.name} · ${tail}` : s.name
}
// 当前选中源的频道；tab 未选或失效则回退第一个源
const current = computed(
  () => iptvSources.value.find((s) => s.id === activeSource.value) ?? iptvSources.value[0]
)
const allChannels = computed(() => current.value?.channels ?? [])
watch(
  iptvSources,
  (list) => {
    if (!list.some((s) => s.id === activeSource.value)) activeSource.value = list[0]?.id ?? ''
  },
  { immediate: true }
)

// 当前平台可用的外部播放器（仅 Electron）
const nn = window.nekoNative
const players: string[] = nn?.playMpv
  ? (
      {
        darwin: ['mpv', 'IINA', 'VLC', 'Infuse'],
        win32: ['mpv', 'PotPlayer', 'VLC'],
        linux: ['mpv', 'VLC']
      } as Record<string, string[]>
    )[nn.platform ?? 'darwin'] ?? []
  : []

onMounted(() => {
  if (!loaded.value) loadChannels()
})

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? allChannels.value.filter((c) => c.name.toLowerCase().includes(q)) : allChannels.value
})
// 按分组归类（保持出现顺序）
const groups = computed(() => {
  const map = new Map<string, IptvChannel[]>()
  for (const c of shown.value) {
    const g = c.group || '未分组'
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(c)
  }
  return [...map.entries()].map(([name, list]) => ({ name, list }))
})
// 只有一个分组（或全部未分组）→ 平铺、不显示分组标题
const flat = computed(() => groups.value.length <= 1)

// 点频道 → 打开弹窗选「源」+「播放器」（很多频道有多个源、播放器也可现选）
const active = ref<IptvChannel | null>(null)
const srcIndex = ref(0)
function openChannel(c: IptvChannel) {
  active.value = c
  srcIndex.value = 0
}
function closeChannel() {
  active.value = null
}
function playChannel(pl: string) {
  const c = active.value
  if (c) player.playLive(c.urls[srcIndex.value] || c.urls[0], c.name, pl)
  active.value = null
}
// 用主机名区分同频道的多个源
function srcHost(u: string): string {
  try {
    return new URL(u).host
  } catch {
    return u.slice(0, 28)
  }
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeChannel()
}
watch(active, (a) => {
  if (a) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

// 公共台标库（按频道名）：给 TXT（无台标字段）和境内不可达的内嵌台标兜底
function logoName(name: string): string {
  const n = name.replace(/^[◇★☆*•·\-\s]+/, '').trim()
  const cctv = n.match(/CCTV[-\s]?(\d{1,2})(\+|K)?/i)
  if (cctv) return `CCTV${cctv[1]}${(cctv[2] || '').toUpperCase()}` // CCTV1 / CCTV5+ / CCTV4K
  const ws = n.match(/[一-龥]{2,6}?卫视/)
  if (ws) return ws[0]
  return n
}
function cdnLogo(name: string): string {
  const n = logoName(name)
  return n ? `https://live.fanmingming.com/tv/${encodeURIComponent(n)}.png` : ''
}
// 台标解析：内嵌台标 → 公共台标库 → 都失败则彩色块（配合 img :key 换 src 时重载）
function logoSrc(c: IptvChannel): string {
  if (c.logo && !failedLogos.value.has(c.logo)) return c.logo
  const cdn = cdnLogo(c.name)
  if (cdn && !failedLogos.value.has(cdn)) return cdn
  return ''
}
// 台标只有真正加载成功（naturalWidth>0）才显示；否则回退到下一档 / 彩色名字块
const showLogo = (c: IptvChannel) => {
  const s = logoSrc(c)
  return !!s && okLogos.value.has(s)
}
function onLogoLoad(e: Event, url: string) {
  const img = e.target as HTMLImageElement
  if (!img.naturalWidth) onLogoErr(url) // 加载了但是空图 → 当失败
  else okLogos.value = new Set([...okLogos.value, url])
}
function onLogoErr(url: string) {
  failedLogos.value = new Set([...failedLogos.value, url])
}
// 无台标时按频道名生成稳定的渐变底色（像频道墙），避免一堆空图标
function tile(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `linear-gradient(140deg, hsl(${hue} 42% 32%), hsl(${(hue + 46) % 360} 38% 18%))`
}
</script>

<template>
  <div class="live">
    <header class="live__head">
      <h1 class="live__title"><Radio :size="24" /> 直播</h1>
      <div class="live__tools">
        <label class="live__search">
          <Search :size="16" />
          <input v-model="query" type="text" placeholder="搜索频道…" spellcheck="false" />
          <button v-if="query" class="live__clear" @click="query = ''"><X :size="14" /></button>
        </label>
        <button class="live__refresh" :disabled="loading" title="刷新频道" @click="loadChannels">
          <RotateCw :size="16" :class="{ spin: loading }" />
        </button>
      </div>
    </header>

    <!-- 多个 IPTV 源 → tab 切换 -->
    <div v-if="iptvSources.length > 1" class="live__tabs no-scrollbar">
      <button
        v-for="s in iptvSources"
        :key="s.id"
        class="live__tab"
        :class="{ on: activeSource === s.id }"
        @click="activeSource = s.id"
      >
        <Radio :size="15" />
        {{ tabLabel(s) }}
        <span class="live__tabn">{{ s.channels.length }}</span>
      </button>
    </div>

    <div v-if="loading && !channels.length" class="live__state">加载频道中…</div>
    <div v-else-if="!channels.length" class="live__state">
      <Radio :size="44" />
      <p>没有频道</p>
      <span>在「媒体源」添加 IPTV 直播源（M3U / TXT 清单地址或本地文件）后，频道会显示在这里</span>
    </div>
    <div v-else-if="!shown.length" class="live__state"><p>没搜到「{{ query }}」</p></div>

    <div v-else class="live__body">
      <section v-for="g in groups" :key="g.name" class="live__group">
        <h2 v-if="!flat" class="live__gtitle">{{ g.name }}<span>{{ g.list.length }}</span></h2>
        <div class="live__grid">
          <button v-for="(c, i) in g.list" :key="c.group + c.name + i" class="ch" :title="c.name" @click="openChannel(c)">
            <div
              class="ch__box"
              :class="{ 'is-logo': showLogo(c) }"
              :style="showLogo(c) ? undefined : { background: tile(c.name) }"
            >
              <img
                v-if="logoSrc(c)"
                :key="logoSrc(c)"
                class="ch__logo"
                :src="logoSrc(c)"
                :alt="c.name"
                loading="lazy"
                @load="onLogoLoad($event, logoSrc(c))"
                @error="onLogoErr(logoSrc(c))"
              />
              <span v-if="!showLogo(c)" class="ch__face">{{ c.name }}</span>
              <span v-if="c.urls.length > 1" class="ch__src">{{ c.urls.length }}源</span>
              <span class="ch__play"><Play :size="24" fill="currentColor" /></span>
            </div>
            <span class="ch__name">{{ c.name }}</span>
          </button>
        </div>
      </section>
    </div>

    <!-- 频道弹窗：选源（多源时）+ 选播放器 -->
    <transition name="dialog">
      <div v-if="active" class="mask" @click.self="closeChannel">
        <div class="ldlg">
          <button class="ldlg__x" title="关闭" @click="closeChannel"><X :size="18" /></button>
          <div class="ldlg__head">
            <div
              class="ldlg__logo"
              :class="{ 'is-logo': showLogo(active) }"
              :style="showLogo(active) ? undefined : { background: tile(active.name) }"
            >
              <img v-if="showLogo(active)" :src="logoSrc(active)" :alt="active.name" />
              <Radio v-else :size="22" />
            </div>
            <h2 class="ldlg__name">{{ active.name }}</h2>
          </div>

          <template v-if="active.urls.length > 1">
            <div class="ldlg__label">选择源（{{ active.urls.length }} 个）</div>
            <div class="ldlg__srcs">
              <button
                v-for="(u, idx) in active.urls"
                :key="idx"
                class="ldlg__src"
                :class="{ on: srcIndex === idx }"
                @click="srcIndex = idx"
              >
                <span class="ldlg__srcn">源 {{ idx + 1 }}</span>
                <span class="ldlg__srch">{{ srcHost(u) }}</span>
              </button>
            </div>
          </template>

          <div class="ldlg__label">用播放器打开</div>
          <div class="ldlg__players">
            <button v-for="p in players" :key="p" class="ldlg__player" @click="playChannel(p)">
              <Play :size="15" fill="currentColor" /> {{ p }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.live {
  height: 100%;
  overflow-y: auto;
  padding: 26px 34px 50px;
}
.live__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.live__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 26px;
  font-weight: 800;
}
.live__tools {
  display: flex;
  align-items: center;
  gap: 10px;
}
.live__search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 240px;
  height: 40px;
  padding: 0 12px;
  color: var(--text-mute);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.live__search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-size: 13.5px;
  color: var(--text);
}
.live__clear {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: var(--text-mute);
}
.live__clear:hover {
  color: var(--text);
  background: var(--surface-hover);
}
.live__refresh {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
}
.live__refresh:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.live__tabs {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 0 18px;
  scroll-behavior: smooth;
}
.live__tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 15px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.live__tab:hover {
  color: #fff;
  background: var(--surface-2);
}
.live__tab.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.live__tabn {
  font-size: 11px;
  font-weight: 700;
  padding: 0 6px;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.16);
}
.live__tab.on .live__tabn {
  background: rgba(255, 255, 255, 0.22);
}

.live__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 80px 20px;
  text-align: center;
  color: var(--text-mute);
}
.live__state p {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-dim);
}
.live__state span {
  max-width: 400px;
  font-size: 13px;
}

.live__group {
  margin-bottom: 26px;
}
/* 分组标题吸顶：滚动长清单时始终知道自己在哪个分组（渐变底避免硬边切掉卡片） */
.live__gtitle {
  position: sticky;
  top: -26px;
  z-index: 5;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: -6px -8px 12px;
  padding: 8px 8px 10px;
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(180deg, var(--bg-1) 72%, transparent);
}
.live__gtitle span {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-mute);
}
.live__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px 14px;
}
.ch {
  cursor: pointer;
}
/* 台标 tile：固定浅色底（台标多为深色素描设计在白/透明底上，深色主题下也保持浅色才不发灰） */
.ch__box {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: var(--r-md);
  background: linear-gradient(165deg, #ffffff, #eef0f4);
  border: 1px solid var(--border);
  overflow: hidden;
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}
.ch:hover .ch__box {
  border-color: var(--accent);
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
}
.ch__logo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 16px 18px;
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.ch__box.is-logo .ch__logo {
  opacity: 1;
}
/* 无台标：频道名居中当「文字台标」，铺在彩色渐变块上 */
.ch__face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 8px 10px;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.25;
  text-align: center;
  color: #fff;
  letter-spacing: 0.01em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
/* 频道名外置在 tile 下方（不再压台标），单行省略 */
.ch__name {
  display: block;
  margin-top: 8px;
  padding: 0 2px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-dim);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color var(--dur) var(--ease);
}
.ch:hover .ch__name {
  color: var(--text);
}
.ch__play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.42);
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.ch:hover .ch__play {
  opacity: 1;
}
.ch__src {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 1px 6px;
  font-size: 10.5px;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border-radius: var(--r-pill);
}

/* ---- 频道弹窗（选源 + 选播放器）---- */
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 5, 8, 0.62);
  backdrop-filter: blur(6px);
}
.ldlg {
  position: relative;
  width: 100%;
  max-width: 440px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 26px 24px 22px;
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--border-strong);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-pop);
}
.ldlg__x {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: var(--text-mute);
}
.ldlg__x:hover {
  color: var(--text);
  background: var(--surface-hover);
}
.ldlg__head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding-right: 32px;
}
.ldlg__logo {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 64px;
  height: 40px;
  border-radius: var(--r-sm);
  overflow: hidden;
  color: #fff;
}
.ldlg__logo.is-logo {
  background: linear-gradient(165deg, #ffffff, #eef0f4);
  border: 1px solid var(--border);
}
.ldlg__logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 5px;
}
.ldlg__name {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}
.ldlg__label {
  margin-bottom: 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-mute);
}
.ldlg__srcs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}
.ldlg__src {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 14px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ldlg__src:hover {
  background: var(--surface-2);
}
.ldlg__src.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.ldlg__srcn {
  flex-shrink: 0;
  font-size: 13.5px;
  font-weight: 650;
  color: var(--text);
}
.ldlg__srch {
  min-width: 0;
  font-size: 12px;
  color: var(--text-mute);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ldlg__players {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.ldlg__player {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  font-size: 13.5px;
  font-weight: 650;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: var(--r-pill);
  box-shadow: 0 6px 16px var(--accent-glow);
  transition: transform var(--dur) var(--ease);
}
.ldlg__player:active {
  transform: scale(0.96);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.22s var(--ease);
}
.dialog-enter-active .ldlg,
.dialog-leave-active .ldlg {
  transition: transform 0.22s var(--ease);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .ldlg,
.dialog-leave-to .ldlg {
  transform: translateY(16px) scale(0.98);
}
</style>
