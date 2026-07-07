<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    variant?: 'solid' | 'glass' | 'ghost'
    round?: boolean
    /** 选中态（如「已收藏」「已看」），用强调色高亮 */
    active?: boolean
  }>(),
  { variant: 'glass', round: false, active: false }
)
</script>

<template>
  <button class="icon-btn" :class="[variant, { round, on: active }]">
    <slot />
    <span v-if="label" class="icon-btn__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border-radius: var(--r-pill);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  border: 1px solid transparent;
  transition: transform var(--dur) var(--ease), background var(--dur) var(--ease),
    border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.icon-btn.round {
  width: 44px;
  padding: 0;
}
.icon-btn:active {
  transform: scale(0.94);
}

.icon-btn.solid {
  color: #0b0c11;
  background: #fff;
}
.icon-btn.solid:hover {
  background: #e9edfb;
}

.icon-btn.glass {
  color: var(--text);
  background: var(--surface-2);
  border-color: var(--border);
  backdrop-filter: var(--blur);
}
.icon-btn.glass:hover {
  background: var(--surface-hover);
  border-color: var(--border-strong);
}

.icon-btn.ghost {
  color: var(--text-dim);
}
.icon-btn.ghost:hover {
  color: var(--text);
  background: var(--surface);
}

/* 选中态：实心强调色，放最后确保覆盖各 variant 的默认配色 */
.icon-btn.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
  box-shadow: 0 6px 18px var(--accent-glow);
}
.icon-btn.on:hover {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
</style>
