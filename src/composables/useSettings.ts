import { reactive, watch } from 'vue'

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
  playerMode: string
  playerPaths: Record<string, string>
  quality: string | number
  rate: string | number
  autoNext: boolean
  hwdecode: boolean
  subSize: string | number
  subColor: string
  subOutline: boolean
}

const DEFAULTS: Settings = {
  themeIndex: 0,
  playerMode: 'mpv',
  playerPaths: {},
  quality: '自动',
  rate: 1,
  autoNext: true,
  hwdecode: true,
  subSize: '中',
  subColor: '#ffffff',
  subOutline: true
}

const KEY = 'neko-settings'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
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

// 启动即应用已保存主题
applyTheme(settings.themeIndex)

// 任何设置变更：持久化 + 主题即时应用
watch(
  settings,
  () => {
    localStorage.setItem(KEY, JSON.stringify(settings))
    applyTheme(settings.themeIndex)
  },
  { deep: true }
)

export function useSettings() {
  return { settings, themes, applyTheme }
}
