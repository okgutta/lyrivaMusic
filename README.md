# lyrivaMusic

一款运行在 Spotify 桌面客户端中的 Spicetify 歌词扩展，提供更完整的歌词显示、翻译和沉浸式播放体验。

> [!IMPORTANT]
> 本项目基于 [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) 二次开发，并非 Spicy Lyrics 官方版本。

## 功能特性

- 支持逐字、逐行和静态歌词；
- 使用 LYRIVA 作为主要歌词来源，并可配置 Genius 作为静态歌词兜底；
- 支持歌词翻译与罗马音显示；
- 支持 Google 翻译、DeepSeek、OpenAI 和自定义 OpenAI 兼容接口；
- 提供动态背景、全屏歌词、画中画弹出歌词和正在播放视图歌词；
- 自动预取下一首歌曲的歌词，并在本机缓存歌词和翻译结果；
- 提供中文设置界面，可按需调整歌词、播放、背景和实验性功能。

## 使用要求

- Spotify 桌面客户端；
- 已安装并配置 [Spicetify](https://spicetify.app/)；
- Node.js 22；
- [Bun](https://bun.sh/)（依赖与持续集成均以 Bun 为准）。

lyrivaMusic 不是独立播放器，不能脱离 Spotify 和 Spicetify 单独运行。

## 安装

当前仓库未提供预编译安装包，需要从源码构建：

```bash
git clone https://github.com/okgutta/lyrivaMusic.git
cd lyrivaMusic
bun install --frozen-lockfile
bun run build
```

构建完成后，将 `dist/lyrivamusic.js` 复制到 Spicetify 的 `Extensions` 目录，然后执行：

```bash
spicetify config extensions lyrivamusic.js
spicetify apply
```

不同系统的扩展目录位置可参考 [Spicetify 扩展安装文档](https://spicetify.app/docs/customization/extensions#manual-installation)。

## 配置说明

安装完成后，可从 Spotify 菜单或歌词页右上角进入“lyrivaMusic 设置”。

- **歌词来源**：LYRIVA 无需额外配置；Genius 仅作为可选兜底，需要填写 Access Token。
- **歌词翻译**：Google 翻译无需 API Key；DeepSeek、OpenAI 和自定义接口需要填写对应的地址、模型或 API Key。
- **缓存管理**：可以清除当前歌曲、全部歌词或翻译缓存；过期和损坏的数据会自动清理。

API Key 以明文形式保存在本机的 Spicetify 设置中，仅在调用时发送给你选择的 Genius 或翻译服务商。请仅使用权限受限的专用密钥。

## 本地开发

```bash
# 启动开发模式并同步到 Spicetify
bun run dev

# 生成生产构建
bun run build

# 运行测试、代码检查、格式检查和类型检查
bun run check
```

歌词接口和缓存行为详见 [API 文档](docs/API.md)。

## 二次开发说明

lyrivaMusic 在 Spicy Lyrics 的基础上独立维护，当前主要调整包括中文设置界面、LYRIVA 歌词源、Genius 兜底、多种歌词翻译方式、歌词预取以及缓存管理。

感谢 [Spikerko](https://github.com/Spikerko) 和 [Spicy Lyrics 的贡献者](https://github.com/Spikerko/spicy-lyrics/graphs/contributors) 完成原始项目。使用中遇到 lyrivaMusic 的问题，请在本仓库反馈，不要向 Spicy Lyrics 官方寻求本项目的技术支持。

## 许可证

本项目依据 [GNU AGPL-3.0](LICENSE) 许可证开源。二次分发或继续修改时，请遵守许可证要求，并保留原项目的版权与归属说明。
