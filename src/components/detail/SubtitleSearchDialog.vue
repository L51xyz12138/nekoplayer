<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X, Search, Download, Check } from 'lucide-vue-next'
import { searchSubs, resolveDownload, type AssrtSub } from '@/api/assrt'
import type { Episode, MediaItem } from '@/types/media'

const props = defineProps<{ open: boolean; item: MediaItem | null; episode?: Episode | null }>()
const emit = defineEmits<{ close: []; add: [payload: { path: string; name: string }] }>()

const query = ref('')
const results = ref<AssrtSub[]>([])
const searching = ref(false)
const msg = ref('')
const busyId = ref(0) // 正在下载的字幕 id
const doneIds = ref<Set<number>>(new Set()) // 已成功添加的字幕 id

// 搜索目标标签（剧集聚焦某集时带上集号，便于用户判断）
const target = computed(() => {
  const it = props.item
  if (!it) return ''
  const ep = props.episode
  return ep ? `${it.title} · S${ep.season}E${ep.episode}` : it.title
})

watch(
  () => props.open,
  (o) => {
    if (!o || !props.item) return
    query.value = props.item.title
    results.value = []
    msg.value = ''
    busyId.value = 0
    doneIds.value = new Set()
    void run() // 打开即按片名搜一次
  }
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(
  () => props.open,
  (o) => (o ? document.addEventListener('keydown', onKeydown) : document.removeEventListener('keydown', onKeydown))
)

async function run() {
  const q = query.value.trim()
  if (q.length < 3) {
    msg.value = '关键词至少 3 个字符'
    return
  }
  searching.value = true
  msg.value = ''
  results.value = []
  try {
    const list = await searchSubs(q)
    results.value = list
    msg.value = list.length ? '' : '没搜到字幕——换个更准确的片名（可加年份），或检查 assrt token 与网络'
  } catch {
    msg.value = '搜索失败——请稍后重试（assrt 限 20 次/分）'
  } finally {
    searching.value = false
  }
}

async function download(sub: AssrtSub) {
  if (busyId.value || doneIds.value.has(sub.id)) return
  busyId.value = sub.id
  msg.value = ''
  try {
    const dl = await resolveDownload(sub.id)
    if (!dl) {
      msg.value = '该字幕无可用的文本文件，换一条试试'
      return
    }
    const r = await window.nekoNative?.downloadSub(dl.url, dl.filename)
    if (r?.path) {
      doneIds.value = new Set([...doneIds.value, sub.id])
      emit('add', { path: r.path, name: sub.name })
    } else {
      msg.value = r?.error || '下载失败，换一条试试'
    }
  } finally {
    busyId.value = 0
  }
}
</script>

<template>
  <transition name="dialog">
    <div v-if="open && item" class="mask">
      <div class="dialog">
        <header class="dialog__head">
          <div class="dialog__head-txt">
            <h2>在线字幕</h2>
            <span class="dialog__sub" :title="target">{{ target }}</span>
          </div>
          <button class="dialog__x" @click="emit('close')"><X :size="18" /></button>
        </header>

        <div class="dialog__search">
          <input
            v-model="query"
            type="text"
            placeholder="输入片名搜索字幕（可加年份）"
            spellcheck="false"
            @keyup.enter="run"
          />
          <button class="go" :disabled="searching" @click="run">
            <Search :size="15" /> {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>

        <div class="dialog__body no-scrollbar">
          <p v-if="msg" class="subs__msg">{{ msg }}</p>
          <div v-if="results.length" class="subs">
            <div v-for="s in results" :key="s.id" class="sub">
              <div class="sub__info">
                <span class="sub__name" :title="s.name">{{ s.name }}</span>
                <span class="sub__meta">
                  <span v-if="s.lang" class="sub__tag">{{ s.lang }}</span>
                  <span v-if="s.subtype">{{ s.subtype }}</span>
                  <span v-if="s.site">· {{ s.site }}</span>
                  <span v-if="s.score" class="sub__score">★ {{ s.score }}</span>
                </span>
              </div>
              <button
                class="dl"
                :class="{ 'dl--done': doneIds.has(s.id) }"
                :disabled="!!busyId || doneIds.has(s.id)"
                @click="download(s)"
              >
                <template v-if="doneIds.has(s.id)"><Check :size="15" /> 已添加</template>
                <template v-else-if="busyId === s.id">下载中…</template>
                <template v-else><Download :size="15" /> 下载</template>
              </button>
            </div>
          </div>
          <p v-else-if="!searching && !msg" class="subs__hint">按上方搜索框查找字幕</p>
        </div>

        <footer class="dialog__foot">
          <span class="foot__note">
            字幕服务由 <a class="foot__link" href="https://assrt.net" target="_blank" rel="noreferrer">assrt.net</a> 提供 · 下载后自动挂载（仅 mpv）
          </span>
          <button class="btn btn--ghost" @click="emit('close')">完成</button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 5, 8, 0.62);
  backdrop-filter: blur(6px);
}
.dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 620px;
  max-height: 84vh;
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--border-strong);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}
.dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border);
}
.dialog__head-txt {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.dialog__head h2 {
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 0;
}
.dialog__sub {
  font-size: 12.5px;
  color: var(--text-mute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dialog__x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--text-dim);
  flex-shrink: 0;
  transition: background var(--dur), color var(--dur);
}
.dialog__x:hover {
  color: var(--text);
  background: var(--surface-hover);
}
.dialog__search {
  display: flex;
  gap: 8px;
  padding: 16px 24px 4px;
}
.dialog__search input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  font-size: 13.5px;
  color: var(--text);
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  outline: none;
  transition: border-color var(--dur) var(--ease);
}
.dialog__search input:focus {
  border-color: var(--accent);
}
.go {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: var(--r-md);
  transition: opacity var(--dur);
}
.go:disabled {
  opacity: 0.6;
}
.dialog__body {
  padding: 12px 24px 20px;
  overflow-y: auto;
  min-height: 120px;
}
.subs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sub {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.sub__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.sub__name {
  font-size: 13.5px;
  font-weight: 620;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-mute);
  flex-wrap: wrap;
}
.sub__tag {
  padding: 1px 7px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: var(--r-pill);
  font-weight: 600;
}
.sub__score {
  color: var(--text-dim);
}
.dl {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 14px;
  height: 34px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: color var(--dur), border-color var(--dur);
}
.dl:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--border-strong);
}
.dl:disabled {
  cursor: default;
}
.dl--done {
  color: var(--ok, #4ade80);
  opacity: 0.85;
}
.subs__msg,
.subs__hint {
  font-size: 12.5px;
  color: var(--text-dim);
  padding: 8px 2px;
}
.subs__hint {
  color: var(--text-mute);
  text-align: center;
  padding-top: 32px;
}
.dialog__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 24px;
  border-top: 1px solid var(--border);
}
.foot__note {
  font-size: 12px;
  color: var(--text-mute);
}
.foot__link {
  color: var(--accent);
  font-weight: 600;
}
.foot__link:hover {
  text-decoration: underline;
}
.btn {
  height: 40px;
  padding: 0 22px;
  font-size: 14px;
  font-weight: 650;
  border-radius: var(--r-pill);
  transition: transform var(--dur), background var(--dur);
}
.btn:active {
  transform: scale(0.96);
}
.btn--ghost {
  color: var(--text-dim);
  border: 1px solid var(--border);
}
.btn--ghost:hover {
  color: var(--text);
  background: var(--surface);
}
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.22s var(--ease);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
