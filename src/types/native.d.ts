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
  /** mpv 本地解码播放（支持整季播放列表 + 起始索引 + 续播秒数 + 进度回传 + 预选音轨/字幕） */
  playMpv(
    items: NekoPlayItem[],
    title: string,
    startIndex?: number,
    mpvPath?: string,
    startSec?: number,
    emby?: NekoEmbyProgress,
    tracks?: { aid?: number; sid?: number | 'no' },
    scrobble?: { token: string; clientId: string; item: Record<string, unknown>; runtime: number }
  ): Promise<boolean>
  /** 唤起系统外部播放器（iina/vlc/potplayer），可预选音轨/字幕（IINA/VLC 生效，PotPlayer 用自身菜单） */
  playExternal(
    player: string,
    url: string,
    appPath?: string,
    startSec?: number,
    tracks?: { aid?: number; sid?: number | 'no' }
  ): Promise<boolean>
  /** 外部播放结束后主进程回调（带刚播放的 itemId），前端据此轻量刷新进度 */
  onPlaybackEnded(cb: (itemId?: string) => void): void
  /** 读持久化存储（同步，供模块初始化时用）；无值返回 null */
  storeGet(key: string): string | null
  /** 写持久化存储（异步、去抖落盘） */
  storeSet(key: string, val: string): void
  /** 删持久化存储 */
  storeRemove(key: string): void
  /** 选择文件夹（添加本机存储源）；取消返回 null */
  pickFolder(): Promise<string | null>
  /** 递归扫描本机目录下所有视频（path 为本地绝对路径） */
  scanVideos(root: string): Promise<{ videos?: NekoVideoFile[]; error?: string }>
  /** 递归列 WebDAV 视频（path 为带认证的直链） */
  scanWebdav(config: Record<string, string>): Promise<{ videos?: NekoVideoFile[]; error?: string }>
  /** 递归扫 SMB 共享视频（Windows，path 为 UNC 路径） */
  scanSmb(config: Record<string, string>): Promise<{ videos?: NekoVideoFile[]; error?: string }>
  /** SSDP 发现局域网 DLNA 媒体服务器 */
  discoverDlna(): Promise<{ servers?: DlnaServer[]; error?: string }>
  /** 递归浏览 DLNA 服务器的视频（path 为 http res 直链） */
  scanDlna(config: Record<string, string>): Promise<{ videos?: NekoVideoFile[]; error?: string }>
  /** 取视频缩略图（自带 mpv 抽帧+缓存），返回 base64 data URL；失败返回 null */
  getThumb(file: string, mpvPath?: string): Promise<string | null>
  /** 检查 mpv 是否可用（传入自定义路径优先）；ok=false 表示需用户填路径 */
  checkMpv(mpvPath?: string): Promise<{ ok: boolean; path: string }>
  /** 用 mpv 探测视频媒体信息（分辨率/编码/时长/大小 + 音轨/字幕轨道列表）；失败返回 null */
  probeMedia(
    file: string,
    mpvPath?: string
  ): Promise<{
    width: number
    height: number
    fps: number
    videoCodec: string
    audioCodec: string
    channels: number
    sampleRate: number
    duration: number
    gamma: string
    size: number
    tracks: { audio: NekoTrackInfo[]; sub: NekoTrackInfo[] }
  } | null>
  /** 亮/暗切换时同步标题栏悬浮窗口按钮区的配色（仅 Windows 生效） */
  setTitlebarTheme(light: boolean): void
}

/** mpv 探测到的单条音轨/字幕（id 用于 --aid/--sid） */
export interface NekoTrackInfo {
  id: number
  lang: string
  title: string
  codec: string
}

/** 发现到的 DLNA 服务器 */
export interface DlnaServer {
  name: string
  controlUrl: string
}

/** 递归扫描到的视频文件 */
export interface NekoVideoFile {
  name: string
  path: string
  size: number
  mtime: number
  /** 相对于源根的所在文件夹（'/' 分隔，根目录为 ''），供文件夹层级浏览 */
  dir?: string
}

declare global {
  interface Window {
    nekoNative?: NekoNative
  }
}

export {}
