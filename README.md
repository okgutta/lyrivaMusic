<div align="center">

# lyrivaMusic

为 Spotify 桌面客户端提供逐字同步、双语阅读与沉浸式歌词体验。

[![最新版本](https://img.shields.io/github/v/release/okgutta/lyrivaMusic?style=flat-square&color=1db954)](https://github.com/okgutta/lyrivaMusic/releases/latest) [![构建检查](https://github.com/okgutta/lyrivaMusic/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/okgutta/lyrivaMusic/actions/workflows/ci.yml) [![许可证](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue?style=flat-square)](LICENSE)

**[下载安装](https://github.com/okgutta/lyrivaMusic/releases/latest/download/lyrivamusic.js)** · [安装指南](#安装) · [更新日志](https://github.com/okgutta/lyrivaMusic/releases) · [反馈问题](https://github.com/okgutta/lyrivaMusic/issues)

</div>

![lyrivaMusic 在 Spotify 中显示同步歌词与中文译文](docs/marketplace.png)

## 功能

| 功能       | 说明                                                         |
| ---------- | ------------------------------------------------------------ |
| 同步歌词   | 逐字高亮；缺少逐字数据时自动回退到逐行或静态歌词。           |
| 双语阅读   | 原文、译文、双语三种模式，可调整字号、行距及译文上下位置。   |
| 沉浸显示   | 全屏、影院、紧凑布局、正在播放面板歌词卡片与独立歌词窗口。   |
| 翻译与缓存 | 显示歌词源自带译文，按需补充翻译，支持缓存查看、编辑和清理。 |
| 自动更新   | 检测新正式版本，下载校验后重新加载启用，失败时保留原版本。   |

**LYRIVA 歌词服务自动连接，无需填写歌词 API Key。** 逐字歌词和译文取决于歌词源；独立窗口需要客户端支持 Document Picture-in-Picture。

## 安装

先安装 **Spotify 桌面客户端**并配置 **[Spicetify](https://spicetify.app/docs/getting-started/)**。

### Marketplace

在 Spotify 的 **Marketplace → Extensions** 中搜索 `lyrivaMusic`，找到维护者为 **okgutta** 的条目后安装，并按提示重新加载。若暂时搜不到，可使用下面的手动安装。

### 手动安装

1. 下载 **[lyrivamusic.js](https://github.com/okgutta/lyrivaMusic/releases/latest/download/lyrivamusic.js)**，只需这一个文件。
2. 运行 `spicetify config-dir`，将文件放入该目录下的 `Extensions` 文件夹。
3. 执行：

   ```sh
   spicetify config extensions lyrivamusic.js
   spicetify apply
   ```

安装包不需要 Node.js 或 Bun。切换安装方式时，请移除旧扩展条目，只启用一份 lyrivaMusic。

## 使用

播放歌曲后，点击 Spotify 播放栏的 **lyrivaMusic** 按钮打开歌词页。通过歌词页工具栏的齿轮进入设置，也可以从 Spotify 菜单打开「lyrivaMusic 设置」。设置顶部支持搜索。

| 想做什么                           | 在哪里调整                                   |
| ---------------------------------- | -------------------------------------------- |
| 调整字号、行距、译文位置或显示语言 | 歌词 → 阅读排版                              |
| 校准歌词时间                       | 歌词 → 同步校准；负值提前，正值延后          |
| 更换背景与字体                     | 外观                                         |
| 配置翻译服务                       | 翻译；设置好后点击歌词页翻译按钮补充缺失译文 |
| 查看、编辑或清理缓存               | 缓存                                         |
| 手动检查更新                       | 高级 → 版本与更新                            |

歌词源自带的译文会直接显示。需要补充翻译时，可选择 **Google、DeepSeek、OpenAI 或自定义 OpenAI 兼容接口**；其中 DeepSeek、OpenAI 需要对应服务的 API Key。

<details>
<summary>更多设置与常见问题</summary>

- **阅读排版**：通过加减按钮或直接输入百分比调整，各项可单独重置；设置即时生效并保存在本机。
- **独立歌词窗口**：在「歌词 → 窗口与卡片」开启「弹出歌词窗口」，再通过播放栏的窗口按钮打开。
- **备用歌词**：在「歌词 → 备用来源」配置 Genius Access Token，可启用静态歌词备用来源。
- **翻译接口**：Google 使用无需密钥的网页翻译接口；自定义 OpenAI 兼容服务支持配置地址、密钥和模型。密钥保存在本机，发送给所选服务，不经过共享代理。
- **加载失败**：点击歌词页的「重试」；未找到歌词时，可尝试「重新获取」。清理当前歌曲或全部缓存可在「缓存」中操作。
- **安装文件**：Release 中的 `lyrivamusic.js` 是安装包，`Source code (zip/tar.gz)` 是源码归档。
- **Spotify 更新后扩展未生效**：按 [Spicetify 官方说明](https://spicetify.app/docs/getting-started/)重新应用扩展。

提交问题时，请附上 Spotify、Spicetify 和扩展版本，以及复现步骤。

</details>

## 更新

**v1.3.0 起支持自动更新。** 检测到新正式版本后，扩展会打开更新页，显示说明和下载进度。校验完成后点击「重新加载」，或在下次启动 Spotify 时启用。

从 **v1.2.0 或更早版本**升级，或需要手动更新时，下载最新版 `lyrivamusic.js`，覆盖 `Extensions` 中的同名文件，再执行 `spicetify apply`。

[查看所有版本与更新说明 →](https://github.com/okgutta/lyrivaMusic/releases)

## 文档与开发

[歌词与翻译 API](docs/API.md) · [自动更新机制](docs/UPDATES.md) · [Marketplace 发布说明](docs/MARKETPLACE.md)

<details>
<summary>本地开发与构建</summary>

开发环境：**Node.js 22+** 和 **[Bun](https://bun.sh/)**。

```sh
git clone https://github.com/okgutta/lyrivaMusic.git
cd lyrivaMusic
bun install --frozen-lockfile

# 开发模式，连接本机 Spicetify
bun run dev

# 测试、代码检查、格式与类型检查
bun run check

# 构建扩展，不复制到本机 Spicetify
bun run build --no-copy
```

安装产物为 `dist/lyrivamusic.js`。`bun run build` 默认会复制到本机 Spicetify 扩展目录；CI 自动跳过本机操作。

源码位于 `src/`，构建与发布脚本位于 `scripts/`。安装包由 Releases 分发，自动更新组件由 `updates` 分支分发；依赖、构建产物和临时文件不纳入源码管理。

</details>

## 致谢与许可

lyrivaMusic 基于 **[Spikerko / Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics)** 进行二次开发，由 **[okgutta](https://github.com/okgutta)** 维护。感谢原作者、[上游贡献者](https://github.com/Spikerko/spicy-lyrics/graphs/contributors)及 [Spicetify](https://github.com/spicetify/cli) 提供的基础。

沿用 **[AGPL-3.0-or-later](LICENSE)**，保留上游版权声明；第三方许可见 **[NOTICE](NOTICE.md)**。这是独立维护的社区扩展，与 Spotify 官方无隶属关系。
