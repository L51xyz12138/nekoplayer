const { contextBridge, ipcRenderer } = require('electron')

// 暴露给渲染进程（前端）的原生能力
contextBridge.exposeInMainWorld('nekoNative', {
  isElectron: true,
  platform: process.platform,
  // mpv 本地解码播放（items + 起始索引 + 自定义 mpv 路径），支持整季播放列表
  playMpv: (items, title, startIndex, mpvPath) =>
    ipcRenderer.invoke('play-mpv', { items, title, startIndex, mpvPath }),
  // 唤起系统外部播放器（iina / vlc / infuse / potplayer），支持自定义程序路径
  playExternal: (player, url, appPath) => ipcRenderer.invoke('play-external', { player, url, appPath })
})
