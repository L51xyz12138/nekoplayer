const { contextBridge, ipcRenderer } = require('electron')

// 暴露给渲染进程（前端）的原生能力
contextBridge.exposeInMainWorld('nekoNative', {
  isElectron: true,
  platform: process.platform,
  // mpv 本地解码播放（items + 起始索引 + 自定义 mpv 路径），支持整季播放列表
  playMpv: (items, title, startIndex, mpvPath, startSec, emby) =>
    ipcRenderer.invoke('play-mpv', { items, title, startIndex, mpvPath, startSec, emby }),
  // 唤起系统外部播放器（iina / vlc / infuse / potplayer），支持自定义程序路径 + 起始秒数
  playExternal: (player, url, appPath, startSec) =>
    ipcRenderer.invoke('play-external', { player, url, appPath, startSec }),
  // 外部播放结束后主进程通知，前端据此刷新进度
  onPlaybackEnded: (cb) => ipcRenderer.on('playback-ended', (_e, itemId) => cb(itemId)),
  // 持久化存储（写到 userData 下的 json 文件，跨软件更新不丢；读同步、写异步）
  storeGet: (key) => ipcRenderer.sendSync('store-get', key),
  storeSet: (key, val) => ipcRenderer.send('store-set', { key, val }),
  storeRemove: (key) => ipcRenderer.send('store-remove', key)
})
