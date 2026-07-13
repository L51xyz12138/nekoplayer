import { reactive, watch } from 'vue'
import { pget, pset } from './persist'

export interface ThemePreset {
  name: string
  c1: string
  c2: string
}

export const themes: ThemePreset[] = [
  { name: '蓝紫', c1: '#5b8cff', c2: '#9d7bff' },
  { name: '青绿', c1: '#24c1a3', c2: '#43d6b0' },
  { name: '樱粉', c1: '#ff6b9d', c2: '#ff8db3' },
  { name: '橙金', c1: '#ff9f45', c2: '#ffc061' },
  { name: '赤红', c1: '#ff5c5c', c2: '#ff8a5c' },
  { name: '冰蓝', c1: '#3aa0ff', c2: '#5bd0ff' }
]

interface Settings {
  themeIndex: number
  colorScheme: string
  playerMode: string
  playerPaths: Record<string, string>
  quality: string | number
  rate: string | number
  autoNext: boolean
  hwdecode: boolean
  /** 音轨语言偏好（传给 mpv --alang）：原声/中文/日文/英文 */
  audioLang: string
  /** 字幕语言偏好（传给 mpv --slang / --sid）：自动/关闭/中文/英文 */
  subLang: string
  /** 自动跳过片头片尾（mpv 按章节名跳，需媒体有对应章节） */
  skipIntro: boolean
  subSize: string | number
  subColor: string
  subOutline: boolean
  /** TMDB API Key（v3）；填了才启用文件源刮削（Emby/Jellyfin 由服务器刮，不受此影响） */
  tmdbKey: string
  /** 刮削语言，如 zh-CN / en-US */
  tmdbLang: string
  /** TMDB API 基地址（国内不通时可改镜像） */
  tmdbApiBase: string
  /** TMDB 图片基地址（含尺寸段，如 .../w500） */
  tmdbImgBase: string
  /** assrt 射手网 API token（在线字幕下载）；留空则用内置 token（额度共享，可能受限时填自己的） */
  assrtToken: string
}

const DEFAULTS: Settings = {
  themeIndex: 0,
  colorScheme: '跟随系统',
  playerMode: 'mpv',
  playerPaths: {},
  quality: '自动',
  rate: 1,
  autoNext: true,
  hwdecode: true,
  audioLang: '原声',
  subLang: '自动',
  skipIntro: false,
  subSize: '中',
  subColor: '#ffffff',
  subOutline: true,
  tmdbKey: '',
  tmdbLang: 'zh-CN',
  tmdbApiBase: 'https://api.themoviedb.org/3',
  tmdbImgBase: 'https://image.tmdb.org/t/p/w500',
  assrtToken: ''
}

const KEY = 'neko-settings'

function load(): Settings {
  try {
    const raw = pget(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

// 模块级单例
const settings = reactive<Settings>(load())

export function applyTheme(index: number) {
  const t = themes[index] ?? themes[0]
  const r = document.documentElement.style
  r.setProperty('--accent', t.c1)
  r.setProperty('--accent-2', t.c2)
  r.setProperty('--accent-soft', t.c1 + '28')
  r.setProperty('--accent-glow', t.c1 + '66')
}

const prefersLight = window.matchMedia('(prefers-color-scheme: light)')

/** 应用亮/暗背景：亮色 / 暗色 / 跟随系统 */
export function applyScheme(mode: string) {
  const light = mode === '亮色' || (mode === '跟随系统' && prefersLight.matches)
  document.documentElement.dataset.scheme = light ? 'light' : 'dark'
  // 同步标题栏悬浮窗口按钮区配色（否则亮色下右上角一块黑）
  window.nekoNative?.setTitlebarTheme?.(light)
}

// 启动即应用已保存的主题与背景
applyTheme(settings.themeIndex)
applyScheme(settings.colorScheme)

// 跟随系统时，系统亮/暗切换实时生效
prefersLight.addEventListener('change', () => {
  if (settings.colorScheme === '跟随系统') applyScheme('跟随系统')
})

// 任何设置变更：持久化 + 即时应用
watch(
  settings,
  () => {
    pset(KEY, JSON.stringify(settings))
    applyTheme(settings.themeIndex)
    applyScheme(settings.colorScheme)
  },
  { deep: true }
)

export function useSettings() {
  return { settings, themes, applyTheme, applyScheme }
}
