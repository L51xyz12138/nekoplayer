<script setup lang="ts">
import { Layers, Server } from 'lucide-vue-next'
import { useSources } from '@/composables/useSources'
import { useLibrary } from '@/composables/useLibrary'

const { sources } = useSources()
const { activeSourceId, setActiveSource } = useLibrary()
</script>

<template>
  <div class="stabs no-scrollbar">
    <button
      class="stab"
      :class="{ on: activeSourceId === 'all' }"
      @click="setActiveSource('all')"
    >
      <Layers :size="16" />
      全部资料库
    </button>
    <button
      v-for="s in sources"
      :key="s.id"
      class="stab"
      :class="{ on: activeSourceId === s.id }"
      @click="setActiveSource(s.id)"
    >
      <Server :size="16" />
      {{ s.name }}
      <span v-if="!s.enabled" class="stab__off">停用</span>
    </button>
  </div>
</template>

<style scoped>
.stabs {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  margin-bottom: 16px;
  padding-bottom: 2px;
}
.stab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  white-space: nowrap;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.stab:hover {
  color: #fff;
  background: var(--surface-2);
}
.stab.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
  box-shadow: 0 8px 20px var(--accent-glow);
}
.stab__off {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.14);
}
</style>
