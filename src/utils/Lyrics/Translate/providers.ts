/**
 * 翻译 provider：多后端支持。
 *
 * 【LLM 后端】DeepSeek / ChatGPT / 自定义 API —— 全部走 OpenAI 兼容
 *   /chat/completions 接口，仅 baseUrl / Key / 模型不同，共用同一客户端：
 *  - 每 20 行一组，行首打上 `[[SPICY_TR_<nonce>_<i>]]` 标记拼成一段文本，
 *    按标记把响应切回逐行（标记丢失时回退按换行切分）；
 *  - 失败指数退避重试 2 次；桌面端 fetch 失败（CORS/网络）回退 Spicetify.CosmosAsync。
 *
 * 【Google 免费翻译】无需配置（非官方接口，来自 Google 网页翻译内部的
 *   translate-pa 端点）。批量按位置返回，天然与输入行对齐，无需标记。
 *   auth key 为 Google 网页公开 key，401/403 时从官方 JS 页面正则刷新重试。
 *
 * 未配置所选服务的 Key 时抛错，由调用方提示（不发送请求）。
 */

import Logger from "../../Logger.ts";
import {
  $customApiBaseUrl,
  $customApiKey,
  $customApiModel,
  $deepSeekApiKey,
  $deepSeekModel,
  $openaiApiKey,
  $openaiModel,
  $translationProvider,
} from "../../stores.ts";

const translateProviderLogger = new Logger("Translation Provider");

const CHUNK_SIZE = 20; // LLM 每请求行数（20 行足够对齐且降低出错面）
const GOOGLE_CHUNK_SIZE = 50; // Google 免费翻译每请求行数（按位置返回，可更大）
const PARALLEL_CHUNKS = 3; // 并发 chunk 数：串行太慢，全并发有 429 风险，3 路是安全折中
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

