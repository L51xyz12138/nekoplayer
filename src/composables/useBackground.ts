import { ref } from 'vue'

// 全局海报背景（App.vue 渲染在最底层）。两种模式：
//  home  首页：整幅高斯模糊（精选海报）
//  focus 详情页：整窗大海报，中间偏上清晰、向四周渐糊
// 其它页面不设背景（url 为空）→ 回退纯渐变底色。
// 模块级单例。
export type BackdropMode = 'home' | 'focus'

const backdropUrl = ref<string | undefined>(undefined)
const backdropMode = ref<BackdropMode>('home')

/** 设置背景图与模式（url 为空则不显示海报、回退纯渐变） */
function setBackdrop(url?: string, mode: BackdropMode = 'home') {
  backdropUrl.value = url || undefined
  backdropMode.value = url ? mode : 'home'
}

export function useBackground() {
  return { backdropUrl, backdropMode, setBackdrop }
}
