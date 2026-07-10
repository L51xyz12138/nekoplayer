/// <reference types="vite/client" />

/** 构建时注入的应用版本号（来自 package.json，见 vite.config.ts） */
declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
