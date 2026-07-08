// window.nekoNative：Electron preload 暴露的原生能力（定义见 electron/preload.cjs）
// 非 Electron（web 降级）环境下 window.nekoNative 为 undefined。

/** 播放列表条目（外部播放器整季连播用） */
export interface NekoPlayItem {
  url: string
  title: string
}

/** mpv 进度回传所需的 Emby 会话信息（deviceId/playSessionId 必须与渲染进程一致） */
export interface NekoEmbyProgress {
  serverUrl: string
  token: string
  userId: string
  deviceId: string
  itemId: string
  playSessionId: string
}

export interface NekoNative {
  isElectron: true
  /** process.platform：'darwin' | 'win32' | 'linux' | … */
  platform: string
  /** mpv 本地解码播放（支持整季播放列表 + 起始索引 + 续播秒数 + 进度回传） */
  playMpv(
    items: NekoPlayItem[],
    title: string,
    startIndex?: number,
    mpvPath?: string,
    startSec?: number,
    emby?: NekoEmbyProgress
  ): Promise<boolean>
  /** 唤起系统外部播放器（iina/vlc/infuse/potplayer） */
  playExternal(player: string, url: string, appPath?: string, startSec?: number): Promise<boolean>
  /** 外部播放结束后主进程回调（带刚播放的 itemId），前端据此轻量刷新进度 */
  onPlaybackEnded(cb: (itemId?: string) => void): void
  /** 读持久化存储（同步，供模块初始化时用）；无值返回 null */
  storeGet(key: string): string | null
  /** 写持久化存储（异步、去抖落盘） */
  storeSet(key: string, val: string): void
  /** 删持久化存储 */
  storeRemove(key: string): void
}

declare global {
  interface Window {
    nekoNative?: NekoNative
  }
}

export {}
