<script setup lang="ts">
// 「文件信息」+「音轨与字幕」加载时的骨架占位，布局与 MediaTechInfo / TrackPicker 对齐，
// 避免探测/加载还没回来时这两块一会有一会没有、导致下方内容跳动。
</script>

<template>
  <div class="mskel">
    <!-- 文件信息 -->
    <section class="mskel__sec">
      <div class="mskel__title shimmer" />
      <div class="mskel__tags">
        <span class="mskel__tag shimmer" />
        <span class="mskel__tag shimmer" />
        <span class="mskel__tag shimmer" />
      </div>
      <div class="mskel__grid">
        <div v-for="i in 6" :key="i" class="mskel__cell shimmer" />
      </div>
      <div class="mskel__path shimmer" />
    </section>

    <!-- 音轨与字幕 -->
    <section class="mskel__sec">
      <div class="mskel__title shimmer" />
      <div class="mskel__fields">
        <div class="mskel__field shimmer" />
        <div class="mskel__field shimmer" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.mskel__sec {
  margin-bottom: 40px;
}
.mskel .shimmer {
  border-radius: var(--r-md);
}
.mskel__title {
  width: 118px;
  height: 22px;
  margin-bottom: 18px;
  border-radius: var(--r-pill);
}
.mskel__tags {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}
.mskel__tag {
  width: 54px;
  height: 27px;
  border-radius: var(--r-pill);
}
.mskel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}
.mskel__cell {
  height: 62px;
}
.mskel__path {
  height: 48px;
}
.mskel__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}
.mskel__field {
  height: 90px;
}
</style>
