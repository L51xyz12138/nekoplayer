import { reactive } from 'vue'

// 轻量全局通知（右下角短暂提示）：播放失败、同步出错等用户需要知道的瞬时反馈。模块级单例。
export interface Toast {
  id: number
  message: string
  type: 'info' | 'error' | 'success'
}

const toasts = reactive<Toast[]>([])
let seq = 0

function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}

/** 弹一条通知；重复内容会先去重（避免刷屏）。duration 毫秒 */
function toast(message: string, type: Toast['type'] = 'info', duration = 3800) {
  if (!message) return
  // 同内容已在显示 → 不重复弹
  if (toasts.some((t) => t.message === message)) return
  const id = ++seq
  toasts.push({ id, message, type })
  if (toasts.length > 4) toasts.shift() // 最多同时 4 条
  setTimeout(() => dismiss(id), duration)
}

export function useToast() {
  return { toasts, toast, dismiss }
}
