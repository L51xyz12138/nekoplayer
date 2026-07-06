<script setup lang="ts">
import { Star } from 'lucide-vue-next'

defineProps<{ rating: number }>()
</script>

<template>
  <span class="rating">
    <Star :size="13" fill="currentColor" :stroke-width="0" />
    {{ rating.toFixed(1) }}
  </span>
</template>

<style scoped>
.rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 700;
  color: #ffce53;
}
</style>
