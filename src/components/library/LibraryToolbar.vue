<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import {
  Layers,
  Server,
  HardDrive,
  Cloud,
  Network,
  Cast,
  ChevronDown,
  Search,
  X
} from 'lucide-vue-next'
import FilterMenu from '@/components/library/FilterMenu.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useSources } from '@/composables/useSources'
import { sourceKindMeta } from '@/data/sourceKinds'
import type { SourceKind } from '@/types/source'
import type { LibraryCategory, SortMode } from '@/types/media'

// 单行磨砂工具栏：源切换 + 服务器分类 + 类型筹码 + 搜索 + 筛选 + 排序
// （原来的 SourceTabs / LibraryTabs / TopBar 三行胶囊合并而来，全部状态直接取 composables）
const { enabledSources } = useSources()
// 只显示启用的影视源（停用的不进媒体库；IPTV 是直播源、不进影视库）
const libSources = computed(() => enabledSources.value.filter((s) => s.kind !== 'iptv'))

const {
  libraries,
  activeLibraryId,
  setActiveLibrary,
  activeSourceId,
  setActiveSource,
  query,
  category,
  sort,
  counts,
  setQuery,
  setCategory,
  setSort
} = useLibrary()

const kindIcon: Partial<Record<SourceKind, Component>> = {
  local: HardDrive,
  webdav: Cloud,
  smb: Network,
  dlna: Cast
}
function iconFor(kind: SourceKind): Component {
  return kindIcon[kind] ?? Server
}
function accentFor(kind: SourceKind): string {
  return sourceKindMeta(kind).accent
}
function labelFor(kind: SourceKind): string {
  return sourceKindMeta(kind).label
}

// 当前源 / 当前分类的按钮回显
const activeSource = computed(() => libSources.value.find((s) => s.id === activeSourceId.value))
const activeLibrary = computed(() => libraries.value.find((l) => l.id === activeLibraryId.value))

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

// 同时只开一个下拉；点遮罩或选中后关闭
const openMenu = ref<'' | 'src' | 'lib' | 'sort'>('')
function toggle(menu: 'src' | 'lib' | 'sort') {
  openMenu.value = openMenu.value === menu ? '' : menu
}
function pickSource(id: string) {
  setActiveSource(id)
  openMenu.value = ''
}
function pickLibrary(id: string) {
  setActiveLibrary(id)
  openMenu.value = ''
}
function pickSort(mode: SortMode) {
  setSort(mode)
  openMenu.value = ''
}
</script>

<template>
  <div class="ltoolbar">
    <!-- 源切换：当前源回显 + 下拉选择 -->
    <div class="ltoolbar__dd">
      <button class="ltool ltool--src" @click.stop="toggle('src')">
        <template v-if="activeSource">
          <component :is="iconFor(activeSource.kind)" :size="15" />
          <span class="ltool__name">{{ activeSource.name }}</span>
          <span class="ltool__kind">{{ labelFor(activeSource.kind) }}</span>
        </template>
        <template v-else>
          <Layers :size="15" />
          <span class="ltool__name">全部资料库</span>
        </template>
        <ChevronDown :size="14" class="ltool__chev" :class="{ 'is-open': openMenu === 'src' }" />
      </button>
      <div v-if="openMenu === 'src'" class="ltoolbar__backdrop" @click="openMenu = ''" />
      <transition name="fade">
        <ul v-if="openMenu === 'src'" class="ltoolbar__menu no-scrollbar" @click.stop>
          <li>
            <button class="mitem" :class="{ on: activeSourceId === 'all' }" @click="pickSource('all')">
              <Layers :size="15" />
              <span class="mitem__name">全部资料库</span>
            </button>
          </li>
          <li v-for="s in libSources" :key="s.id">
            <button class="mitem" :class="{ on: activeSourceId === s.id }" @click="pickSource(s.id)">
              <component :is="iconFor(s.kind)" :size="15" :style="{ color: accentFor(s.kind) }" />
              <span class="mitem__name">{{ s.name }}</span>
              <span
                class="mitem__kind"
                :style="{ color: accentFor(s.kind), background: accentFor(s.kind) + '22' }"
                >{{ labelFor(s.kind) }}</span
              >
            </button>
          </li>
        </ul>
      </transition>
    </div>

    <!-- 服务器自带分类（媒体库）：多于一个时才显示 -->
    <div v-if="libraries.length > 1" class="ltoolbar__dd">
      <button class="ltool" @click.stop="toggle('lib')">
        <Layers :size="14" />
        <span class="ltool__name">{{ activeLibrary?.name ?? '全部分类' }}</span>
        <ChevronDown :size="14" class="ltool__chev" :class="{ 'is-open': openMenu === 'lib' }" />
      </button>
      <div v-if="openMenu === 'lib'" class="ltoolbar__backdrop" @click="openMenu = ''" />
      <transition name="fade">
        <ul v-if="openMenu === 'lib'" class="ltoolbar__menu no-scrollbar" @click.stop>
          <li>
            <button class="mitem" :class="{ on: activeLibraryId === 'all' }" @click="pickLibrary('all')">
              <Layers :size="15" />
              <span class="mitem__name">全部分类</span>
            </button>
          </li>
          <li v-for="l in libraries" :key="l.id">
            <button class="mitem" :class="{ on: activeLibraryId === l.id }" @click="pickLibrary(l.id)">
              <span class="mitem__name">{{ l.name }}</span>
            </button>
          </li>
        </ul>
      </transition>
    </div>

    <div class="ltoolbar__div" />

    <!-- 类型筹码 -->
    <div class="ltoolbar__types">
      <button
        v-for="c in categories"
        :key="c.key"
        class="tchip"
        :class="{ on: category === c.key }"
        @click="setCategory(c.key)"
      >
        {{ c.label }}
        <span class="tchip__count">{{ counts[c.key] }}</span>
      </button>
    </div>

    <!-- 搜索（/ 聚焦快捷键依赖 data-search-input） -->
    <label class="ltoolbar__search">
      <Search :size="15" class="ltoolbar__search-icon" />
      <input
        :value="query"
        type="text"
        placeholder="搜索影片、剧集…（按 / 聚焦）"
        data-search-input
        @input="setQuery(($event.target as HTMLInputElement).value)"
      />
      <button v-if="query" type="button" class="ltoolbar__search-clear" title="清除" @click="setQuery('')">
        <X :size="14" />
      </button>
    </label>

    <FilterMenu class="ltoolbar__filter" />

    <!-- 排序 -->
    <div class="ltoolbar__dd">
      <button class="ltool" @click.stop="toggle('sort')">
        <span class="ltool__name">{{ sorts.find((s) => s.key === sort)?.label }}</span>
        <ChevronDown :size="14" class="ltool__chev" :class="{ 'is-open': openMenu === 'sort' }" />
      </button>
      <div v-if="openMenu === 'sort'" class="ltoolbar__backdrop" @click="openMenu = ''" />
      <transition name="fade">
        <ul v-if="openMenu === 'sort'" class="ltoolbar__menu ltoolbar__menu--right" @click.stop>
          <li v-for="s in sorts" :key="s.key">
            <button class="mitem" :class="{ on: sort === s.key }" @click="pickSort(s.key)">
              <span class="mitem__name">{{ s.label }}</span>
            </button>
          </li>
        </ul>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.ltoolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px;
  background: color-mix(in srgb, var(--bg-2) 72%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  backdrop-filter: var(--blur);
  box-shadow: 0 8px 26px rgba(20, 30, 60, 0.1);
}
:root:not([data-scheme='light']) .ltoolbar {
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.35);
}

