const { contextBridge, ipcRenderer } = require('electron')

// 暴露给渲染进程（前端）的原生能力
contextBridge.exposeInMainWorld('nekoNative', {
  isElectron: true,
  platform: process.platform,
  // mpv 本地解码播放（items + 起始索引 + 自定义 mpv 路径），支持整季播放列表
  playMpv: (items, title, startIndex, mpvPath, startSec, emby, tracks) =>
    ipcRenderer.invoke('play-mpv', { items, title, startIndex, mpvPath, startSec, emby, tracks }),
  // 唤起系统外部播放器（iina / vlc / potplayer），支持自定义程序路径 + 起始秒数 + 预选音轨/字幕
  playExternal: (player, url, appPath, startSec, tracks) =>
    ipcRenderer.invoke('play-external', { player, url, appPath, startSec, tracks }),
  // 外部播放结束后主进程通知，前端据此刷新进度
  onPlaybackEnded: (cb) => ipcRenderer.on('playback-ended', (_e, itemId) => cb(itemId)),
  // 持久化存储（写到 userData 下的 json 文件，跨软件更新不丢；读同步、写异步）
  storeGet: (key) => ipcRenderer.sendSync('store-get', key),
  storeSet: (key, val) => ipcRenderer.send('store-set', { key, val }),
  storeRemove: (key) => ipcRenderer.send('store-remove', key),
  // 文件浏览类源：本机(选文件夹+扫视频) / WebDAV / SMB + 视频缩略图
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scanVideos: (root) => ipcRenderer.invoke('scan-videos', root),
  scanWebdav: (config) => ipcRenderer.invoke('scan-webdav', config),
  scanSmb: (config) => ipcRenderer.invoke('scan-smb', config),
  discoverDlna: () => ipcRenderer.invoke('discover-dlna'),
  scanDlna: (config) => ipcRenderer.invoke('scan-dlna', config),
  getThumb: (file, mpvPath) => ipcRenderer.invoke('get-thumb', { file, mpvPath }),
  checkMpv: (mpvPath) => ipcRenderer.invoke('check-mpv', mpvPath),
  // 用 mpv 探测视频媒体信息（分辨率/编码/时长/大小）
  probeMedia: (file, mpvPath) => ipcRenderer.invoke('probe-media', { file, mpvPath }),
  // 亮/暗切换时同步标题栏悬浮按钮区配色（Windows）
  setTitlebarTheme: (light) => ipcRenderer.send('set-titlebar-theme', light)
})
