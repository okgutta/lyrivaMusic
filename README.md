# lyrivaMusic

lyrivaMusic 是一个面向 Spicetify 的歌词扩展，提供逐行、逐字和静态歌词显示，并包含下一首歌词预取、动态背景、罗马音、歌词翻译、全屏与弹出歌词等功能。

## 环境要求

- Node.js 22
- Bun（推荐，CI 与锁文件均以 Bun 为准）
- 已安装并配置好的 Spicetify

## 安装依赖

```bash
bun install --frozen-lockfile
```

如本机仅有 npm，也可以使用 `npm install` 进行本地开发，但提交依赖变更时应使用 Bun 更新并验证 `bun.lock`。

## 开发与构建

```bash
# 启动 Spicetify Creator 开发模式
bun run dev

# 生成生产构建
bun run build
```

构建产物位于 `dist/lyrivamusic.js`。开发或安装前请先确保 Spotify、Spicetify 和 Spicetify Creator 的本地环境可正常工作。

## 设置

安装扩展后，可从 Spotify 菜单或歌词页右上角打开“lyrivaMusic 设置”。主要配置包括：

- 歌词来源：LYRIVA 主源无需额外配置；Genius 仅作为可选兜底，需要 Access Token。
- 歌词翻译：支持 Google 免费翻译、DeepSeek、ChatGPT 和自定义 OpenAI 兼容接口。
- 显示与播放：可配置罗马音、歌词样式、全屏、弹出歌词和动态背景。

API Key 仅保存在本机设置中。自定义翻译接口应使用 HTTPS；仅本机回环地址允许 HTTP。

## 缓存

歌词和翻译结果会缓存在本机，以缩短再次播放时的等待时间。设置中的“缓存”页面可以：

- 清除当前歌曲缓存；
- 清除全部歌词缓存；
- 查看或清空翻译缓存。

缓存条目带有版本和有效期，过期、损坏或旧版本数据会在空闲时自动清理。

## 质量检查

```bash
# 单元测试、lint、格式和 TypeScript 检查
bun run check

# 也可以分别运行
bun run test
bun run lint
bun run fmt:check
bun run typecheck
```

CI 在 Node.js 22 环境下使用冻结的 Bun 锁文件执行完整检查和生产构建。

## 许可证

本项目采用 [GNU AGPL-3.0](LICENSE) 许可证。
