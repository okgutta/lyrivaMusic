# 歌词 API 文档

Lyra（Spicy Lyrics）的歌词获取来源、接口与稳定性说明。

## 来源总览

| 来源 | 代码位置 | 曲库定位 | 是否需配置 | 稳定性 |
|---|---|---|---|---|
| 网易云音乐 | `src/utils/Lyrics/providers/ncm.ts` | 中文歌主力，自带中文翻译 | 否 | 受共享代理限流影响，时好时坏（自动熔断恢复） |
| QQ 音乐 | `src/utils/Lyrics/providers/qq.ts` | 补网易云版权缺口（如周杰伦），自带翻译 | 否 | 稳定 |
| Genius | `src/utils/Lyrics/providers/genius.ts` | 外文歌静态歌词 + 翻译覆盖 | 需 Token | 稳定 |
| LRCLIB | `src/utils/Lyrics/providers/lrclib.ts` | 开源歌词库，外文歌行级同步兜底 | 否 | 稳定 |

匹配策略：四家并行搜索候选 → 统一 Matcher 评分 → 选最高置信度；来源可单独禁用（设置 → 歌词来源）。

---

## 一、网易云音乐（NCM）

三条通道按顺序使用（搜索与歌词均如此），前一条无结果/失败才回退下一条：

### 1. 自建 API 服务器（可选，NeteaseCloudMusicApi 形态）

```
搜索  GET {base}/search?keywords={kw}&limit=20
歌词  GET {base}/lyric?id={id}
```

- **优点**：明文 JSON + 自带 CORS（`Access-Control-Allow-Origin: *`），完全绕开共享代理限流与 EAPI 加密，最稳定
- **配置**：设置 → 歌词来源 → “网易云 API 服务器”填地址（如 `http://denxero.l.cd`）
- 注：该入口当前已撤销待命，代码有底稿，需要可快速恢复

### 2. 老接口（默认优先）

```
搜索  GET https://music.163.com/api/search/get?type=1&s={kw}&limit=20
歌词  GET https://music.163.com/api/song/lyric?id={id}&lv=-1&kv=-1&tv=-1&yrc=1
```

- 明文 GET、无加密、快
- 网易云对其间歇性限流：返回 `{"code":500,"message":"请求失败"}` 或空结果

### 3. EAPI 加密接口（回退）

```
搜索  POST https://interface.music.163.com/eapi/search/song/list/page
歌词  POST https://interface.music.163.com/eapi/song/lyric/v1
```

- 请求体 AES-128-ECB 加密（`params=<大写HEX>`），`e_r=false` 时响应为明文 JSON
- 携带持久化设备指纹 Cookie（首次生成存 LocalStorage）
- **无需匿名注册**（实测搜索/歌词空 Cookie 即返回 `code:200`）
- 限流表现：空响应/429 → 设备指纹轮换重试 2 次 → **指数熔断**（30s→60s→120s→240s 递增，成功重置）

### 关键限制

网易云的两个 API 域名均**不返回 CORS 头**，浏览器直连会被拦截。Spicetify 的 CosmosAsync 对第三方域名强制经 `cors-proxy.spicetify.app` 公共代理转发——**该代理 IP 被网易云限流**，这是“时好时坏”的根源（全球 Spicetify 用户共享同一出口）。客户端无法绕开此传输层限制；自建 API 服务器是根治方案。

---

## 二、QQ 音乐

```
搜索  GET https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w={kw}&format=json&n=20&p=1
歌词  POST u.y.qq.com/cgi-bin/musicu.fcg（GetPlayLyricInfo，返回 base64 的 LRC + 翻译）
```

- 免费免登录，搜索接口固定返回 `callback(...)` JSONP 包装
- 国内曲库覆盖广，中文歌兜底主力

---

## 三、Genius

```
搜索  GET https://api.genius.com/search?q={kw}&access_token={TOKEN}
歌词  GET https://genius.com/songs/{id}/embed.js（歌词 HTML 藏在 JSON.parse 参数里）
```

- 需 Genius Access Token（genius.com/api-clients 获取，设置里配置）
- 外文歌为主

---

## 四、LRCLIB

```
搜索  GET https://lrclib.net/api/search?{params}
歌词  GET https://lrclib.net/api/get/{id}
```

- 开源、免费、无需 key、**支持 CORS**
- 外文歌行级同步的兜底

---

## 通用传输层

各 Provider 均遵循同一 HTTP 模式：

```text
原生 fetch（浏览器直连，CORS 允许时）
  ↓ 失败（CORS/网络）
Spicetify.CosmosAsync（桌面端经 cors-proxy.spicetify.app 代理，可访问任意第三方域名）
```

- 请求体加密：网易云用 AES-128-ECB + PKCS7（`src/utils/ncm/crypto.ts`，纯 JS 实现）
- 统一超时 15s、UTF-8 强制解码、abort 信号透传
- 歌词文本渲染全部走 `textContent`，无 XSS 风险

---

## 翻译（非歌词源，附注）

翻译走独立管线：DeepSeek（默认）/ ChatGPT / 自定义 OpenAI 兼容 API / Google 免费翻译（设置 → 歌词翻译切换）。缓存按服务维度隔离，切换服务自动重译。
