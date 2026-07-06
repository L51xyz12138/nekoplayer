<script setup lang="ts">
type Val = string | number

defineProps<{ options: Val[]; modelValue: Val }>()
const emit = defineEmits<{ 'update:modelValue': [v: Val] }>()
</script>

<template>
  <div class="seg">
    <button
      v-for="o in options"
      :key="o"
      class="seg__opt"
      :class="{ on: modelValue === o }"
      @click="emit('update:modelValue', o)"
    >
      {{ o }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.seg__opt {
  padding: 7px 15px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  border-radius: var(--r-pill);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.seg__opt:hover {
  color: #fff;
}
.seg__opt.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
</style>
