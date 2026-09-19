/**
 * 翻译 provider：多后端支持。
 *
 * 【LLM 后端】DeepSeek / ChatGPT / 自定义 API —— 全部走 OpenAI 兼容
 *   /chat/completions 接口，仅 baseUrl / Key / 模型不同，共用同一客户端：
 *  - 按行数动态分块（每块不超过 20 行，并发数可在设置里调，默认 3），
 *    行首打上 `[[SPICY_TR_<nonce>_<i>]]` 标记拼成一段文本，按标记切回逐行
 *    （标记丢失时回退按换行切分）；
 *  - 个别行漏标记时只补发这几行；整块失败则降级为逐行重发；
 *  - 失败重试 2 次，优先遵守服务端 Retry-After，否则线性退避；
 *    所有请求经全局最小间隔闸门放行，避免并发触发限流；
 *    请求仅直连 HTTPS（本机回环地址可用 HTTP），
 *    用户 API Key 不会经过共享代理。
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
  $translationConcurrency,
  $translationProvider,
} from "../../stores.ts";
import { normalizeApiBaseUrl } from "./url.ts";
import {
  cleanLine,
  buildMarkerPayload,
  parseMarkedResponsePartial,
  parseLineFallback,
} from "../../../shared/lyrics/translationProtocol.ts";
import { parseRetryAfterMs } from "../../../shared/lyrics/retryAfter.ts";
import { planChunks } from "../../../shared/lyrics/chunkPlan.ts";

const translateProviderLogger = new Logger("Translation Provider");

const CHUNK_SIZE = 20; // LLM 每请求行数上限（再多容易截断或丢标记）
const GOOGLE_CHUNK_SIZE = 50; // Google 免费翻译每请求行数上限（按位置返回，可更大）
const MIN_PARALLEL_LINES = 12; // 短歌词拆并发只会增加请求数，不值得
const TARGET_LINES_PER_CHUNK = 8; // 拆并发时期望的每块行数
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 6;
const MIN_REQUEST_INTERVAL_MS = 100; // 全局最小请求间隔，抑制并发 worker 触发 429
const MAX_RETRY_DELAY_MS = 15000; // 服务端 Retry-After 超过此值就不值得再等，直接交给上层
const MAX_BLANK_REPAIRS_PER_CHUNK = 8; // 单 chunk 内空行定点补译上限，超过说明整块不可靠
const MAX_LINE_FALLBACKS_PER_RUN = 60; // 单次 translateLines 内整块失败后逐行补译的行数上限
const MAX_GOOGLE_SPLITS_PER_RUN = 8; // 单次 translateLines 内 Google 分半重试的额外请求上限

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 携带 HTTP 状态与 Retry-After 的请求错误，重试策略据此决定退避时长 */
class ProviderHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// 全局请求闸门：并发 worker 的请求按最小间隔依次放行，避免同一服务端瞬间被打爆
let gateTail: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

async function throttleRequest(signal?: AbortSignal): Promise<void> {
  const queued = gateTail.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait, signal);
    lastRequestAt = Date.now();
  });
  // 队尾吞掉异常，单个请求被取消/失败不影响后续排队者
  gateTail = queued.catch(() => {});
  await queued;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  label: string,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const externalSignal = init.signal;
  // 限速排队不计入请求超时，否则排队长的请求会误报超时
  await throttleRequest(externalSignal ?? undefined);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut && !externalSignal?.aborted) throw new Error(`${label} 请求超时`);
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

