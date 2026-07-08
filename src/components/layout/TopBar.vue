<script setup lang="ts">
import { Search, ChevronDown, X } from 'lucide-vue-next'
import { ref } from 'vue'
import FilterMenu from '@/components/library/FilterMenu.vue'
import type { LibraryCategory, SortMode } from '@/types/media'

defineProps<{
  query: string
  category: LibraryCategory
  sort: SortMode
  counts: Record<LibraryCategory, number>
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'update:category': [value: LibraryCategory]
  'update:sort': [value: SortMode]
}>()

const categories: { key: LibraryCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'movie', label: '电影' },
  { key: 'series', label: '剧集' },
  { key: 'favorite', label: '收藏' }
]

const sorts: { key: SortMode; label: string }[] = [
  { key: 'recent', label: '最近添加' },
  { key: 'title', label: '名称' },
  { key: 'rating', label: '评分' },
  { key: 'year', label: '年份' }
]

const sortOpen = ref(false)

function pickSort(mode: SortMode) {
  emit('update:sort', mode)
  sortOpen.value = false
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__tabs">
      <button
        v-for="c in categories"
        :key="c.key"
        class="tab"
        :class="{ 'is-active': category === c.key }"
        @click="emit('update:category', c.key)"
      >
        {{ c.label }}
        <span class="tab__count">{{ counts[c.key] }}</span>
      </button>
    </div>

    <div class="topbar__right">
      <label class="search">
        <Search :size="17" class="search__icon" />
        <input
          :value="query"
          type="text"
          placeholder="搜索影片、剧集…"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="query"
          type="button"
          class="search__clear"
          title="清除"
          @click="emit('update:query', '')"
        >
          <X :size="15" />
        </button>
      </label>

      <FilterMenu />

      <div class="sort" @click.stop="sortOpen = !sortOpen">
        <div
          v-if="sortOpen"
          class="sort__backdrop"
          style="position: fixed; inset: 0; z-index: 10"
          @click.stop="sortOpen = false"
        />
        <span class="sort__label">{{ sorts.find((s) => s.key === sort)?.label }}</span>
        <ChevronDown :size="16" :class="{ 'is-open': sortOpen }" />
        <transition name="fade">
          <ul v-if="sortOpen" class="sort__menu" @click.stop>
            <li
              v-for="s in sorts"
              :key="s.key"
              class="sort__opt"
              :class="{ 'is-active': sort === s.key }"
              @click="pickSort(s.key)"
            >
              {{ s.label }}
            </li>
          </ul>
        </transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 6px 2px 18px;
}

.topbar__tabs {
  display: flex;
  gap: 6px;
  padding: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-dim);
  border-radius: var(--r-pill);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.tab:hover {
  color: var(--text);
}
.tab.is-active {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 8px 20px var(--accent-glow);
}
.tab__count {
  font-size: 11.5px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.22);
  color: inherit;
}
.tab:not(.is-active) .tab__count {
  background: var(--surface-2);
  color: var(--text-mute);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 260px;
  padding: 0 14px;
  height: 42px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.search:focus-within {
  border-color: var(--accent);
  background: var(--surface-2);
}
.search__icon {
  color: var(--text-mute);
  flex-shrink: 0;
}
.search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-size: 14px;
}
.search input::placeholder {
  color: var(--text-mute);
}
.search__clear {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  color: var(--text-mute);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.search__clear:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.sort {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 42px;
  padding: 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  cursor: pointer;
  user-select: none;
  transition: border-color var(--dur) var(--ease);
}
.sort:hover {
  border-color: var(--border-strong);
}
.sort svg {
  transition: transform var(--dur) var(--ease);
}
.sort svg.is-open {
  transform: rotate(180deg);
}
.sort__menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  min-width: 150px;
  padding: 6px;
  background: rgba(20, 22, 30, 0.86);
  backdrop-filter: var(--blur);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
}
.sort__opt {
  padding: 9px 12px;
  border-radius: var(--r-sm);
  font-size: 13.5px;
  color: var(--text-dim);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.sort__opt:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.sort__opt.is-active {
  color: var(--accent);
}
</style>
