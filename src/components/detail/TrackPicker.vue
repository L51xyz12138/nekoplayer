<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, AudioLines, Captions } from 'lucide-vue-next'
import type { MediaTracks } from '@/types/media'

// 音轨/字幕预选（文件源 mpv 探测 / Emby·Jellyfin 读 MediaStreams）。
// 下拉选择，选中的轨道号传给 usePlayer → mpv --aid/--sid。默认=不指定，跟随设置语言偏好。
const props = defineProps<{ tracks: MediaTracks }>()
const aid = defineModel<number | undefined>('aid')
const sid = defineModel<number | 'no' | undefined>('sid')
// 选中的外挂字幕直链（Emby 外挂轨）；有值时播放走 --sub-file，sid 同时指到它（自带轨之后）
const subFile = defineModel<string | undefined>('subFile')

const LANGS: Record<string, string> = {
  jpn: '日语',
  jap: '日语',
  ja: '日语',
  eng: '英语',
  en: '英语',
  chi: '中文',
  zho: '中文',
  zh: '中文',
  chs: '简体中文',
  cht: '繁体中文',
  kor: '韩语',
  ko: '韩语',
  fre: '法语',
  fra: '法语',
  fr: '法语',
  ger: '德语',
  deu: '德语',
  de: '德语',
  spa: '西班牙语',
  es: '西班牙语',
  rus: '俄语',
  ru: '俄语',
  ita: '意大利语',
  it: '意大利语',
  por: '葡萄牙语',
  pt: '葡萄牙语',
  tha: '泰语',
  th: '泰语',
  vie: '越南语',
  vi: '越南语'
}
function langName(l: string): string {
  if (!l || l === 'und') return ''
  return LANGS[l.toLowerCase()] || l.toUpperCase()
}
function label(t: { lang: string; title: string; codec: string }, i: number, kind: 'audio' | 'sub'): string {
  const base = t.title || langName(t.lang) || `${kind === 'audio' ? '音轨' : '字幕'} ${i + 1}`
  // Emby 的 DisplayTitle 已含编码信息；仅在回退到语言名/序号时补编码
  if (t.title || !t.codec) return base
  return `${base} (${t.codec.toUpperCase()})`
}

// 外挂字幕（Emby 服务器端独立字幕流）
const extSubs = computed(() => props.tracks.ext ?? [])
function extLabel(e: { lang: string; title: string }): string {
  return (e.title || langName(e.lang) || '外挂字幕') + ' · 外挂'
}

// 单音轨无从选择 → 不显示音轨行；有内封或外挂字幕就显示字幕行（可关/切换）
const showAudio = computed(() => props.tracks.audio.length >= 2)
const showSub = computed(() => props.tracks.sub.length >= 1 || extSubs.value.length >= 1)

// <select> 值用字符串，映射回 number | 'no' | undefined（''=默认）
const audioSel = computed<string>({
  get: () => (aid.value === undefined ? '' : String(aid.value)),
  set: (v) => (aid.value = v === '' ? undefined : Number(v))
})
// 字幕值：''=默认 / 'no'=关 / 'N'=内封 sid / 'x:K'=外挂字幕（extSubs[K]）
const subSel = computed<string>({
  get: () => {
    if (sid.value === 'no') return 'no'
    if (subFile.value) {
      const k = extSubs.value.findIndex((e) => e.url === subFile.value)
      if (k >= 0) return 'x:' + k
    }
    return sid.value === undefined ? '' : String(sid.value)
  },
  set: (v) => {
    if (v.startsWith('x:')) {
      // 外挂字幕：加载它 + sid 指到「自带字幕数+1」（它排在自带轨之后）
      subFile.value = extSubs.value[Number(v.slice(2))]?.url
      sid.value = props.tracks.sub.length + 1
    } else {
      subFile.value = undefined
      sid.value = v === '' ? undefined : v === 'no' ? 'no' : Number(v)
    }
  }
})
</script>

<template>
  <section v-if="showAudio || showSub" class="tracks">
    <h2 class="tracks__title">音轨与字幕</h2>
    <div class="tracks__grid">
      <label v-if="showAudio" class="field">
        <span class="field__head"><AudioLines :size="15" /> 音轨</span>
        <div class="field__control">
          <select v-model="audioSel" class="field__select">
            <option value="">默认（跟随设置）</option>
            <option v-for="(t, i) in tracks.audio" :key="'a' + t.id" :value="String(t.id)">
              {{ label(t, i, 'audio') }}
            </option>
          </select>
          <ChevronDown :size="16" class="field__chevron" />
        </div>
      </label>
      <label v-if="showSub" class="field">
        <span class="field__head"><Captions :size="15" /> 字幕</span>
        <div class="field__control">
          <select v-model="subSel" class="field__select">
            <option value="">默认（跟随设置）</option>
            <option value="no">关闭字幕</option>
            <option v-for="(t, i) in tracks.sub" :key="'s' + t.id" :value="String(t.id)">
              {{ label(t, i, 'sub') }}
            </option>
            <option v-for="(e, k) in extSubs" :key="'x' + k" :value="'x:' + k">
              {{ extLabel(e) }}
            </option>
          </select>
          <ChevronDown :size="16" class="field__chevron" />
        </div>
      </label>
    </div>
    <p class="tracks__note">预选仅对 mpv / VLC / IINA 生效；PotPlayer / Infuse 请在其播放器内切换轨道</p>
  </section>
</template>

<style scoped>
.tracks {
  margin-bottom: 40px;
}
.tracks__title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 18px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
}
:root[data-scheme='light'] .tracks__title {
  text-shadow: 0 1px 4px rgba(255, 255, 255, 0.85);
}
.tracks__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}
.tracks__note {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-mute);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 15px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.field__head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
}
.field__control {
  position: relative;
}
.field__select {
  width: 100%;
  height: 40px;
  padding: 0 38px 0 14px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  appearance: none;
  cursor: pointer;
  text-overflow: ellipsis;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.field__select:hover {
  border-color: var(--border-strong);
}
.field__select:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
/* 下拉展开项由 Chromium 渲染，显式给主题色避免亮/暗错配 */
.field__select option {
  color: var(--text);
  background: var(--bg-1);
}
.field__chevron {
  position: absolute;
  right: 13px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--text-mute);
}
</style>