const MARKER_PREFIX = "[[SPICY_TR_";
const MARKER_REGEX = /\[\[\s*SPICY_TR_([A-Za-z0-9_]+)_(\d+)\s*\]\]/g;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 请求超时`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 目标语言代码 → 提示词里的语言名 */
const LANGUAGE_NAMES: Record<string, string> = {
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Portuguese",
  ru: "Russian",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  tr: "Turkish",
  it: "Italian",
  nl: "Dutch",
};

function languageName(targetLang: string): string {
  return LANGUAGE_NAMES[targetLang] || targetLang;
}

// ============================================================
// OpenAI 兼容客户端（DeepSeek / ChatGPT / 自定义 API 共用）
// ============================================================

export type ChatProviderId = "deepseek" | "openai" | "custom";

export interface ChatProviderConfig {
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 当前所选 LLM 后端的连接配置；未配置完整时返回 null */
export function getChatProviderConfig(): ChatProviderConfig | null {
  switch ($translationProvider.get()) {
    case "deepseek": {
      const apiKey = $deepSeekApiKey.get()?.trim() ?? "";
      if (!apiKey) return null;
      return {
        label: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        apiKey,
        model: $deepSeekModel.get() || "deepseek-chat",
      };
    }
    case "openai": {
      const apiKey = $openaiApiKey.get()?.trim() ?? "";
      if (!apiKey) return null;
      return {
        label: "ChatGPT",
        baseUrl: "https://api.openai.com/v1",
        apiKey,
        model: $openaiModel.get() || "gpt-4o-mini",
      };
    }
    case "custom": {
      let baseUrl = $customApiBaseUrl.get()?.trim() ?? "";
      const apiKey = $customApiKey.get()?.trim() ?? "";
      const model = $customApiModel.get()?.trim() ?? "";
      if (!baseUrl || !apiKey || !model) return null;
      baseUrl = baseUrl.replace(/\/+$/, "");
      return { label: "自定义 API", baseUrl, apiKey, model };
    }
    default:
      return null;
  }
}

/** 所选翻译服务是否已可使用（Google 免费，无需配置） */
export function hasTranslationProviderConfig(): boolean {
  if ($translationProvider.get() === "google") return true;
  return getChatProviderConfig() !== null;
}

/** 从 GET /models 的响应里提取去重后的模型 id 列表 */
function extractModelIds(payload: any): string[] {
  if (!Array.isArray(payload?.data)) return [];
  const ids: string[] = payload.data
    .map((m: any) => (m && typeof m.id === "string" ? m.id : ""))
    .filter((id: string) => id.length > 0);
  return [...new Set(ids)];
}

/** 从所选 LLM 后端拉取可用模型列表（GET /models），失败抛错 */
export async function fetchModelsForProvider(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const config = getChatProviderConfig();
  if (!config) throw new Error("请先完整配置当前翻译服务");
  const headers = { Authorization: `Bearer ${apiKey || config.apiKey}` };

  try {
    const res = await fetch(`${config.baseUrl}/models`, { headers, signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ids = extractModelIds(await res.json());
    if (!ids.length) throw new Error("模型列表为空");
    return ids;
  } catch (err) {
    if (!isCorsOrNetworkError(err)) throw err;
    const cosmos = (globalThis as any).Spicetify?.CosmosAsync;
    if (cosmos?.get) {
      const data = await withTimeout(
        cosmos.get(`${config.baseUrl}/models`, undefined, headers),
        REQUEST_TIMEOUT_MS,
        `${config.label} 模型列表`
      );
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      const ids = extractModelIds(parsed);
      if (ids.length) return ids;
    }
    throw err;
  }
}

/** 清洗单行：去标记 / ``` / 编号 / "Here's the translation" 等包装残留 */
function cleanLine(text: string): string {
  return (text || "")
    .replace(MARKER_REGEX, "")
    .replace(/```[a-z0-9_-]*/gi, "")
    .replace(/^\s*\d+[.)、]\s*/g, "")
    .replace(/^\s*(here('|')?s|here is|here are|sure[,!. ]|translation:?|translated lyrics:?|翻译如下[:：]?|译文[:：]?)\s*/i, "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMarkerPayload(lines: string[], nonce: string): string {
  return lines.map((line, i) => `${MARKER_PREFIX}${nonce}_${i}]]${line}`).join("\n");
}

/** 按标记把响应切回逐行 */
function parseMarkedResponse(text: string, expectedCount: number, nonce: string): string[] | null {
  const markerRegex = new RegExp(`\\[\\[SPICY_TR_${nonce}_(\\d+)\\]\\]`, "g");
  const matches: Array<{ index: number; start: number; markerEnd: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(text)) !== null) {
    matches.push({
      index: Number.parseInt(match[1], 10),
      start: match.index,
      markerEnd: markerRegex.lastIndex,
    });
  }

  if (matches.length !== expectedCount) return null;

  const seen = new Set<number>();
  const byIndex = Array.from({ length: expectedCount }, () => "");

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    if (current.index < 0 || current.index >= expectedCount || seen.has(current.index)) return null;
    seen.add(current.index);
    const segment = text.slice(current.markerEnd, next ? next.start : text.length);
    byIndex[current.index] = cleanLine(segment);
  }

  return seen.size === expectedCount ? byIndex : null;
}

/** 标记丢失时回退：按换行切分 */
function parseLineFallback(text: string, expectedCount: number): string[] | null {
  const lines = text
    .split(/\r?\n+/)
    .map((line) => cleanLine(line))
    .filter(Boolean);
  return lines.length === expectedCount ? lines : null;
}

function isCorsOrNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const message = err instanceof Error ? err.message : String(err || "");
  return /failed to fetch|networkerror|cors|load failed|超时/i.test(message);
}

/** fetch 优先，CORS/网络失败回退 CosmosAsync（桌面端走 spicetify 代理） */
async function postChatCompletions(
  config: ChatProviderConfig,
  body: unknown,
  signal?: AbortSignal
): Promise<any> {
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const url = `${config.baseUrl}/chat/completions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`${config.label} API HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (!isCorsOrNetworkError(err)) throw err;
    const cosmos = (globalThis as any).Spicetify?.CosmosAsync;
    if (cosmos?.post) {
      const data = await withTimeout(
        cosmos.post(url, body, headers),
        REQUEST_TIMEOUT_MS,
        config.label
      );
      return typeof data === "string" ? JSON.parse(data) : data;
    }
    throw err;
  }
}

async function translateChunk(
  config: ChatProviderConfig,
  chunk: string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<string[]> {
  activeSession.apiCalls += 1;

  const nonce = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const payload = buildMarkerPayload(chunk, nonce);

  const systemPrompt =
    `You are a professional song lyrics translator. Translate each line of the lyrics into ` +
    `${languageName(targetLang)}. Rules: ` +
    `1) Output ONLY the translated lines, one line per input line, preserving the exact order and line count; ` +
    `2) Never include the [[SPICY_TR_...]] markers, numbering, explanations, or code fences in the output; ` +
    `3) Keep the poetic feel and rhythm where possible.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const model = config.model;
    // deepseek-reasoner 的 reasoning 计入 max_tokens，预算要更大，否则长 chunk 可能截断
    const isReasoner = model === "deepseek-reasoner";
    const payloadLen = chunk.join(" ").length;
    const maxTokens = Math.max(payloadLen * (isReasoner ? 6 : 4), isReasoner ? 8192 : 2048);

    const data = await postChatCompletions(
      config,
      {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: payload },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      },
      controller.signal
    );

    // 记录 token 用量（OpenAI 兼容的 usage）
    const usage = data?.usage;
    if (usage && typeof usage === "object") {
      if (typeof usage.prompt_tokens === "number") activeSession.inputTokens += usage.prompt_tokens;
      if (typeof usage.completion_tokens === "number") activeSession.outputTokens += usage.completion_tokens;
      if (typeof usage.total_tokens === "number") activeSession.totalTokens += usage.total_tokens;
    }

    const translated = data?.choices?.[0]?.message?.content?.trim();
    if (!translated) throw new Error(`${config.label} 返回空结果`);

    const parsed =
      parseMarkedResponse(translated, chunk.length, nonce) ??
      parseLineFallback(translated, chunk.length);
    if (!parsed) {
      // 不可解析：抛错走重试；重试仍失败 → 计入 failedChunks，调用方
      // 标记不完整以便下次重试。原样返回会被当成完整结果缓存，缺失行
      // 之后永不重试。
      throw new Error(`${config.label} 响应无法按行解析`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** 4xx（除 408/429）为确定性错误，重试无意义（如 Key 无效、模型不存在） */
function isRetryableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  const match = message.match(/HTTP (\d{3})/);
  if (match) {
    const status = Number(match[1]);
    return status >= 500 || status === 408 || status === 429;
  }
  return true; // 网络 / 超时 / 解析等 → 可重试
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // 取消后不再退避重试（切歌/关闭翻译时省网络消耗）
    if (signal?.aborted) throw new Error("aborted");
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err)) throw err;
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