.ltoolbar__dd {
  position: relative;
  flex-shrink: 0;
}

/* 源 / 分类 / 排序 按钮 */
.ltool {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 240px;
  height: 36px;
  padding: 0 13px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.ltool:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.ltool__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ltool__chev {
  flex-shrink: 0;
  transition: transform var(--dur) var(--ease);
}
.ltool__chev.is-open {
  transform: rotate(180deg);
}
.ltool--src {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
  box-shadow: 0 4px 14px var(--accent-glow);
}
.ltool--src:hover {
  color: #fff;
  border-color: transparent;
}
.ltool__kind {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 1.5px 7px;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.22);
}

.ltoolbar__div {
  flex-shrink: 0;
  width: 1px;
  height: 20px;
  background: var(--border-strong);
}

/* 类型筹码 */
.ltoolbar__types {
  display: flex;
  flex-shrink: 0;
  gap: 3px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.tchip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-mute);
  border-radius: var(--r-pill);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.tchip:hover {
  color: var(--text);
}
.tchip.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 4px 12px var(--accent-glow);
}
.tchip__count {
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--text-mute);
}
.tchip.on .tchip__count {
  background: rgba(0, 0, 0, 0.22);
  color: #fff;
}

/* 搜索 */
.ltoolbar__search {
  flex: 1;
  min-width: 150px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 13px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ltoolbar__search:focus-within {
  border-color: var(--accent);
  background: var(--surface-2);
}
.ltoolbar__search-icon {
  color: var(--text-mute);
  flex-shrink: 0;
}
.ltoolbar__search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-size: 13px;
}
.ltoolbar__search input::placeholder {
  color: var(--text-mute);
}
.ltoolbar__search-clear {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  color: var(--text-mute);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ltoolbar__search-clear:hover {
  color: var(--text);
  background: var(--surface-hover);
}

/* 筛选按钮：嵌入工具栏后压紧凑（原 42px → 36px） */
.ltoolbar__filter {
  flex-shrink: 0;
}
.ltoolbar__filter :deep(.filter__btn) {
  height: 36px;
  padding: 0 13px;
  font-size: 12.5px;
}

/* 下拉菜单（沿用原 TopBar 排序菜单的视觉模式） */
.ltoolbar__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
}
.ltoolbar__menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 20;
  min-width: 210px;
  max-width: 300px;
  max-height: 52vh;
  overflow-y: auto;
  padding: 6px;
  background: var(--bg-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
}
.ltoolbar__menu--right {
  left: auto;
  right: 0;
  min-width: 150px;
}
.mitem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--text-dim);
  border-radius: var(--r-sm);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.mitem:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.mitem.on {
  color: var(--accent);
  font-weight: 600;
}
.mitem__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.mitem__kind {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 1.5px 7px;
  border-radius: var(--r-pill);
}
</style>
