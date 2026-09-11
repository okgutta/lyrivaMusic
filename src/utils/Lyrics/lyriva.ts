// LYRIVA 歌词适配器：一次 GET 拿到「最终歌词」，完全替换内置多源搜索 → Matcher → 取词链。
//
// 契约（lyriva.xyz/docs#unified-api）：
//   GET {base}/lyriva/lyrics?title&artist&album&duration&isrc   （duration 单位：秒）
//   Authorization: Bearer <key>
//   成功：{ data: { provider, track, plainLyrics, syncedLyrics:[{startMs,text}], translation, … }, meta: { matchLevel, matchScore, … } }
//   失败：{ error: { code, message, requestId } }，HTTP 404/429/502/503/401…
//
// 本模块只负责「请求 → 分类」，映射逻辑在 lyrivaMap.ts（纯函数）。
// 无 key 直接 skipped，绝不发请求；负缓存由 fetchLyrics 按分类结果决定。
import Logger from "../Logger.ts";
import { getSpicetify } from "../getSpicetify.ts";
import { $lyrivaApiKey } from "../stores.ts";
import { buildLyrivaModelFromResponse } from "./lyrivaMap.ts";
import type { LyricsPayload, TargetTrack } from "./matcher.ts";

const lyrivaLogger = new Logger("LYRIVA");

// API Base URL 是公开端点，可以随客户端分发；API Key 必须由用户在设置中填写。
const LYRIVA_BASE_URL = "https://api.lyriva.xyz";

const TIMEOUT_MS = 15000;
const DEFAULT_PROXY_TEMPLATE = "https://cors-proxy.spicetify.app/{url}";
let directTransportSupported: boolean | null = null;

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

/** 读取 Spicetify 的可信 CORS 代理模板；仅在 API 不允许 Spotify Origin 时回退。 */
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

async function fetchLyriva(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const request = { credentials: "omit" as const, headers, signal };
  if (!getSpicetify()) return fetch(url, request);

  // 优先直连，避免 API Key 经过共享代理。服务端一旦允许 Spotify Origin，
  // 新启动的客户端会自动走这条路径；CORS 不允许时，本次会失败并缓存回退策略。
  if (directTransportSupported !== false) {
    try {
      const response = await fetch(url, request);
      directTransportSupported = true;
      return response;
    } catch (error) {
      if (signal.aborted) throw error;
      directTransportSupported = false;
    }
  }

  const proxyUrl = proxyTemplate().replace("{url}", url);
  return fetch(proxyUrl, request);
}

/** 传输：原生 fetch + 超时 + 外部 signal 合并 + UTF-8 强制解码。 */
async function getJson(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<RawResult> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchLyriva(url, headers, ctrl.signal);
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
  const key = $lyrivaApiKey.get().trim();
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
  const url = `${base}/lyriva/lyrics?${params.toString()}`;

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