/** 单次 translateLines 调用的用量统计 */
export interface TranslateMetrics {
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** 重试后仍失败的 chunk 数（>0 表示本次翻译不完整，调用方应标记以便下次重试） */
  failedChunks: number;
}

const activeSession: TranslateMetrics = { apiCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, failedChunks: 0 };

// ============================================================
// Google 免费翻译（非官方 translate-pa 端点，按位置返回）
// ============================================================

const GOOGLE_TRANSLATE_URL = "https://translate-pa.googleapis.com/v1/translateHtml";
// Google 网页翻译自身使用的公开 key；401/403 时从官方 JS 页面刷新
const GOOGLE_DEFAULT_AUTH_KEY = "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520";
const GOOGLE_JS_PAGE =
  "https://translate.googleapis.com/_/translate_http/_/js/k=translate_http.tr.zh_CN.xQDQL-zBfUc.O/am=ACA/d=1/exm=el_conf/ed=1/rs=AN8SPfq926FSxeFN_C5CEBNv9zTcTCAKGA/m=el_main";

let googleAuthKey: string | null = null;

async function refreshGoogleAuthKey(): Promise<string> {
  const res = await fetch(GOOGLE_JS_PAGE);
  const text = await res.text();
  const match = text.match(/"X-goog-api-key"\s*:\s*"(\w{39})"/);
  if (!match) throw new Error("无法从 Google 页面刷新 auth key");
  googleAuthKey = match[1];
  translateProviderLogger.info("Google auth key 已刷新");
  return googleAuthKey;
}

