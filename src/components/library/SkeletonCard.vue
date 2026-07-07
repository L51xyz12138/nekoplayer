<script setup lang="ts">
// 海报卡片的加载占位（微光骨架），布局与 PosterCard 对齐
</script>

<template>
  <div class="sk">
    <div class="sk__poster shimmer" />
    <div class="sk__line shimmer" />
    <div class="sk__line sk__line--sm shimmer" />
  </div>
</template>

<style scoped>
.sk {
  width: 100%;
}
.sk__poster {
  aspect-ratio: 2 / 3;
  border-radius: var(--r-md);
}
.sk__line {
  width: 82%;
  height: 11px;
  margin-top: 11px;
  border-radius: 6px;
}
.sk__line--sm {
  width: 46%;
  height: 9px;
  margin-top: 7px;
}
</style>
