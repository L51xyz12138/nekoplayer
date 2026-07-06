import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 开发时把 /emby 代理到真实 Emby 服务器，规避浏览器跨域限制
  const embyTarget = env.VITE_EMBY_URL || 'http://192.168.1.10:8096'

  return {
    // Electron 用 file:// 加载，需相对路径才能找到 assets（否则打包后白屏）
    base: './',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/emby': {
          target: embyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/emby/, '')
        }
      }
    }
  }
})
