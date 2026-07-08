<script setup lang="ts">
import { ref } from 'vue'
import { SlidersHorizontal, X } from 'lucide-vue-next'
import { useLibrary } from '@/composables/useLibrary'

const lib = useLibrary()
const { genre, year, unwatched, genreOptions, decadeOptions, activeFilterCount } = lib
const { setGenre, setYear, setUnwatched, resetFilters } = lib

const open = ref(false)
</script>

<template>
  <div class="filter">
    <button
      class="filter__btn"
      :class="{ on: open || activeFilterCount > 0 }"
      @click.stop="open = !open"
    >
      <SlidersHorizontal :size="16" />
      筛选
      <span v-if="activeFilterCount" class="filter__badge">{{ activeFilterCount }}</span>
    </button>

    <div v-if="open" class="filter__backdrop" @click="open = false" />
    <transition name="fade">
      <div v-if="open" class="filter__panel no-scrollbar" @click.stop>
        <div v-if="genreOptions.length" class="fgroup">
          <p class="fgroup__label">类型</p>
          <div class="fchips">
            <button class="fchip" :class="{ on: !genre }" @click="setGenre('')">全部</button>
            <button
              v-for="g in genreOptions"
              :key="g"
              class="fchip"
              :class="{ on: genre === g }"
              @click="setGenre(genre === g ? '' : g)"
            >
              {{ g }}
            </button>
          </div>
        </div>

        <div v-if="decadeOptions.length" class="fgroup">
          <p class="fgroup__label">年份</p>
          <div class="fchips">
            <button class="fchip" :class="{ on: !year }" @click="setYear('')">全部</button>
            <button
              v-for="d in decadeOptions"
              :key="d"
              class="fchip"
              :class="{ on: year === String(d) }"
              @click="setYear(year === String(d) ? '' : String(d))"
            >
              {{ d }}s
            </button>
          </div>
        </div>

        <div class="fgroup fgroup--row">
          <p class="fgroup__label">只看未看</p>
          <button
            class="ftoggle"
            :class="{ on: unwatched }"
            role="switch"
            :aria-checked="unwatched"
            @click="setUnwatched(!unwatched)"
          >
            <span class="ftoggle__dot" />
          </button>
        </div>

        <button v-if="activeFilterCount" class="filter__reset" @click="resetFilters">
          <X :size="14" /> 清除筛选
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.filter {
  position: relative;
}
.filter__btn {
  display: inline-flex;
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
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.filter__btn:hover {
  border-color: var(--border-strong);
}
.filter__btn.on {
  color: var(--accent);
  border-color: var(--accent);
}
.filter__badge {
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
  border-radius: var(--r-pill);
}

.filter__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
}
.filter__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 16px;
  background: var(--bg-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
}
.fgroup {
  margin-bottom: 16px;
}
.fgroup:last-of-type {
  margin-bottom: 0;
}
.fgroup--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.fgroup__label {
  margin-bottom: 10px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-dim);
}
.fgroup--row .fgroup__label {
  margin-bottom: 0;
}
.fchips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.fchip {
  padding: 5px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.fchip:hover {
  color: var(--text);
  background: var(--surface-2);
}
.fchip.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}

.ftoggle {
  width: 44px;
  height: 26px;
  padding: 2px;
  border-radius: var(--r-pill);
  background: var(--surface-hover);
  border: 1px solid var(--border);
  transition: background var(--dur) var(--ease);
}
.ftoggle.on {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.ftoggle__dot {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--dur) var(--ease);
}
.ftoggle.on .ftoggle__dot {
  transform: translateX(18px);
}

.filter__reset {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 16px;
  padding: 9px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.filter__reset:hover {
  color: #ff8b8b;
  background: rgba(255, 107, 107, 0.1);
}
</style>
