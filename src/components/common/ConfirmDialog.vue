<script setup lang="ts">
import { watch } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（删除等）：确认按钮用红色 */
  danger?: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel')
  else if (e.key === 'Enter') emit('confirm')
}
watch(
  () => props.open,
  (o) => {
    if (o) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  }
)
</script>

<template>
  <transition name="dialog">
    <div v-if="open" class="mask" @click.self="emit('cancel')">
      <div class="confirm">
        <div class="confirm__icon" :class="{ danger }">
          <AlertTriangle :size="24" />
        </div>
        <h2 class="confirm__title">{{ title || '确认操作' }}</h2>
        <p v-if="message" class="confirm__msg">{{ message }}</p>
        <div class="confirm__actions">
          <button class="btn btn--ghost" @click="emit('cancel')">{{ cancelText || '取消' }}</button>
          <button
            class="btn"
            :class="danger ? 'btn--danger' : 'btn--primary'"
            @click="emit('confirm')"
          >
            {{ confirmText || '确认' }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 5, 8, 0.62);
  backdrop-filter: blur(6px);
}
.confirm {
  width: 100%;
  max-width: 400px;
  padding: 28px 26px 22px;
  text-align: center;
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--border-strong);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-pop);
}
.confirm__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin: 0 auto 16px;
  border-radius: 50%;
  color: var(--accent);
  background: var(--accent-soft);
}
.confirm__icon.danger {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.14);
}
.confirm__title {
  font-size: 18px;
  font-weight: 700;
}
.confirm__msg {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-dim);
}
.confirm__actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.btn {
  flex: 1;
  height: 44px;
  font-size: 14px;
  font-weight: 650;
  border-radius: var(--r-pill);
  transition: transform var(--dur), background var(--dur), border-color var(--dur);
}
.btn:active {
  transform: scale(0.96);
}
.btn--ghost {
  color: var(--text-dim);
  border: 1px solid var(--border);
}
.btn--ghost:hover {
  color: var(--text);
  background: var(--surface);
}
.btn--primary {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 8px 22px var(--accent-glow);
}
.btn--danger {
  color: #fff;
  background: linear-gradient(135deg, #ff6b6b, #ff8f5c);
  box-shadow: 0 8px 22px rgba(255, 107, 107, 0.4);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.22s var(--ease);
}
.dialog-enter-active .confirm,
.dialog-leave-active .confirm {
  transition: transform 0.22s var(--ease);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .confirm,
.dialog-leave-to .confirm {
  transform: translateY(16px) scale(0.98);
}
</style>
