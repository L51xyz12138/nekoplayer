import { ref } from 'vue'

// 全局海报背景（App.vue 渲染在最底层）。三种模式：
//  home    首页：整幅高斯模糊（精选海报）
//  focus   详情页：整窗大海报，中间偏上清晰、向四周渐糊
//  ambient 其它页（媒体源/设置/Trakt/合集/演员）：更强高斯模糊 + 更深遮罩，保留海报氛围但保证内容清晰
// 模块级单例。
export type BackdropMode = 'home' | 'focus' | 'ambient'

const backdropUrl = ref<string | undefined>(undefined)
const backdropMode = ref<BackdropMode>('home')

/** 设置背景图与模式（url 为空则不显示背景，回退纯渐变） */
function setBackdrop(url?: string, mode: BackdropMode = 'home') {
  backdropUrl.value = url || undefined
  backdropMode.value = url ? mode : 'home'
}
/** 只改模式、保留当前背景图（如切到工具页时把详情页的 focus 改成 ambient） */
function setBackdropMode(mode: BackdropMode) {
  backdropMode.value = mode
}

export function useBackground() {
  return { backdropUrl, backdropMode, setBackdrop, setBackdropMode }
}
