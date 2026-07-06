<script setup lang="ts">
import { FileVideo, MonitorPlay, AudioLines, HardDrive, Gauge, Package, Folder } from 'lucide-vue-next'
import type { MediaTech } from '@/types/media'

defineProps<{ tech: MediaTech }>()
</script>

<template>
  <section class="tech">
    <h2 class="tech__title">文件信息</h2>

    <div class="tech__tags">
      <span class="tag tag--accent">{{ tech.quality }}</span>
      <span class="tag">{{ tech.dynamicRange }}</span>
      <span class="tag">{{ tech.container }}</span>
    </div>

    <div class="tech__grid">
      <div class="cell">
        <MonitorPlay :size="18" />
        <div class="cell__body">
          <span class="cell__k">分辨率</span>
          <span class="cell__v">{{ tech.resolution }}</span>
        </div>
      </div>
      <div class="cell">
        <FileVideo :size="18" />
        <div class="cell__body">
          <span class="cell__k">视频编码</span>
          <span class="cell__v">{{ tech.videoCodec }}</span>
        </div>
      </div>
      <div class="cell">
        <AudioLines :size="18" />
        <div class="cell__body">
          <span class="cell__k">音频编码</span>
          <span class="cell__v">{{ tech.audioCodec }}</span>
        </div>
      </div>
      <div class="cell">
        <HardDrive :size="18" />
        <div class="cell__body">
          <span class="cell__k">文件大小</span>
          <span class="cell__v">{{ tech.fileSize }}</span>
        </div>
      </div>
      <div class="cell">
        <Gauge :size="18" />
        <div class="cell__body">
          <span class="cell__k">码率</span>
          <span class="cell__v">{{ tech.bitrate }}</span>
        </div>
      </div>
      <div class="cell">
        <Package :size="18" />
        <div class="cell__body">
          <span class="cell__k">封装格式</span>
          <span class="cell__v">{{ tech.container }}</span>
        </div>
      </div>
    </div>

    <div class="tech__path">
      <Folder :size="16" />
      <code>{{ tech.filePath }}</code>
    </div>
  </section>
</template>

<style scoped>
.tech {
  margin-bottom: 40px;
}
.tech__title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 18px;
}
.tech__tags {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}
.tag {
  padding: 5px 13px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.tag--accent {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.tech__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}
.cell {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  color: var(--accent);
}
.cell__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cell__k {
  font-size: 12px;
  color: var(--text-mute);
}
.cell__v {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.tech__path {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  color: var(--text-mute);
  overflow-x: auto;
}
.tech__path code {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 13px;
  color: var(--text-dim);
  white-space: nowrap;
}
</style>