async function googlePost(
  texts: string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<string[]> {
  const key = googleAuthKey ?? GOOGLE_DEFAULT_AUTH_KEY;
  const res = await fetch(GOOGLE_TRANSLATE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json+protobuf",
      "X-goog-api-key": key,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      accept: "*/*",
    },
    body: JSON.stringify([[texts, "auto", targetLang], "te"]),
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    // key 过期/失效：刷新后由调用方重试一次
    try {
      await refreshGoogleAuthKey();
    } catch {
      /* 刷新失败保留原错误 */
    }
    throw new Error(`Google 翻译 HTTP ${res.status}（auth 已刷新，可重试）`);
  }
  if (!res.ok) throw new Error(`Google 翻译 HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.[0];
  if (!Array.isArray(out)) throw new Error("Google 翻译响应格式异常");
  return out.map((t: unknown) => (typeof t === "string" ? t : ""));
}

async function googleTranslateChunk(
  chunk: string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<string[]> {
  activeSession.apiCalls += 1;
  let result = await googlePost(chunk, targetLang, signal);
  // auth key 失效 → 刷新后重试一次
  if (result.some((t: string) => /HTTP 40[13]/.test(t))) {
    result = await googlePost(chunk, targetLang, signal);
  }
  if (result.length !== chunk.length) {
    throw new Error(`Google 翻译返回行数不匹配（${result.length}/${chunk.length}）`);
  }
  return result.map((t: string) => cleanLine(t));
}

// ============================================================
// translateLines：按 provider 分流
// ============================================================

/**
 * 批量翻译。返回与输入等长的行数组 + 本次调用的用量统计。
 * LLM 后端：失败的行原样返回（不抛错中断整首），失败 chunk 数计入 metrics.failedChunks。
 */
export async function translateLines(
  lines: string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<{ lines: string[]; metrics: TranslateMetrics }> {
  activeSession.apiCalls = 0;
  activeSession.inputTokens = 0;
  activeSession.outputTokens = 0;
  activeSession.totalTokens = 0;
  activeSession.failedChunks = 0;

  const results = [...lines];
  const provider = $translationProvider.get();

  // ---- Google 免费翻译：按位置返回，无需标记 ----
  if (provider === "google") {
    const jobs: Array<{ start: number; chunk: string[] }> = [];
    for (let start = 0; start < lines.length; start += GOOGLE_CHUNK_SIZE) {
      jobs.push({ start, chunk: lines.slice(start, start + GOOGLE_CHUNK_SIZE) });
    }
    let next = 0;
    const workers = Array.from({ length: Math.min(PARALLEL_CHUNKS, jobs.length) }, async () => {
      while (next < jobs.length) {
        if (signal?.aborted) return;
        const { start, chunk } = jobs[next++];
        try {
          const translated = await retryWithBackoff(
            () => googleTranslateChunk(chunk, targetLang, signal),
            signal
          );
          translated.forEach((text, i) => {
            if (text && text !== chunk[i]) results[start + i] = text;
          });
        } catch (err) {
          activeSession.failedChunks += 1;
          translateProviderLogger.warn("Google 翻译批次失败，保留原文:", err);
        }
      }
    });
    await Promise.all(workers);
    return { lines: results, metrics: { ...activeSession } };
  }

  // ---- LLM 后端（DeepSeek / ChatGPT / 自定义）----
  const config = getChatProviderConfig();
  if (!config) {
    throw new TranslationConfigError("请先在设置中配置当前翻译服务的 API Key");
  }
  translateProviderLogger.info(`翻译后端: ${config.label} (${config.model})`);

  // 预切 chunk（含起始下标，结果写回对应位置）
  const jobs: Array<{ start: number; chunk: string[] }> = [];
  for (let start = 0; start < lines.length; start += CHUNK_SIZE) {
    jobs.push({ start, chunk: lines.slice(start, start + CHUNK_SIZE) });
  }

  // 并发 worker 池：最多 PARALLEL_CHUNKS 个 chunk 同时在途
  let next = 0;
  const workers = Array.from({ length: Math.min(PARALLEL_CHUNKS, jobs.length) }, async () => {
    while (next < jobs.length) {
      if (signal?.aborted) return;
      const { start, chunk } = jobs[next++];
      try {
        const translated = await retryWithBackoff(
          () => translateChunk(config, chunk, targetLang, signal),
          signal
        );
        translated.forEach((text, i) => {
          if (text && text !== chunk[i]) results[start + i] = text;
        });
      } catch (err) {
        // 该组失败：保留原文，不中断整首，但记录失败以便上层重试
        activeSession.failedChunks += 1;
        translateProviderLogger.warn("翻译批次失败，保留原文:", err);
      }
    }
  });

  await Promise.all(workers);

  return { lines: results, metrics: { ...activeSession } };
}

/** 所选服务配置不完整的可识别错误（index.ts 按此提示用户） */
export class TranslationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationConfigError";
  }
}
