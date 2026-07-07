<div align="center">

# 🐱 NekoPlayer

**跨平台媒体播放器**

连接 Emby / Jellyfin / Plex 媒体服务器，用你喜欢的播放器畅享影音喵～

[![Build](https://github.com/L51xyz12138/nekoplayer/actions/workflows/build.yml/badge.svg)](https://github.com/L51xyz12138/nekoplayer/actions)
[![Release](https://img.shields.io/github/v/release/L51xyz12138/nekoplayer)](https://github.com/L51xyz12138/nekoplayer/releases)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

</div>

## ✨ 特性

- 🎬 **多媒体源** —— 连接 Emby / Jellyfin / Plex，可聚合浏览也可单独查看
- 🖥️ **跨平台** —— Windows / macOS / Linux 桌面客户端
- ▶️ **外部播放器** —— mpv / IINA / VLC / Infuse / PotPlayer，本地解码不转码，NAS/服务器零转码负载
- 📦 **开箱即用** —— 自带 mpv（含 [uosc](https://github.com/tomasklaen/uosc) 现代界面 + 中文菜单），无需另外安装
- 🎞️ **整季连播** —— 剧集自动播放下一集
- 🎨 **精致 UI** —— 海报墙、多主题强调色、详情页、演职人员、进度同步

## 📥 下载

前往 [**Releases**](https://github.com/L51xyz12138/nekoplayer/releases) 下载对应平台的安装包：

| 平台 | 文件 |
|------|------|
| 🪟 Windows | `NekoPlayer-*-setup.exe` |
| 🍎 macOS (Apple Silicon) | `NekoPlayer-*-arm64.dmg` |
| 🐧 Linux | `NekoPlayer-*.AppImage` / `NekoPlayer-*.deb` |

### 🍎 macOS 首次打开
应用未经 Apple 签名，首次打开若提示"已损坏"，把它拖到「应用程序」后执行一次即可：
```bash
sudo xattr -cr /Applications/NekoPlayer.app
```

## 🚀 使用

1. 启动后进入主页，点击左侧 **媒体源 → 添加媒体源**
2. 选择 **Emby**，填入服务器地址、账号、密码，点击连接
3. 回到媒体库浏览影音，点 **播放**，或选 **mpv / IINA / VLC** 等按钮用指定播放器打开
4. 在 **设置** 里可自定义：默认播放器、各播放器程序路径、主题色、字幕样式等

## 🛠️ 技术栈

Vue 3 · Vite · TypeScript · Vue Router · Electron · hls.js

## 💻 本地开发

```bash
npm install          # 安装依赖
npm run dev          # 启动前端 (Vite)
npm run electron     # 启动 Electron 桌面壳
npm run icons        # 由 buildResources/icon.svg 生成应用图标
npm run dist:mac     # 打包 macOS（dist:win / dist:linux 同理）
```

## 📦 构建与发布

推送 `v*` 标签即触发 GitHub Actions 三平台自动构建，并把安装包发布到 Releases：
```bash
git tag v0.1.0
git push origin v0.1.0
```
各平台会自动下载并内置 mpv，用户无需自行安装。

## 🙏 致谢

- [mpv](https://mpv.io/) —— 强大的开源媒体播放器
- [uosc](https://github.com/tomasklaen/uosc) —— mpv 的现代化界面
- [Emby](https://emby.media/) · [Jellyfin](https://jellyfin.org/) —— 媒体服务器

---

<div align="center">由浮浮酱 ฅ'ω'ฅ 精心打造</div>
