// LYRIVA 歌词适配器：一次 GET 拿到「最终歌词」，完全替换内置多源搜索 → Matcher → 取词链。
//
// 契约（status.lyriva.xyz/docs）：
//   GET {base}/v1/lyrics?title&artist&album&duration&isrc   （duration 单位：秒）
//   Authorization: Bearer <key>
//   成功：{ data: { provider, track, plainLyrics, syncedLyrics:[{startMs,text}], translation, … }, meta: { matchLevel, matchScore, … } }
//   失败：{ error: { code, message, requestId } }，HTTP 404/429/502/503/401…
//
// 本模块只负责「请求 → 分类」，映射逻辑在 lyrivaMap.ts（纯函数）。
// 无 key 直接 skipped，绝不发请求；负缓存由 fetchLyrics 按分类结果决定。
import Logger from "../Logger.ts";
import { getSpicetify } from "../getSpicetify.ts";
import { buildLyrivaModelFromResponse } from "./lyrivaMap.ts";
import type { LyricsPayload, TargetTrack } from "./matcher.ts";

const lyrivaLogger = new Logger("LYRIVA");

// ── 内置服务配置 ──────────────────────────────────────────────────────
// 地址与 API Key 随客户端分发，用户零配置。注意：Key 会进入产物 JS，
// 泄漏面等于分发面——仅适合自有/可控的 LYRIVA 服务。
const LYRIVA_BASE_URL = "https://api.lyriva.xyz";
const LYRIVA_API_KEY = "lk_live_VJPuGhJG4tYFvTbDPUy99HIf7kUWd-N_918HKHDKqGI";

const TIMEOUT_MS = 15000;
const DEFAULT_PROXY_TEMPLATE = "https://cors-proxy.spicetify.app/{url}";

class LyrivaTimeoutError extends Error {
  constructor() {
    super("LYRIVA 请求超时");
    this.name = "LyrivaTimeoutError";
  }
}

export type LyrivaResult =
  | { kind: "ok"; model: LyricsPayload }
  | { kind: "not-found" }
  | { kind: "unavailable"; reason: string }
  | { kind: "skipped" };

type RawResult = { status: number; json: unknown };

/**
 * 读取 spicetify 的 CORS 代理模板（与 spicetifyWrapper 内部一致）。
 * 关键：Spicetify 的 CosmosAsync 传输层会【丢弃第三方请求的自定义 header】
 * （其 GET 包装函数只接收 (url, body) 两个参数，Authorization 根本到不了上游）。
 * 因此这里不走 CosmosAsync，而是自己用原生 fetch 打代理 URL，显式带上
 * Authorization 头——代理会原样转发（已实测 proxy + Bearer → 200）。
 */
function proxyTemplate(): string {
  let value = DEFAULT_PROXY_TEMPLATE;
  try {
    value = globalThis.localStorage?.getItem("spicetify:corsProxyTemplate") ?? value;
  } catch {
    return DEFAULT_PROXY_TEMPLATE;
  }
  try {
    const parsed = new URL(value.replace("{url}", "https://api.lyriva.xyz"));
    if (parsed.protocol !== "https:" || parsed.hostname !== "cors-proxy.spicetify.app") {
      return DEFAULT_PROXY_TEMPLATE;
    }
    return value.includes("{url}") ? value : DEFAULT_PROXY_TEMPLATE;
  } catch {
    return DEFAULT_PROXY_TEMPLATE;
  }
}

/** 传输：原生 fetch + 超时 + 外部 signal 合并 + UTF-8 强制解码。 */
async function getJson(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<RawResult> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  // CEF 环境（存在 Spicetify）：第三方域名原生 fetch 会被 CORS 拦截，必须经代理；
  // Node 测试：直连即可。
  const finalUrl = getSpicetify() ? proxyTemplate().replace("{url}", url) : url;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(finalUrl, { headers, signal: ctrl.signal });
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buf);
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    return { status: res.status, json };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new LyrivaTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** 错误分类：权威无词 vs 可重试的不可用。 */
function classify(status: number, json: unknown, target: TargetTrack): LyrivaResult {
  const err = (json as any)?.error;
  const code = err?.code ?? err?.status ?? status;

  if (status === 404 || code === 404 || code === "LYRICS_NOT_FOUND") {
    return { kind: "not-found" };
  }
  if (
    status === 401 ||
    status === 403 ||
    code === 401 ||
    code === 403 ||
    code === "UNAUTHORIZED" ||
    code === "FORBIDDEN"
  ) {
    return { kind: "unavailable", reason: "LYRIVA 鉴权失败，请检查 API Key" };
  }
  if (status === 429 || code === 429 || code === "RATE_LIMITED") {
    return { kind: "unavailable", reason: "LYRIVA 请求限流（429）" };
  }
  if (status >= 500 || code === 502 || code === 503 || code === "PROVIDER_UNAVAILABLE") {
    return { kind: "unavailable", reason: `LYRIVA 服务端错误（${status || code}）` };
  }
  if (status !== 200) {
    return { kind: "unavailable", reason: `LYRIVA HTTP ${status}` };
  }
  const data = (json as any)?.data;
  if (!data || typeof data !== "object") {
    return { kind: "unavailable", reason: "LYRIVA 响应缺少 data" };
  }
  const model = buildLyrivaModelFromResponse(json, target);
  if (!model) return { kind: "not-found" };
  return { kind: "ok", model };
}

/**
 * 对外入口：读 key/base → 无 key skipped；有 key 发请求并分类。
 * 404/空词 → not-found（权威无歌词）；限流/超时/鉴权/服务端 → unavailable（不写负缓存，可重试）。
 */
export async function tryLyrivaLyrics(
  target: TargetTrack,
  signal?: AbortSignal
): Promise<LyrivaResult> {
  const key = LYRIVA_API_KEY.trim();
  if (!key) return { kind: "skipped" };
  const base = LYRIVA_BASE_URL;

  const params = new URLSearchParams();
  params.set("title", target.title || "");
  if (target.artists.length) params.set("artist", target.artists.join(" "));
  if (target.album) params.set("album", target.album);
  if (target.durationMs && target.durationMs > 0) {
    params.set("duration", String(Math.round(target.durationMs / 1000)));
  }
  if (target.isrc) params.set("isrc", target.isrc);
  const url = `${base}/v1/lyrics?${params.toString()}`;

  let raw: RawResult;
  try {
    raw = await getJson(
      url,
      { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal
    );
  } catch (err) {
    if (signal?.aborted) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "unavailable", reason: `LYRIVA 请求失败：${msg.slice(0, 80)}` };
  }
  if (signal?.aborted) throw new Error("aborted");

  try {
    return classify(raw.status, raw.json, target);
  } catch (err) {
    lyrivaLogger.warn("LYRIVA 响应解析失败", err);
    return { kind: "unavailable", reason: "LYRIVA 响应解析失败" };
  }
}
