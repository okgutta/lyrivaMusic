# lyrivaMusic 歌词 API 文档

本文档描述 lyrivaMusic 当前的歌词获取管线、服务边界和缓存行为。

## 架构总览

lyrivaMusic 使用两级歌词来源：

1. **LYRIVA 主源**：内置 `https://api.lyriva.xyz`，通过 `/v1/lyrics` 一次请求获取最终歌词模型。
2. **Genius 兜底**：LYRIVA 未命中或暂时不可用时，使用用户在设置中配置的 Genius Access Token 搜索静态歌词；只接受 Matcher 判定为 HIGH/GOOD 的候选。

设置页不再提供 NCM、QQ、LRCLIB 或 LYRIVA 地址/Key 开关。Genius Token 仍可在「设置 → 歌词来源」中配置。

## LYRIVA 主源

```text
GET https://api.lyriva.xyz/v1/lyrics
```

查询参数：

- `title`：当前歌曲标题
- `artist`：艺人名称
- `album`：专辑名称（可选）
- `duration`：歌曲时长，单位秒（可选）
- `isrc`：ISRC（可选）

请求头：

```http
Authorization: Bearer <内置 Key>
Accept: application/json
```

成功响应的核心字段：

```json
{
  "data": {
    "track": { "title": "...", "artist": "..." },
    "plainLyrics": "...",
    "syncedLyrics": [{ "startMs": 1234, "text": "..." }],
    "translation": "..."
  },
  "meta": {
    "matchLevel": "HIGH_CONFIDENCE",
    "matchScore": 0.98
  }
}
```

客户端会校验歌词文本、时间戳和匹配元数据；不满足可信度要求的数据不会进入渲染或持久缓存。

## Genius 兜底

```text
搜索：GET https://api.genius.com/search?q={kw}&access_token={TOKEN}
歌词：GET https://genius.com/songs/<id>/embed.js
```

Genius Token 在 `genius.com/api-clients` 创建，并在设置面板中填写。歌词来自 Genius 静态歌词页面；客户端会清理段落标记、解码 embed.js 中的 JSON 字符串，并尝试多个高可信候选。

Genius 请求会区分以下状态：

- 未配置 Token：跳过 Genius 兜底
- 认证失败/限流/服务端错误：记录为可重试失败，不写 NO_LYRICS 负缓存
- 当前候选无可用歌词：继续尝试下一个合格候选

## 缓存与竞态保护

- 歌词缓存 key 为 Spotify track ID，模型同时保存完整 Spotify URI 与 Matcher 信息。
- 客户端启动和切歌时会在歌词页外预取当前歌曲；打开歌词页时优先使用内存缓存，避免再次等待网络。
- 请求使用 generation + `AbortController` 保护；切歌、关闭页面或新请求开始时，旧请求不能更新当前页面、全局 store 或缓存。
- `spotify:local:*`、非 track URI 和格式错误 URI 不会访问缓存或远端来源。
- LYRIVA 无歌词且 Genius 已明确执行并确认没有结果时，才写入 NO_LYRICS 负缓存。
- 缓存模型会在渲染前进行运行时结构校验。

## 翻译

翻译是独立管线，不属于歌词来源：

- Google 免费翻译
- DeepSeek
- ChatGPT
- 自定义 OpenAI 兼容 API

翻译缓存按 provider/track 维度隔离；切换 provider 或 API Key 会清理正在加载的模型列表并取消旧请求。
用户提供的 API Key 只会直连对应服务，不经过共享代理；自定义远程端点必须使用 HTTPS（本机回环地址除外）。

语言识别与安全的本地增强会在歌词首帧显示后运行。客户端不再动态执行远程罗马音脚本；优先使用歌词 API 自带的罗马音，仅西里尔文字使用随扩展打包的本地转换器补全。

## 开发命令

```bash
bun run dev
bun run build
bun run test
bun run lint
bun run typecheck
bun run check
```

构建产物为 `dist/lyrivamusic.js`。运行时仍保留历史 `/SpicyLyrics` 路由和 DOM/CSS namespace，以兼容已安装用户和 Spotify 页面结构。
