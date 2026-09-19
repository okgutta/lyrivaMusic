<div align="center">

# lyrivaMusic

**在 Spotify 里，跟着每一个字听歌。**

适用于 Spotify 桌面客户端的 Spicetify 歌词扩展

[![Release](https://img.shields.io/github/v/release/okgutta/lyrivaMusic?style=flat-square&color=1db954)](https://github.com/okgutta/lyrivaMusic/releases/latest)
[![CI](https://github.com/okgutta/lyrivaMusic/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/okgutta/lyrivaMusic/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)

[下载安装](#安装) · [功能一览](#功能) · [设置指南](#设置) · [开发文档](docs/API.md) · [反馈问题](https://github.com/okgutta/lyrivaMusic/issues)

</div>

---

lyrivaMusic 自动获取歌词，让逐字高亮、原文与译文和专辑背景融入 Spotify。歌词服务开箱即用，无需申请或填写 LYRIVA API Key。

基于 [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) 二次开发、独立维护，非上游官方版本。

## 功能

|                  | 体验                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| **逐字歌词**     | 使用歌词源提供的字词时间轴连续高亮；缺少逐字数据时自动回退到逐行或静态歌词。 |
| **原文与译文**   | 自动显示歌词源附带的译文，支持原文、译文、双语切换；可手动翻译缺失的行。     |
| **多种翻译服务** | 支持 Google 翻译、DeepSeek、OpenAI 和自定义 OpenAI 兼容接口。                |
| **沉浸式阅读**   | 动态背景、封面背景、全屏与影院模式，以及正在播放面板歌词。                   |
| **歌词窗口**     | 在支持 Document Picture-in-Picture 的客户端中弹出独立歌词窗口。              |
| **缓存与预取**   | 本机保存歌词和翻译，预取当前歌曲与下一首歌词，减少重复等待。                 |
| **简洁设置**     | 中性磨砂玻璃面板，支持搜索、歌词同步校准和播放布局调整。                     |

逐字歌词和译文的可用性取决于歌曲与歌词源。语言学习中的逐词对照由整行译文推断，仅供参考。

## 安装

需要 **Spotify 桌面客户端**和已配置好的 **[Spicetify](https://spicetify.app/docs/getting-started/)**。使用发布包不需要安装 Node.js 或 Bun。

1. 从 [Releases 下载最新版 `lyrivamusic.js`](https://github.com/okgutta/lyrivaMusic/releases/latest/download/lyrivamusic.js)。
2. 执行 `spicetify config-dir` 找到配置目录，将文件放进其中的 `Extensions` 文件夹。
3. 执行以下命令启用扩展：

   ```sh
   spicetify config extensions lyrivamusic.js
   spicetify apply
   ```

启动 Spotify 后，从歌词页工具栏的设置按钮或 Spotify 菜单进入 **lyrivaMusic 设置**。

### 更新

下载新版本，覆盖 `Extensions/lyrivamusic.js`，再执行 `spicetify apply`。

如果旧版本使用了带版本号的文件名，请移除 Spicetify 配置中的旧条目，只启用一份 lyrivaMusic，避免重复加载。Spotify 更新后扩展未生效，可参考 [Spicetify 官方文档](https://spicetify.app/docs/getting-started/)重新应用。

## 设置

| 分类     | 可以调整什么                                                               |
| -------- | -------------------------------------------------------------------------- |
| **外观** | 背景模式、图片模糊、播放面板动态背景与字体。                               |
| **歌词** | 原文/译文显示、同步偏移、歌词效果、窗口与卡片、Genius 备用歌词及语言学习。 |
| **翻译** | 翻译服务、目标语言、密钥、模型和并发数。                                   |
| **播放** | 媒体框尺寸、进度条位置、音量滑杆与歌词控制按钮位置。                       |
| **缓存** | 查看和编辑翻译缓存，清理当前歌曲或全部歌词缓存。                           |
| **高级** | 实验功能与开发者日志。                                                     |

**歌词来源**：LYRIVA 自动连接、匿名获取。Genius 是可选的静态歌词兜底，在「歌词 → Genius 备用歌词」中填写 Access Token 后启用。

**翻译服务**：Google 使用无需密钥的网页翻译接口，非官方 Cloud Translation API；DeepSeek 和 OpenAI 需要对应服务的 API Key；自定义接口支持填写地址、密钥与模型。歌词源自带的译文会直接显示，点击歌词页翻译按钮可补充缺失译文。

**同步校准**：在「歌词 → 歌词同步偏移」调整；负值提前歌词，正值延后歌词，不改变音频播放。

凭据保存在本机 Spicetify 设置中。翻译密钥直连所选服务，不经过共享代理；歌词请求路径和缓存细节见 [API 文档](docs/API.md)。

## 本地开发

开发环境使用 **Node.js 22+** 和 **[Bun](https://bun.sh/)**，依赖版本由 `bun.lock` 固定。

```sh
git clone https://github.com/okgutta/lyrivaMusic.git
cd lyrivaMusic
bun install --frozen-lockfile

# 开发模式，连接本机 Spicetify
bun run dev

# 测试、lint、格式与类型检查
bun run check

# 仅生成扩展文件，不复制到本机 Spicetify
bun run build --no-copy
```

产物位于 `dist/lyrivamusic.js`。`bun run build` 默认也会将产物复制到本机 Spicetify 扩展目录；CI 中自动跳过本机 Spicetify 操作。

### 目录结构

```text
src/                  扩展源码、样式、类型与相邻测试
  components/         歌词页面、设置面板与 Spotify 集成
  shared/lyrics/      扩展使用的翻译与逐词对照算法
  utils/Lyrics/       歌词获取、时间轴、渲染与翻译
scripts/tests.mjs     扩展测试入口
project/config.ts    扩展名称与版本
docs/API.md          歌词接口、翻译和缓存说明
.github/workflows/   持续集成
```

仓库仅维护 Spicetify 扩展。构建产物通过 Releases 分发；`dist/`、`node_modules/`、临时预览和本地备份不纳入版本管理。

## 致谢与许可证

感谢 [Spikerko](https://github.com/Spikerko) 与 [Spicy Lyrics 的贡献者](https://github.com/Spikerko/spicy-lyrics/graphs/contributors) 提供原始实现，感谢 [Spicetify](https://github.com/spicetify/cli) 提供扩展平台。

lyrivaMusic 的问题请提交到[本仓库 Issues](https://github.com/okgutta/lyrivaMusic/issues)。

本项目以 [GNU AGPL-3.0](LICENSE) 开源。修改或分发时，请遵守许可证并保留原项目的版权与归属说明。
