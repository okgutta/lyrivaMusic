<div align="center">

# lyrivaMusic

适用于 Spotify 桌面客户端的 Spicetify 歌词扩展

[![最新版本](https://img.shields.io/github/v/release/okgutta/lyrivaMusic?style=flat-square&color=1db954)](https://github.com/okgutta/lyrivaMusic/releases/latest)
[![构建检查](https://github.com/okgutta/lyrivaMusic/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/okgutta/lyrivaMusic/actions/workflows/ci.yml)
[![许可证](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue?style=flat-square)](LICENSE)

[功能特性](#功能特性) · [手动安装](#手动安装) · [配置](#配置) · [更新日志](#更新日志) · [反馈问题](https://github.com/okgutta/lyrivaMusic/issues)

</div>

lyrivaMusic 为 Spotify 提供同步歌词、逐字高亮、原文与译文显示，以及全屏、影院和独立歌词窗口。LYRIVA 歌词服务自动连接，无需申请或填写歌词 API Key。

本项目基于 [Spikerko / Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) 进行二次开发和长期维护，当前维护者为 [okgutta](https://github.com/okgutta)。本项目为社区扩展，与 Spotify 官方无隶属或合作关系，也不是 Spicy Lyrics 的官方发行版。

## 功能特性

| 功能           | 说明                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| 同步与逐字歌词 | 使用歌词源提供的字词时间轴连续高亮；缺少逐字数据时自动回退到逐行或静态歌词。 |
| 原文与译文     | 直接显示歌词源附带的译文，支持仅原文、仅译文和双语模式；可手动翻译缺失的行。 |
| 多种翻译服务   | 支持 Google 翻译、DeepSeek、OpenAI 和自定义 OpenAI 兼容接口。                |
| 阅读排版       | 调整歌词字号、译文相对大小和行距，双语模式支持译文在原文上方或下方。         |
| 多种显示方式   | 支持全屏、影院、紧凑布局和 Spotify 正在播放面板中的歌词卡片。                |
| 独立歌词窗口   | 在支持 Document Picture-in-Picture 的客户端中弹出歌词窗口。                  |
| 背景与控件     | 动态背景、封面背景，以及与歌词页统一的磨砂设置面板、工具栏和通知。           |
| 缓存与预取     | 本机保存歌词和翻译，预取当前歌曲与下一首歌词，支持查看、编辑和清理翻译缓存。 |
| 加载恢复       | 显示网络、超时或服务异常原因，支持重新获取和原位重试。                       |
| 自动更新       | 检测 GitHub 新正式版本，显示更新说明和下载进度，校验后重新加载启用。         |

逐字歌词和译文的可用性取决于歌曲与歌词源；独立窗口等功能也取决于 Spotify 客户端支持的能力。

## 界面预览

![lyrivaMusic 在 Spotify 中的歌词界面](docs/marketplace.png)

## Marketplace 安装

**正在准备 Spicetify Marketplace 发布，尚未确认正式收录。** 发布清单和界面预览已准备，仓库 Topic 尚待添加，Marketplace 客户端安装尚未实测。目前请使用下方的手动安装方式。

收录后，可在 Spotify 的 Marketplace → Extensions 中搜索 **lyrivaMusic**，核对维护者为 **okgutta** 后安装，并按提示重新加载。手动安装的用户应先移除原有的 Spicetify 扩展配置条目，再改用 Marketplace，避免同时启用两份。

维护者的官方发布规则和操作步骤见 [Marketplace 发布说明](docs/MARKETPLACE.md)。

## 手动安装

需要 **Spotify 桌面客户端**和已配置好的 **[Spicetify](https://spicetify.app/docs/getting-started/)**。使用发布包不需要安装 Node.js 或 Bun。

1. 从 [最新 Release 下载 `lyrivamusic.js`](https://github.com/okgutta/lyrivaMusic/releases/latest/download/lyrivamusic.js)，只需这一个文件。
2. 执行 `spicetify config-dir` 找到配置目录，将文件放进其中的 `Extensions` 文件夹。
3. 执行以下命令启用扩展：

   ```sh
   spicetify config extensions lyrivamusic.js
   spicetify apply
   ```

GitHub 自动生成的 `Source code (zip/tar.gz)` 是源码归档，不是安装包。

### 更新已有安装

**v1.3.0 起支持自动更新。** 检测到 GitHub 新正式版本后，Spotify 内会自动打开更新页，显示说明和下载进度。下载并校验完成后点击「重新加载」，或留到下次启动生效。也可以在「设置 → 高级 → 版本与更新」手动检查。

从 v1.2.0 或更早版本升级，或需要手动更新时，下载最新版 `lyrivamusic.js`，覆盖 `Extensions/lyrivamusic.js` 后执行 `spicetify apply`。后续普通更新无需重复安装；网络失败时继续使用原版本。

新版本 Release 仅提供 `lyrivamusic.js` 安装附件，自动更新组件由 `updates` 分支提供，无需手动下载，也不要将运行包作为另一份扩展启用。发布流程和恢复机制见 [自动更新文档](docs/UPDATES.md)。

如果旧版本使用了带版本号的文件名，请移除 Spicetify 配置中的旧条目，只启用一份 lyrivaMusic，避免重复加载。Spotify 更新后扩展未生效，可参考 [Spicetify 官方文档](https://spicetify.app/docs/getting-started/)重新应用。

## 配置

从歌词页工具栏的设置按钮，或 Spotify 菜单中的「lyrivaMusic 设置」进入设置面板。可以按分类浏览，也可以使用顶部搜索框查找选项。

| 分类 | 设置内容                                             |
| ---- | ---------------------------------------------------- |
| 外观 | 背景模式、图片模糊、播放面板动态背景与字体。         |
| 歌词 | 阅读排版、同步校准、歌词效果、窗口与卡片及备用来源。 |
| 翻译 | 翻译服务、目标语言、密钥、模型和并发数。             |
| 播放 | 媒体框尺寸、进度条位置、音量滑杆与歌词控制按钮位置。 |
| 缓存 | 查看和编辑翻译缓存，清理当前歌曲或全部歌词缓存。     |
| 高级 | 版本与更新、实验功能与开发者日志。                   |

### 歌词来源

LYRIVA 自动连接并匿名获取歌词，无需填写歌词 API Key。Genius 是可选的静态歌词备用来源，在「歌词 → 备用来源 → Genius 备用歌词」中填写 Access Token 后启用。

### 翻译服务

歌词源自带的译文会直接显示；只有点击歌词页翻译按钮时，才会请求所选服务补充缺失译文。

- Google 使用无需密钥的网页翻译接口，并非官方 Cloud Translation API。
- DeepSeek 和 OpenAI 需要对应服务的 API Key，可选择使用的模型。
- 自定义 OpenAI 兼容接口支持填写地址、密钥和模型。

凭据保存在本机 Spicetify 设置中。翻译密钥发送给所选服务，不经过共享代理。歌词请求路径、翻译处理和缓存细节见 [API 文档](docs/API.md)。

### 阅读与同步

在「歌词 → 阅读排版」通过加减按钮或直接输入百分比，调整歌词字号、译文大小和行距，各项均可单独重置。双语模式下还可以选择译文显示在原文上方或下方。设置即时生效并保存在本机。

在「歌词 → 同步校准 → 歌词同步偏移」调整歌词与音频的相对时间：负值提前歌词，正值延后歌词，不改变音频播放。

## 使用说明

1. 在 Spotify 中播放歌曲，点击播放栏的 **lyrivaMusic** 歌词按钮打开歌词页。
2. 将指针移到歌词页以显示工具栏，按需切换影院、全屏、翻译和信息栏，或打开设置。
3. 要同时阅读原文与译文，在「歌词 → 阅读排版 → 显示语言」选择「双语」；需要补充翻译时，再点击工具栏翻译按钮。
4. 要使用独立歌词窗口，先在「歌词 → 窗口与卡片」开启「弹出歌词窗口」，再通过播放栏的窗口按钮打开。
5. 歌词加载失败时点击「重试」；普通视图中未找到歌词时，可点击「重新获取」直接请求当前歌曲。

需要清理缓存时，在「缓存」分类中选择当前歌曲、全部歌词或翻译缓存。清理全部缓存需要再次点击确认。

遇到问题请提交到 [本仓库 Issues](https://github.com/okgutta/lyrivaMusic/issues)，并附上 Spotify、Spicetify 和扩展版本，以及可以复现问题的操作步骤。

## 更新日志

各版本的完整说明见 [GitHub Releases](https://github.com/okgutta/lyrivaMusic/releases)，已发布状态以 Release 页面为准。仓库中的版本说明：

- [v1.3.3](docs/releases/v1.3.3.md)：阅读排版、译文位置、玻璃控件与通知、加载失败提示和重试。
- [v1.3.2](docs/releases/v1.3.2.md)：更新页面、单文件安装附件、紧凑布局和歌词交互调整。
- [v1.3.1](docs/releases/v1.3.1.md)：新版 LYRIVA 请求的客户端名称。
- [v1.3.0](docs/releases/v1.3.0.md)：自动更新、运行包校验和启动回退。

## 致谢

lyrivaMusic 基于 **Spicy Lyrics** 进行二次开发。感谢原作者 **Spikerko** 与项目贡献者提供的基础实现。

- 原始项目：[Spikerko/spicy-lyrics](https://github.com/Spikerko/spicy-lyrics)
- 原作者：[Spikerko](https://github.com/Spikerko)
- 上游贡献者：[Spicy Lyrics 贡献者列表](https://github.com/Spikerko/spicy-lyrics/graphs/contributors)
- 扩展平台：[Spicetify](https://github.com/spicetify/cli)
- 当前维护：[okgutta](https://github.com/okgutta)

## 许可证

本项目沿用 [GNU Affero General Public License v3.0 或更新版本（AGPL-3.0-or-later）](LICENSE)。原始 Spicy Lyrics / Spikerko 的版权和归属声明予以保留。

修改或分发时，请遵守许可证并保留相应版权声明。[版权与第三方声明](NOTICE.md) 保留上游归属及 Spring 所用的 MIT 许可；其他第三方依赖及代码的许可要求以其各自声明为准。

## 本地开发与构建

开发环境使用 **Node.js 22+** 和 **[Bun](https://bun.sh/)**，依赖版本由 `bun.lock` 固定。

```sh
git clone https://github.com/okgutta/lyrivaMusic.git
cd lyrivaMusic
bun install --frozen-lockfile

# 开发模式，连接本机 Spicetify
bun run dev

# 测试、代码检查、格式与类型检查
bun run check

# 仅生成扩展文件，不复制到本机 Spicetify
bun run build --no-copy
```

安装产物位于 `dist/lyrivamusic.js`。`bun run build` 默认也会将产物复制到本机 Spicetify 扩展目录；CI 中自动跳过本机 Spicetify 操作。构建流程保持由 `spice.config.ts`、`scripts/build.mjs` 和现有 GitHub Actions 驱动。

构建生成的 `dist/manifest.json` 用于扩展自身的自动更新，包含运行包地址、大小和校验信息；它与仓库根目录的 Marketplace 展示清单是不同用途的文件，不应互相替换。

### 目录结构

```text
src/                  扩展源码、样式、类型与相邻测试
  components/         歌词页面、设置面板与 Spotify 集成
  shared/lyrics/      扩展使用的翻译处理工具
  updater/            更新检查、运行包校验和启动回退
  utils/Lyrics/       歌词获取、时间轴、渲染与翻译
scripts/              构建、测试与自动发布
project/config.ts     扩展名称与版本
spice.config.ts       Spicetify 扩展构建配置
manifest.json         Marketplace 展示与安装清单
NOTICE.md             上游归属与第三方许可声明
docs/MARKETPLACE.md   Marketplace 发布准备与核验步骤
docs/API.md           歌词接口、翻译和缓存说明
docs/UPDATES.md       自动更新与发布说明
docs/releases/        各版本更新说明
.github/workflows/    持续集成与 Release 发布
```

仓库仅维护 Spicetify 扩展。安装包通过 Releases 分发，自动更新组件通过 `updates` 分支分发；`dist/`、`node_modules/`、临时预览和本地备份不纳入版本管理。