/** 取出响应头里的 Retry-After（秒或 HTTP-date），不可用时返回 null */
function retryAfterOf(res: Response): number | null {
  return parseRetryAfterMs(res.headers.get("retry-after"));
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

interface ChatProviderConfig {
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 当前所选 LLM 后端的连接配置；未配置完整时返回 null */
function getChatProviderConfig(): ChatProviderConfig | null {
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
      const baseUrl = normalizeApiBaseUrl($customApiBaseUrl.get() ?? "");
      const apiKey = $customApiKey.get()?.trim() ?? "";
      const model = $customApiModel.get()?.trim() ?? "";
      if (!baseUrl || !apiKey || !model) return null;
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
export async function fetchModelsForProvider(
  apiKey: string,
  signal?: AbortSignal
): Promise<string[]> {
  const config = getChatProviderConfig();
  if (!config) throw new Error("请先完整配置当前翻译服务");
  const headers = { Authorization: `Bearer ${apiKey || config.apiKey}` };
  const res = await fetchWithTimeout(
    `${config.baseUrl}/models`,
    { headers, signal },
    `${config.label} 模型列表`
  );
  if (!res.ok) throw new Error(`${config.label} 模型列表 HTTP ${res.status}`);
  const ids = extractModelIds(await res.json());
  if (!ids.length) throw new Error("模型列表为空");
  return ids;
}

/** Direct request only: user credentials must never transit a shared proxy. */
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

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    },
    config.label
  );
  if (!res.ok) {
    throw new ProviderHttpError(
      `${config.label} API HTTP ${res.status}`,
      res.status,
      retryAfterOf(res)
    );
  }
  return await res.json();
}

/** 单次请求：打标记、调用、按标记回切（允许部分标记缺失，空位留空串） */
async function requestChunkTranslation(
  config: ChatProviderConfig,
  chunk: string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<string[]> {
  const nonce = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const payload = buildMarkerPayload(chunk, nonce);

  const systemPrompt =
    `You are a professional song lyrics translator. Translate each line of the lyrics into ` +
    `${languageName(targetLang)}. Rules: ` +
    `1) Output ONLY the translated lines, one line per input line, preserving the exact order and line count; ` +
    `2) Never include the [[SPICY_TR_...]] markers, numbering, explanations, or code fences in the output; ` +
    `3) Keep the poetic feel and rhythm where possible.`;

  const model = config.model;
  // deepseek-reasoner 的 reasoning 计入 max_tokens，预算要更大，否则长 chunk 可能截断
  const isReasoner = model === "deepseek-reasoner";
  const payloadLen = chunk.join(" ").length;
  const maxTokens = Math.max(payloadLen * (isReasoner ? 6 : 4), isReasoner ? 8192 : 2048);

  activeSession.apiCalls += 1;
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
    signal
  );

  // 记录 token 用量（OpenAI 兼容的 usage）
  const usage = data?.usage;
  if (usage && typeof usage === "object") {
    if (typeof usage.prompt_tokens === "number") activeSession.inputTokens += usage.prompt_tokens;
    if (typeof usage.completion_tokens === "number")
      activeSession.outputTokens += usage.completion_tokens;
    if (typeof usage.total_tokens === "number") activeSession.totalTokens += usage.total_tokens;
  }

  const translated = data?.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error(`${config.label} 返回空结果`);

  const parsed =
    parseMarkedResponsePartial(translated, chunk.length, nonce) ??
    parseLineFallback(translated, chunk.length);
  if (!parsed) {
    // 不可解析：抛错走重试；重试仍失败 → 计入 failedChunks，调用方
    // 标记不完整以便下次重试。原样返回会被当成完整结果缓存，缺失行
    // 之后永不重试。
    throw new Error(`${config.label} 响应无法按行解析`);
  }
  return parsed;
}

/** 单个 chunk 的翻译结果；incomplete 表示仍有行未能译出（保留原文） */
interface ChunkTranslation {
  lines: string[];
  incomplete: boolean;
}

/** 单次 translateLines 内的额外请求预算，避免兜底路径把请求量无限放大 */
interface FallbackBudget {
  lines: number;
  googleSplits: number;
}

/**
 * 翻译单个 chunk，并对批结果里的空行做定点补译。
 * 模型偶尔漏掉中间几行标记时，只重发这几行，而不是让整块 20 行报废。
 */
