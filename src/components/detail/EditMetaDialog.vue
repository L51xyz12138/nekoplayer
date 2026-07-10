<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { X, Wand2 } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import { useLibrary } from '@/composables/useLibrary'
import type { MediaItem, Person } from '@/types/media'

const props = defineProps<{ open: boolean; item: MediaItem | null }>()
const emit = defineEmits<{ close: []; save: [data: Partial<MediaItem>] }>()

const { scrapeByName } = useLibrary()

const form = reactive({ title: '', year: '' as string | number, overview: '', posterUrl: '' })
const isTv = ref(false)
// 「重新匹配」额外拿到的字段，保存时一并写入
const extra = reactive<Partial<MediaItem>>({})
const matching = ref(false)
const matchMsg = ref('')

watch(
  () => props.open,
  (o) => {
    if (!o || !props.item) return
    form.title = props.item.title
    form.year = props.item.year || ''
    form.overview = props.item.overview || ''
    form.posterUrl = props.item.posterUrl || ''
    isTv.value = props.item.type === 'series'
    matchMsg.value = ''
    ;(Object.keys(extra) as (keyof MediaItem)[]).forEach((k) => delete extra[k])
  }
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(
  () => props.open,
  (o) => (o ? document.addEventListener('keydown', onKeydown) : document.removeEventListener('keydown', onKeydown))
)

async function rematch() {
  const q = form.title.trim()
  if (!q) return
  matching.value = true
  matchMsg.value = ''
  try {
    const r = await scrapeByName(q, isTv.value)
    if (r) {
      form.title = r.title
      form.year = r.year || form.year
      form.overview = r.overview || form.overview
      form.posterUrl = r.posterUrl || form.posterUrl
      extra.genres = r.genres
      extra.cast = r.cast as Person[]
      extra.backdropUrl = r.backdropUrl
      extra.rating = r.rating
      extra.tagline = r.tagline
      matchMsg.value = `已匹配到「${r.title}」${r.year ? ` (${r.year})` : ''}，点保存生效`
    } else {
      matchMsg.value = '没匹配到——换个更准确的名字，或确认设置里填了 TMDB Key'
    }
  } finally {
    matching.value = false
  }
}

function save() {
  emit('save', {
    title: form.title.trim() || props.item?.title,
    year: Number(form.year) || 0,
    overview: form.overview,
    posterUrl: form.posterUrl.trim() || undefined,
    ...extra
  })
  emit('close')
}
</script>

<template>
  <transition name="dialog">
    <div v-if="open && item" class="mask">
      <div class="dialog">
        <header class="dialog__head">
          <h2>编辑元数据</h2>
          <button class="dialog__x" @click="emit('close')"><X :size="18" /></button>
        </header>

        <div class="dialog__body no-scrollbar">
          <div class="edit">
            <div class="edit__poster">
              <PosterImage :seed="item.id" :title="form.title" :src="form.posterUrl" kind="poster" />
            </div>
            <div class="edit__fields">
              <label class="field">
                <span class="field-label">名称</span>
                <div class="field__row">
                  <input v-model="form.title" type="text" placeholder="片名 / 剧名" />
                  <button class="rematch" :disabled="matching" title="用此名去 TMDB 重新匹配" @click="rematch">
                    <Wand2 :size="15" /> {{ matching ? '匹配中…' : '重新匹配' }}
                  </button>
                </div>
              </label>

              <div class="field field--inline">
                <label class="field__half">
                  <span class="field-label">年份</span>
                  <input v-model="form.year" type="number" placeholder="如 2020" />
                </label>
                <div class="field__half">
                  <span class="field-label">匹配为</span>
                  <div class="seg">
                    <button :class="{ on: !isTv }" @click="isTv = false">电影</button>
                    <button :class="{ on: isTv }" @click="isTv = true">剧集</button>
                  </div>
                </div>
              </div>

              <label class="field">
                <span class="field-label">海报地址（URL）</span>
                <input v-model="form.posterUrl" type="text" placeholder="https://…（重新匹配会自动填）" spellcheck="false" />
              </label>

              <label class="field">
                <span class="field-label">简介</span>
                <textarea v-model="form.overview" rows="4" placeholder="剧情简介" />
              </label>

              <p v-if="matchMsg" class="edit__msg">{{ matchMsg }}</p>
            </div>
          </div>
        </div>

        <footer class="dialog__foot">
          <button class="btn btn--ghost" @click="emit('close')">取消</button>
          <button class="btn btn--primary" @click="save">保存</button>
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
  max-width: 560px;
  max-height: 86vh;
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
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}
.dialog__head h2 {
  font-size: 18px;
  font-weight: 700;
}
.dialog__x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--text-dim);
  transition: background var(--dur), color var(--dur);
}
.dialog__x:hover {
  color: var(--text);
  background: var(--surface-hover);
}
.dialog__body {
  padding: 22px 24px;
  overflow-y: auto;
}

.edit {
  display: flex;
  gap: 18px;
}
.edit__poster {
  flex-shrink: 0;
  width: 132px;
  aspect-ratio: 2 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg-2);
}
.edit__fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field {
  display: block;
}
.field-label {
  display: block;
  margin-bottom: 7px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-dim);
}
.field input,
.field textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 13.5px;
  color: var(--text);
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  outline: none;
  transition: border-color var(--dur) var(--ease);
}
.field input:focus,
.field textarea:focus {
  border-color: var(--accent);
}
.field textarea {
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}
.field__row {
  display: flex;
  gap: 8px;
}
.field__row input {
  flex: 1;
  min-width: 0;
}
.rematch {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: color var(--dur), border-color var(--dur);
}
.rematch:hover {
  color: var(--accent);
  border-color: var(--border-strong);
}
.rematch:disabled {
  opacity: 0.6;
  cursor: default;
}
.field--inline {
  display: flex;
  gap: 12px;
}
.field__half {
  flex: 1;
}
.seg {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.seg button {
  flex: 1;
  padding: 7px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  border-radius: calc(var(--r-md) - 3px);
}
.seg button.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.edit__msg {
  font-size: 12.5px;
  color: var(--text-dim);
}

.dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}
.btn {
  height: 42px;
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
.btn--primary {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 8px 22px var(--accent-glow);
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
