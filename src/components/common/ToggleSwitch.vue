<script setup lang="ts">
defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()
</script>

<template>
  <label class="switch">
    <input
      type="checkbox"
      :checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="switch__track"><span class="switch__thumb" /></span>
  </label>
</template>

<style scoped>
.switch {
  cursor: pointer;
}
.switch input {
  display: none;
}
.switch__track {
  display: block;
  width: 44px;
  height: 26px;
  border-radius: var(--r-pill);
  background: var(--surface-hover);
  border: 1px solid var(--border);
  transition: background var(--dur) var(--ease);
}
.switch__thumb {
  display: block;
  width: 20px;
  height: 20px;
  margin: 2px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--dur) var(--ease);
}
.switch input:checked + .switch__track {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.switch input:checked + .switch__track .switch__thumb {
  transform: translateX(18px);
}
</style>
