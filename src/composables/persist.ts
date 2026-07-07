// 统一持久化层：
// - Electron 下走主进程文件存储（写到 userData/neko-store.json，跨软件更新不丢，也没有 localStorage 的配额限制）
// - Web（降级）下走 localStorage
// 首次在 Electron 读取时，会把旧版本残留在 localStorage 的数据迁移进文件存储。

// Electron 下有 nekoNative（含 store* 方法，与前端一起打包发布，不会版本错配）；web 下为 null
function nativeStore() {
  return window.nekoNative ?? null
}

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeLocalSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val)
  } catch {
    /* 配额超限等：忽略即可 */
  }
}
function safeLocalRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function pget(key: string): string | null {
  const store = nativeStore()
  if (!store) return safeLocalGet(key)

  const v = store.storeGet(key)
  if (v != null) return v
  // 迁移：把旧版本存在 localStorage 的数据搬进文件存储，避免升级后丢失
  const legacy = safeLocalGet(key)
  if (legacy != null) {
    store.storeSet(key, legacy)
    return legacy
  }
  return null
}

export function pset(key: string, val: string): void {
  const store = nativeStore()
  if (store) store.storeSet(key, val)
  else safeLocalSet(key, val)
}

export function premove(key: string): void {
  const store = nativeStore()
  if (store) store.storeRemove(key)
  else safeLocalRemove(key)
}
