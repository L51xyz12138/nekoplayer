<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { Bookmark, Library, Star, ChevronDown } from 'lucide-vue-next'
import { useTrakt } from '@/composables/useTrakt'
import type { MediaItem } from '@/types/media'

const props = defineProps<{ item: MediaItem }>()
const trakt = useTrakt()

// 仅在：已连接 Trakt + 有 tmdbId + 非合集 时出现
const show = computed(
  () => trakt.connected.value && !!props.item.tmdbId && props.item.type !== 'collection'
)

// 首次用到时拉一次想看/收藏/评分状态（内部有 loaded 去重）
onMounted(() => {
  if (show.value) void trakt.loadStatus()
})
watch(show, (v) => {
  if (v) void trakt.loadStatus()
})

const inWl = computed(() => trakt.inWatchlist(props.item))
const inCol = computed(() => trakt.inCollection(props.item))
const rating = computed(() => trakt.ratingOf(props.item))

// <select> 用字符串；''=未评分
const ratingSel = computed<string>({
  get: () => (rating.value ? String(rating.value) : ''),
  set: (v) => void trakt.rate(props.item, v === '' ? 0 : Number(v))
})
</script>

<template>
  <section v-if="show" class="ta">
    <h2 class="ta__title">Trakt</h2>
    <div class="ta__row">
      <button class="ta__btn" :class="{ on: inWl }" @click="trakt.toggleWatchlist(item)">
        <Bookmark :size="16" :fill="inWl ? 'currentColor' : 'none'" />
        {{ inWl ? '已加入想看' : '加入想看' }}
      </button>
      <button class="ta__btn" :class="{ on: inCol }" @click="trakt.toggleCollection(item)">
        <Library :size="16" />
        {{ inCol ? '已收藏' : '收藏' }}
      </button>
      <label class="ta__rate" :class="{ on: !!rating }">
        <Star :size="16" :fill="rating ? 'currentColor' : 'none'" />
        <select v-model="ratingSel" class="ta__select">
          <option value="">未评分</option>
          <option v-for="n in 10" :key="n" :value="String(11 - n)">{{ 11 - n }} 分</option>
        </select>
        <ChevronDown :size="15" class="ta__chevron" />
      </label>
    </div>
  </section>
</template>

<style scoped>
.ta {
  margin-bottom: 40px;
}
.ta__title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}
.ta__row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.ta__btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  transition: color var(--dur), background var(--dur), border-color var(--dur);
}
.ta__btn:hover {
  background: var(--surface-hover);
  border-color: var(--border-strong);
}
.ta__btn.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.ta__rate {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 14px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.ta__rate.on {
  color: #ffce53;
}
.ta__select {
  height: 100%;
  padding-right: 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: transparent;
  border: none;
  outline: none;
  appearance: none;
  cursor: pointer;
}
.ta__select option {
  color: var(--text);
  background: var(--bg-1);
}
.ta__chevron {
  position: absolute;
  right: 12px;
  pointer-events: none;
  color: var(--text-mute);
}
</style>
