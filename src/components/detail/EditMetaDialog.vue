<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { X, Wand2 } from 'lucide-vue-next'
import PosterImage from '@/components/common/PosterImage.vue'
import { useLibrary } from '@/composables/useLibrary'
import type { MediaItem, Person } from '@/types/media'
import type { TmdbCandidate, TmdbSeason } from '@/api/tmdb'

const props = defineProps<{ open: boolean; item: MediaItem | null }>()
const emit = defineEmits<{ close: []; save: [data: Partial<MediaItem>]; reset: [] }>()

const { searchByName, scrapeCandidate, loadTvSeasons } = useLibrary()

const form = reactive({ title: '', year: '' as string | number, overview: '', posterUrl: '' })
const isTv = ref(false)
// 「重新匹配」额外拿到的字段，保存时一并写入
const extra = reactive<Partial<MediaItem>>({})
const matching = ref(false)
const matchMsg = ref('')
// 多个匹配时的候选项，让用户挑正确的那个
const candidates = ref<TmdbCandidate[]>([])
// 匹配到多季剧集时的季列表，让用户挑对应的季（用季海报/简介）
const seasons = ref<TmdbSeason[]>([])
const pickedSeason = ref<number | null>(null)

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
    candidates.value = []
    seasons.value = []
    pickedSeason.value = null
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
  candidates.value = []
  seasons.value = []
  pickedSeason.value = null
  try {
    const list = await searchByName(q, isTv.value)
    if (!list.length) {
      matchMsg.value = '没匹配到——换个更准确的名字，或确认设置里填了 TMDB Key'
    } else if (list.length === 1) {
      await applyCandidate(list[0]) // 只有一个结果直接用
    } else {
      candidates.value = list // 多个结果让用户选
      matchMsg.value = `找到 ${list.length} 个匹配，点选正确的那个：`
    }
  } finally {
    matching.value = false
  }
}

// 选中某个候选项 → 拉完整元数据填进表单
async function applyCandidate(cand: TmdbCandidate) {
  matching.value = true
  try {
    const r = await scrapeCandidate(cand)
    if (r) {
      form.title = r.title
      form.year = r.year || form.year
      form.overview = r.overview || form.overview
      form.posterUrl = r.posterUrl || form.posterUrl
      isTv.value = r.type === 'series'
      extra.genres = r.genres
      extra.cast = r.cast as Person[]
      extra.backdropUrl = r.backdropUrl
      extra.rating = r.rating
      extra.tagline = r.tagline
      extra.tmdbId = r.tmdbId // 存 TMDB id，剧集据此补每集真实集名
      matchMsg.value = `已选「${r.title}」${r.year ? ` (${r.year})` : ''}，点保存生效`
    }
    candidates.value = []
    // 剧集多季 → 让用户挑对应的季（用季海报/简介）
    seasons.value = []
    pickedSeason.value = null
    if (cand.mediaType === 'tv') {
      const ss = await loadTvSeasons(cand.id)
      if (ss.length > 1) {
        seasons.value = ss
        matchMsg.value = `已选「${cand.title}」，这部剧有 ${ss.length} 季，可选对应的季：`
      }
    }
  } finally {
    matching.value = false
  }
}

// 选中某一季 → 用该季的海报/简介/年份细化（剧名保持不变）
function applySeason(s: TmdbSeason) {
  pickedSeason.value = s.seasonNumber
  if (s.posterUrl) form.posterUrl = s.posterUrl
  if (s.overview) form.overview = s.overview
  if (s.year) form.year = s.year
  matchMsg.value = `已选「${s.name}」，点保存生效`
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

          <!-- 多个匹配项：点选正确的那个 -->
          <div v-if="candidates.length" class="cands">
            <button
              v-for="c in candidates"
              :key="c.mediaType + c.id"
              class="cand"
              :disabled="matching"
              @click="applyCandidate(c)"
            >
              <div class="cand__poster">
                <PosterImage :seed="String(c.id)" :title="c.title" :src="c.posterUrl" kind="poster" />
              </div>
              <div class="cand__info">
                <span class="cand__title">{{ c.title }}</span>
                <span class="cand__meta">
                  {{ c.mediaType === 'tv' ? '剧集' : '电影' }}{{ c.year ? ` · ${c.year}` : '' }}{{ c.rating ? ` · ★ ${c.rating}` : '' }}
                </span>
                <span v-if="c.overview" class="cand__ov">{{ c.overview }}</span>
              </div>
            </button>
          </div>

          <!-- 多季剧集：挑对应的季（用该季海报/简介） -->
          <div v-if="seasons.length" class="cands">
            <button
              v-for="s in seasons"
              :key="s.seasonNumber"
              class="cand"
              :class="{ 'cand--on': pickedSeason === s.seasonNumber }"
              :disabled="matching"
              @click="applySeason(s)"
            >
              <div class="cand__poster">
                <PosterImage :seed="'s' + s.seasonNumber" :title="s.name" :src="s.posterUrl" kind="poster" />
              </div>
              <div class="cand__info">
                <span class="cand__title">{{ s.name }}</span>
                <span class="cand__meta">
                  {{ s.episodeCount ? `${s.episodeCount} 集` : '' }}{{ s.year ? ` · ${s.year}` : '' }}
                </span>
                <span v-if="s.overview" class="cand__ov">{{ s.overview }}</span>
              </div>
            </button>
          </div>
        </div>

        <footer class="dialog__foot">
          <button class="btn btn--text" title="清除手动修改，恢复自动刮削" @click="emit('reset'), emit('close')">
            重置为自动
          </button>
          <div class="dialog__foot-right">
            <button class="btn btn--ghost" @click="emit('close')">取消</button>
            <button class="btn btn--primary" @click="save">保存</button>
          </div>
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
  max-width: 700px;
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
  width: 210px;
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

.cands {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.cand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.cand:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--surface-2);
}
.cand--on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.cand:disabled {
  opacity: 0.6;
}
.cand__poster {
  flex-shrink: 0;
  width: 42px;
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-2);
}
.cand__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cand__title {
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cand__meta {
  font-size: 12px;
  color: var(--text-mute);
}
.cand__ov {
  font-size: 12px;
  color: var(--text-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dialog__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}
.dialog__foot-right {
  display: flex;
  gap: 12px;
}
.btn--text {
  height: 42px;
  padding: 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-mute);
}
.btn--text:hover {
  color: var(--text-dim);
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
