<div align="center">

# 🐱 NekoPlayer

**跨平台媒体播放器**

连接 Emby / Jellyfin 服务器，或直接浏览本机 / WebDAV / SMB / DLNA 文件源，
用你喜欢的外部播放器畅享影音、并可与 Trakt 同步观看记录喵～

[![Build](https://github.com/L51xyz12138/nekoplayer/actions/workflows/build.yml/badge.svg)](https://github.com/L51xyz12138/nekoplayer/actions)
[![Release](https://img.shields.io/github/v/release/L51xyz12138/nekoplayer)](https://github.com/L51xyz12138/nekoplayer/releases)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

</div>

## ✨ 特性

### 📚 媒体源
- **Emby / Jellyfin** —— 连接媒体服务器，多源聚合浏览、按服务器自带媒体库分类
- **文件浏览源** —— 本机文件夹 / WebDAV / SMB / DLNA，免登录直接扫描播放，支持文件夹层级浏览
- **IPTV 直播** —— 添加 M3U / TXT 直播清单（地址或本地文件），侧栏「直播」页以频道墙看电视频道，多源自动归并可切换、可选播放器
- **TMDB 刮削** —— 文件源的电影/剧集自动匹配海报、简介、评分、演职人员（填入 TMDB Key 即可）
- **智能整理** —— 分集自动聚合成剧集、系列电影（如指环王）按 TMDB 系列归成合集、可手动组成/解散/拆分

### ▶️ 播放
- **外部播放器** —— mpv / IINA / VLC / PotPlayer，本地解码**不转码**，NAS / 服务器零转码负载
- **自带 mpv** —— 内置 mpv（含 [uosc](https://github.com/tomasklaen/uosc) 现代界面 + 中文菜单 + 跳过片头片尾），开箱即用无需另装
- **音轨 / 字幕预选** —— 详情页直接选好音轨、字幕再播，不用进播放器切（mpv / VLC / IINA）；Emby / Jellyfin 服务器端外挂字幕也能预选
- **外挂字幕自动加载** —— 同名字幕（含 `影片.zh.srt`）自动挂载，WebDAV / DLNA 网络源也能识别；本机字幕单放子文件夹（sub/subs/subtitles）也自动扫到
- **在线字幕下载** —— 文件源详情页「在线字幕」，按片名从射手网（assrt）搜索下载、自动挂载（仅 mpv；已内置官方 Token 开箱即用，也可在设置填自己的）
- **整季连播** —— 剧集自动播放下一集
- **继续观看 + 续播** —— Emby / Jellyfin 与文件源都能记录进度，从上次位置接着看

### 🔗 Trakt 集成
- **自动同步观看记录** —— 用 mpv 播放时自动打点（scrobble），看完自动标记「已看」
- **想看 / 评分 / 收藏 / 推荐 / 观看历史** —— 在软件内查看你的 Trakt 列表与个性化推荐
- **一键回推** —— 详情页直接加入想看、加入收藏、给影片评分，写回 Trakt
- **观看统计** —— 「统计」页展示看过的电影 / 剧集、观看总时长、观看日历热力图、类型偏好、评分分布、常看演员

### 🎨 界面
- **沉浸式海报背景** —— 首页用当前精选海报、详情页整窗铺该片大海报（中间清晰、四周渐糊）、其它页氛围模糊背景，文字自动清晰化
- **自绘标题栏** —— 应用图标 + 名称在左上角，窗口按钮跟随主题配色、与内容拉通
- **精致 UI** —— 海报墙、精选推荐轮播（可换一批）、详情页、演职人员发现作品、多媒体源切换
- **多主题** —— 多种强调色 + 亮 / 暗 / 跟随系统
- **检查 / 自动更新** —— 软件内检查新版本；Windows / Linux 可直接在软件里下载并重启安装，macOS 一键前往下载
- **跨平台** —— Windows / macOS / Linux 桌面客户端

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
2. 选 **Emby / Jellyfin** 填服务器地址 + 账号密码；或选 **本机 / WebDAV / SMB / DLNA** 文件源填连接信息（免登录）；或选 **IPTV 直播** 填清单地址 / 选本地文件（免登录，进侧栏「直播」页）
3. 回到媒体库浏览影音，点 **播放**，或选 **mpv / IINA / VLC** 等按钮用指定播放器打开
4. 在 **设置** 里可配置：默认播放器、各播放器程序路径、主题色、字幕样式、**TMDB API Key**（文件源刮削）、**连接 Trakt**（观看记录同步）

> 💡 文件源要显示海报 / 信息，需在设置里填 TMDB v3 API Key（[免费申请](https://www.themoviedb.org/settings/api)）。
> Trakt 自动同步仅在用 **mpv** 播放时生效。

## 🛠️ 技术栈

Vue 3 · Vite · TypeScript · Vue Router · Electron

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
- [TMDB](https://www.themoviedb.org/) —— 影视元数据 · [Trakt](https://trakt.tv/) —— 观看记录同步
- 字幕服务由 [assrt.net](https://assrt.net)（射手网）提供 —— 在线字幕搜索下载

---

<div align="center">由浮浮酱 ฅ'ω'ฅ 精心打造</div>
