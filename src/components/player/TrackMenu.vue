<script setup lang="ts">
import { Check } from 'lucide-vue-next'

defineProps<{ title: string; options: string[]; current: string }>()
const emit = defineEmits<{ select: [value: string] }>()
</script>

<template>
  <div class="tmenu">
    <div class="tmenu__title">{{ title }}</div>
    <ul class="tmenu__list">
      <li
        v-for="o in options"
        :key="o"
        class="tmenu__opt"
        :class="{ on: o === current }"
        @click="emit('select', o)"
      >
        <Check v-if="o === current" :size="15" class="tmenu__check" />
        <span>{{ o }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tmenu {
  position: absolute;
  bottom: calc(100% + 12px);
  right: 0;
  min-width: 148px;
  padding: 8px;
  background: rgba(18, 20, 28, 0.9);
  backdrop-filter: var(--blur);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
}
.tmenu__title {
  padding: 4px 10px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-mute);
}
.tmenu__opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  font-size: 13.5px;
  color: var(--text-dim);
  cursor: pointer;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.tmenu__opt:hover {
  background: var(--surface-hover);
  color: #fff;
}
.tmenu__opt.on {
  color: var(--accent);
}
.tmenu__check {
  flex-shrink: 0;
}
.tmenu__opt:not(.on) span {
  padding-left: 23px;
}
</style>