async function translateChunk(
  config: ChatProviderConfig,
  chunk: string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<ChunkTranslation> {
  return await retryWithBackoff(async () => {
    const parsed = await requestChunkTranslation(config, chunk, targetLang, signal);

    const blanks = parsed.map((text, index) => (text ? -1 : index)).filter((index) => index >= 0);
    if (blanks.length === 0) return { lines: parsed, incomplete: false };
    // 空行过多说明整块响应不可信（如被截断），判失败让本轮重试重发整块
    if (blanks.length > MAX_BLANK_REPAIRS_PER_CHUNK) {
      throw new Error(`${config.label} 响应缺失 ${blanks.length}/${chunk.length} 行`);
    }

    translateProviderLogger.info(`${config.label} 批结果缺 ${blanks.length} 行，逐行补译`);
    const repaired = [...parsed];
    let remaining = 0;
    for (const index of blanks) {
      // 补译失败只丢这一行，不影响同 chunk 内已成功的行
      try {
        const single = await retryWithBackoff(
          () => requestChunkTranslation(config, [chunk[index]], targetLang, signal),
          signal,
          1
        );
        if (single[0]) repaired[index] = single[0];
        else remaining++;
      } catch (err) {
        if (signal?.aborted) throw err;
        remaining++;
        translateProviderLogger.warn(`第 ${index} 行补译失败，保留原文:`, err);
      }
    }
    // 仍缺行时保留已成功的行，但如实上报不完整，让上层标记可重试
    return { lines: repaired, incomplete: remaining > 0 };
  }, signal);
}

/**
 * 整块失败后的兜底：改逐行重发，至少保住同 chunk 里能译出的行。
 * 仅在整块重试耗尽后触发，且受单次运行的行数预算约束。
 */
async function translateChunkResilient(
  config: ChatProviderConfig,
  chunk: string[],
  targetLang: string,
  signal: AbortSignal | undefined,
  budget: FallbackBudget
): Promise<ChunkTranslation> {
  try {
    return await translateChunk(config, chunk, targetLang, signal);
  } catch (err) {
    if (signal?.aborted || !isRetryableError(err)) throw err;
    // 401/403/429 是服务端针对本次身份的拒绝：逐行重发只会加剧限流或重复失败，
    // 交给上层标记不完整、由用户稍后重试。408/5xx 是瞬时故障，逐行仍有意义。
    if (
      err instanceof ProviderHttpError &&
      (err.status === 401 || err.status === 403 || err.status === 429)
    ) {
      throw err;
    }
    if (budget.lines <= 0) throw err;

    translateProviderLogger.warn("整块翻译失败，改为逐行重发:", err);
    const lines: string[] = [];
    let remaining = 0;
    for (const line of chunk) {
      if (budget.lines <= 0) {
        lines.push("");
        remaining++;
        continue;
      }
      budget.lines -= 1;
      try {
        const single = await retryWithBackoff(
          () => requestChunkTranslation(config, [line], targetLang, signal),
          signal,
          1
        );
        lines.push(single[0] ?? "");
        if (!single[0]) remaining++;
      } catch (lineError) {
        if (signal?.aborted) throw lineError;
        lines.push("");
        remaining++;
      }
    }
    // 逐行也没能拿到任何一行时，抛原错误以保留 failedChunks 语义
    if (remaining === chunk.length) throw err;
    return { lines, incomplete: remaining > 0 };
  }
}
/** 4xx（除 408/429）为确定性错误，重试无意义（如 Key 无效、模型不存在） */
function isRetryableError(err: unknown): boolean {
  if (err instanceof ProviderHttpError) {
    return err.status >= 500 || err.status === 408 || err.status === 429;
  }
  const message = err instanceof Error ? err.message : String(err || "");
  const match = message.match(/HTTP (\d{3})/);
  if (match) {
    const status = Number(match[1]);
    return status >= 500 || status === 408 || status === 429;
  }
  return true; // 网络 / 超时 / 解析等 → 可重试
}

/** 服务端明确给出 Retry-After 时优先听它的，否则用线性退避 */
function retryDelayMs(err: unknown, attempt: number): number {
  const retryAfter = err instanceof ProviderHttpError ? err.retryAfterMs : null;
  // retry-after: 0 表示"立刻重试"，同样优先于本地退避
  if (retryAfter !== null) return retryAfter;
  return 500 * (attempt + 1);
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
      if (attempt < retries) {
        const delay = retryDelayMs(err, attempt);
        // 服务端要求等待过久时立即放弃：整首翻译不该被单个 chunk 卡住
        if (delay > MAX_RETRY_DELAY_MS) throw err;
        await sleep(delay, signal);
      }
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

const activeSession: TranslateMetrics = {
  apiCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  failedChunks: 0,
};

// ============================================================
// Google 免费翻译（非官方 translate-pa 端点，按位置返回）
// ============================================================

const GOOGLE_TRANSLATE_URL = "https://translate-pa.googleapis.com/v1/translateHtml";
// Google 网页翻译自身使用的公开 key；401/403 时从官方 JS 页面刷新
const GOOGLE_DEFAULT_AUTH_KEY = "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520";
const GOOGLE_JS_PAGE =
  "https://translate.googleapis.com/_/translate_http/_/js/k=translate_http.tr.zh_CN.xQDQL-zBfUc.O/am=ACA/d=1/exm=el_conf/ed=1/rs=AN8SPfq926FSxeFN_C5CEBNv9zTcTCAKGA/m=el_main";

let googleAuthKey: string | null = null;

async function refreshGoogleAuthKey(signal?: AbortSignal): Promise<string> {
  const res = await fetchWithTimeout(GOOGLE_JS_PAGE, { signal }, "Google auth key");
  if (!res.ok) throw new Error(`Google auth key HTTP ${res.status}`);
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
  signal?: AbortSignal,
  mayRefresh = true
): Promise<string[]> {
  const key = googleAuthKey ?? GOOGLE_DEFAULT_AUTH_KEY;
  const res = await fetchWithTimeout(
    GOOGLE_TRANSLATE_URL,
    {
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
    },
    "Google 翻译"
  );
  if ((res.status === 401 || res.status === 403) && mayRefresh) {
    // Refresh and retry here so the refreshed key is actually used. Keeping
    // this inside googlePost also guarantees there is at most one auth retry.
    try {
      await refreshGoogleAuthKey(signal);
    } catch {
      throw new ProviderHttpError(`Google 翻译 HTTP ${res.status}`, res.status);
    }
    return googlePost(texts, targetLang, signal, false);
  }
  if (!res.ok) {
    throw new ProviderHttpError("Google 翻译 HTTP " + res.status, res.status, retryAfterOf(res));
  }
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
  const result = await googlePost(chunk, targetLang, signal);
  if (result.length !== chunk.length) {
    throw new Error(`Google 翻译返回行数不匹配（${result.length}/${chunk.length}）`);
  }
  return result.map((t: string) => cleanLine(t));
}

/**
 * 整批失败时对半拆开重试，缩小失败面。
 * Google 端点对超长/含特殊符号的批次偶发拒绝，拆半通常能过。
 */
async function googleTranslateChunkWithSplit(
  chunk: string[],
  targetLang: string,
  signal: AbortSignal | undefined,
  budget: FallbackBudget
): Promise<string[]> {
  try {
    return await retryWithBackoff(() => googleTranslateChunk(chunk, targetLang, signal), signal);
  } catch (err) {
    if (signal?.aborted || !isRetryableError(err)) throw err;
    if (chunk.length < 2 || budget.googleSplits <= 0) throw err;
    budget.googleSplits -= 1;

    translateProviderLogger.warn(`Google 批次 ${chunk.length} 行失败，拆分重试`);
    const mid = Math.ceil(chunk.length / 2);
    const head = await googleTranslateChunkWithSplit(
      chunk.slice(0, mid),
      targetLang,
      signal,
      budget
    );
    const tail = await googleTranslateChunkWithSplit(chunk.slice(mid), targetLang, signal, budget);
    return [...head, ...tail];
  }
}

/** 读取用户在设置里选定的并发数；越界或非法值回落到默认 3 */
function getConcurrency(): number {
  const value = Math.floor(Number($translationConcurrency.get()));
  if (!Number.isFinite(value)) return DEFAULT_CONCURRENCY;
  return Math.min(MAX_CONCURRENCY, Math.max(1, value));
}

/** 按 provider 的策略把行切成待翻译区间（含起始下标，结果写回对应位置） */
function buildJobs(
  lines: string[],
  maxChunkSize: number
): Array<{ start: number; chunk: string[] }> {
  return planChunks(lines.length, {
    maxChunkSize,
    concurrency: getConcurrency(),
    minParallelLines: MIN_PARALLEL_LINES,
    targetLinesPerChunk: TARGET_LINES_PER_CHUNK,
  }).map((range) => ({
    start: range.start,
    chunk: lines.slice(range.start, range.start + range.length),
  }));
}

/** 并发 worker 池：最多 concurrency 个 chunk 同时在途 */
async function runJobs<T>(
  jobs: T[],
  concurrency: number,
  run: (job: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (job === undefined) return;
      await run(job);
    }
  });
  await Promise.all(workers);
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
  const budget: FallbackBudget = {
    lines: MAX_LINE_FALLBACKS_PER_RUN,
    googleSplits: MAX_GOOGLE_SPLITS_PER_RUN,
  };

  // ---- Google 免费翻译：按位置返回，无需标记 ----
  if (provider === "google") {
    const jobs = buildJobs(lines, GOOGLE_CHUNK_SIZE);
    await runJobs(jobs, getConcurrency(), async ({ start, chunk }) => {
      if (signal?.aborted) return;
      try {
        const translated = await googleTranslateChunkWithSplit(chunk, targetLang, signal, budget);
        translated.forEach((text, i) => {
          if (text && text !== chunk[i]) results[start + i] = text;
        });
      } catch (err) {
        activeSession.failedChunks += 1;
        translateProviderLogger.warn("Google 翻译批次失败，保留原文:", err);
      }
    });
    return { lines: results, metrics: { ...activeSession } };
  }

  // ---- LLM 后端（DeepSeek / ChatGPT / 自定义）----
  const config = getChatProviderConfig();
  if (!config) {
    throw new TranslationConfigError("请先在设置中配置当前翻译服务的 API Key");
  }
  translateProviderLogger.info(`翻译后端: ${config.label} (${config.model})`);

  const jobs = buildJobs(lines, CHUNK_SIZE);
  await runJobs(jobs, getConcurrency(), async ({ start, chunk }) => {
    if (signal?.aborted) return;
    try {
      const translated = await translateChunkResilient(config, chunk, targetLang, signal, budget);
      translated.lines.forEach((text, i) => {
        if (text && text !== chunk[i]) results[start + i] = text;
      });
      if (translated.incomplete) {
        // 部分行保留原文：已成功的行照常采纳，但整首仍标记为不完整以便重试
        activeSession.failedChunks += 1;
        translateProviderLogger.warn("部分行未能译出，保留原文");
      }
    } catch (err) {
      // 该组失败：保留原文，不中断整首，但记录失败以便上层重试
      activeSession.failedChunks += 1;
      translateProviderLogger.warn("翻译批次失败，保留原文:", err);
    }
  });

  return { lines: results, metrics: { ...activeSession } };
}

/** 所选服务配置不完整的可识别错误（index.ts 按此提示用户） */
class TranslationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationConfigError";
  }
}
