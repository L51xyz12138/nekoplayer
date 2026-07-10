import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 版本号单一来源：package.json，注入 __APP_VERSION__ 供「关于」等处使用
const appVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
).version

// https://vite.dev/config/
export default defineConfig({
  // Electron 用 file:// 加载，需相对路径才能找到 assets（否则打包后白屏）
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
})
