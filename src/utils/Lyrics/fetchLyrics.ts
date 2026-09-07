import { isDev } from "../../components/Global/Defaults.ts";
import { $currentLyricsData, $currentLyricsType, $currentlyFetching } from "../stores.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import PageView, { PageContainer } from "../../components/Pages/PageView.ts";
import { ProcessLyrics } from "./ProcessLyrics.ts";
import Logger from "../Logger.ts";
import { GetExpireStore } from "../../modules/Store.ts";
import { normalizeText } from "../ncm/similarity.ts";
import {
  matchCandidate,
  normalizeTitle,
  rankMatch,
  type Candidate,
  type LyricsPayload,
  type MatchLevel,
  type TargetTrack,
} from "./matcher.ts";
import { tryLyrivaLyrics } from "./lyriva.ts";
import { geniusProvider } from "./providers/genius.ts";
import Global from "../../components/Global/Global.ts";

const lyricsLogger = new Logger("Lyrics Pipeline");
const lyricsCacheLogger = new Logger("Lyrics Cache");

// ============================================================
// 请求生命周期：generation 校验（防切歌串词）+ in-flight 去重（防重复请求）
// ============================================================
let lyricsGeneration = 0;
let currentFetchAbort: AbortController | null = null;
type InflightFetch = {
  generation: number;
  controller: AbortController;
  promise: Promise<[object | string, number] | null>;
};
const inflightFetches = new Map<string, InflightFetch>();

function isTrackUri(uri: string): boolean {
  return /^spotify:track:[^:]+$/.test(uri) || uri.startsWith("spotify:local:");
}

function isActiveRequest(gen: number, uri: string, signal?: AbortSignal): boolean {
  return !signal?.aborted && !isStale(gen) && SpotifyPlayer.GetUri() === uri;
}

/** 持久缓存条目结构（model + 匹配信息 + 负缓存标记；负缓存条目 matchInfo 可不完整） */
export type LyricsCacheEntry = {
  model?: LyricsPayload;
  uri: string;
  matchInfo?: Partial<MatchInfo>;
  notFound?: boolean;
};

// 缓存 Key 至少考虑 track identity + title/artist（见 matchInfo 校验）。
// g2 → g3：失效因顶层 meta 解包错误而误写的 NO_LYRICS 负缓存。
export const LyricsStore = GetExpireStore<LyricsCacheEntry>(
  "SpicyLyrics_LyricsStore_g3",
  3,
  { Unit: "Days", Duration: 3 },
  isDev as true
);

// ============================================================
// 目标曲目 / 缓存校验
// ============================================================
function getIsrc(): string | undefined {
  const item = (globalThis as any).Spicetify?.Player?.data?.item;
  if (!item) return undefined;
  return item?.external_ids?.isrc || undefined;
}

function buildTarget(uri: string): TargetTrack | null {
  // 用当前播放元数据构造 target 时，必须确认 uri 仍是当前歌曲——
  // 否则切歌瞬间会产生"旧 uri + 新歌元数据"的混合目标，导致错误匹配
  // 和串歌缓存。不一致时返回 null，调用方应丢弃本次请求。
  if (SpotifyPlayer.GetUri() !== uri) {
    return null;
  }
  const artists =
    SpotifyPlayer.GetArtists()
      ?.map((a) => a.name)
      .filter(Boolean) ?? [];
  return {
    uri,
    title: SpotifyPlayer.GetName() ?? "",
    artists,
    album: SpotifyPlayer.GetAlbumName() ?? undefined,
    durationMs: SpotifyPlayer.GetDuration() || undefined,
    isrc: getIsrc(),
  };
}

// 歌词模型上携带的匹配信息（随模型一起缓存/落盘）
interface MatchInfo {
  level: MatchLevel;
  confidence: number;
  targetTitle: string;
  targetArtists: string[];
  candidateTitle: string;
  candidateArtists: string[];
  source: string;
  savedAt: number;
}

function sameArtists(a: string[], b: string[]): boolean {
  const normalize = (x: string[]) =>
    [...new Set(x.map(normalizeText).filter(Boolean))].sort().join("|");
  return normalize(a || []) === normalize(b || []);
}

/** 仅身份校验（title + artists），不要求 level——用于负缓存的「仍指向同一首歌」判断 */
function verifyIdentityOnly(
  mi: Partial<MatchInfo> | null | undefined,
  target: TargetTrack
): boolean {
  if (!mi) return false;
  if (normalizeTitle(mi.targetTitle ?? "") !== normalizeTitle(target.title ?? "")) return false;
  if (!sameArtists(mi.targetArtists ?? [], target.artists)) return false;
  return true;
}

/** 缓存的匹配信息是否仍与当前曲目一致且达到可采信等级（防止旧错误匹配/旧结构被放行） */
function verifyMatchInfo(mi: Partial<MatchInfo> | null | undefined, target: TargetTrack): boolean {
  if (!mi) return false;
  if (!verifyIdentityOnly(mi, target)) return false;
  if (mi.level !== "HIGH" && mi.level !== "GOOD") return false;
  return true;
}

/** 歌词模型运行时结构校验：缓存/旧数据可能损坏，直接渲染会抛异常
 * 且无法回退 Provider。校验失败返回 false，调用方应删除缓存并继续拉取。 */
function isValidLyricsModel(model: any): boolean {
  if (!model || typeof model !== "object" || typeof model.Type !== "string") return false;
  if (model.Type === "Static") {
    return Array.isArray(model.Lines);
  }
  if (model.Type === "Line" || model.Type === "Syllable") {
    if (!Array.isArray(model.Content)) return false;
    // 至少要有可渲染的 Vocal 组（防止空/损坏 Content 白屏）
    return model.Content.some((g: any) => g && typeof g === "object" && g.Type === "Vocal");
  }
  return false;
}

function setRomanizationClass(hasTransliterations: boolean | undefined): void {
  if (hasTransliterations) {
    PageContainer?.classList.add("Lyrics_RomanizationAvailable");
  } else {
    PageContainer?.classList.remove("Lyrics_RomanizationAvailable");
  }
}

/**
 * Shared "lyrics are ready" presentation: toggle the romanization class, hide the
 * loader, publish the type, reveal the containers and view controls, and clear the
 * fetching flag. Used by every successful return path.
 */
function presentLyrics(lyricsData: LyricsPayload, uri: string, gen?: number): void {
  if (gen !== undefined && !isActiveRequest(gen, uri)) return;
  if (SpotifyPlayer.GetUri() !== uri) return;
  setRomanizationClass(lyricsData?.HasTransliterations);
  HideLoaderContainer();
  $currentLyricsType.set(lyricsData.Type);
  PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.remove("LyricsHidden");
  PageContainer?.querySelector(".ContentBox .LyricsContainer")?.classList.remove("Hidden");
  PageView.AppendViewControls(true);
  $currentlyFetching.set(false);
}

const finalizedModels = new WeakSet<object>();
const backgroundFinalizations = new Map<string, Promise<void>>();

async function finalizeLyricsInBackground(
  model: LyricsPayload,
  trackId: string,
  uri: string,
  gen: number,
  signal: AbortSignal
): Promise<void> {
  // Wait until the freshly mounted lyrics have had a chance to paint. Language
  // detection can be CPU-heavy, but it must never delay the first visible frame.
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function" && !document.hidden) {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
  if (!isActiveRequest(gen, uri, signal)) return;

  let appliedRomanization = false;
  try {
    appliedRomanization = await ProcessLyrics(model);
    model._spicyLyricsProcessed = true;
    finalizedModels.add(model);
  } catch (error) {
    // 罗马音是可选增强：CDN/词典失败不能影响已经显示的原始歌词。
    lyricsLogger.warn("歌词后台增强失败", error);
    return;
  }

  if (!isActiveRequest(gen, uri, signal)) return;
  $currentLyricsData.set(JSON.stringify(model));
  setRomanizationClass(model.HasTransliterations);
  Global.Event.evoke("lyrics:analyzed", { uri, lyrics: model });
  if (appliedRomanization) {
    Global.Event.evoke("lyrics:enriched", { uri, lyrics: model });
  }

  if (LyricsStore) {
    try {
      const storeEntry: LyricsCacheEntry = {
        model,
        uri,
        matchInfo: model.matchInfo as LyricsCacheEntry["matchInfo"],
      };
      await LyricsStore.SetItem(trackId, storeEntry);
    } catch (error) {
      lyricsCacheLogger.error("Error saving lyrics to cache", error);
    }
  }
}

function scheduleLyricsFinalization(
  model: LyricsPayload,
  trackId: string,
  uri: string,
  gen: number,
  signal: AbortSignal
): void {
  if (finalizedModels.has(model) || model._spicyLyricsProcessed === true) return;
  const key = `${gen}:${uri}`;
  if (backgroundFinalizations.has(key)) return;
  const task = finalizeLyricsInBackground(model, trackId, uri, gen, signal).finally(() => {
    if (backgroundFinalizations.get(key) === task) backgroundFinalizations.delete(key);
  });
  backgroundFinalizations.set(key, task);
}

/**
 * 对外入口：in-flight 去重 + generation 递增 + abort 上一首在途请求。
 */
export function cancelLyricsFetch(): void {
  lyricsGeneration++;
  currentFetchAbort?.abort();
  currentFetchAbort = null;
  for (const entry of inflightFetches.values()) entry.controller.abort();
  inflightFetches.clear();
  if ($currentlyFetching.get()) $currentlyFetching.set(false);
  HideLoaderContainer();
}

export default async function fetchLyrics(uri: string): Promise<[object | string, number] | null> {
  if (!isTrackUri(uri)) {
    lyricsLogger.debug("Ignoring malformed track URI", uri);
    return null;
  }
  const existing = inflightFetches.get(uri);
  if (existing && existing.generation === lyricsGeneration && !existing.controller.signal.aborted) {
    lyricsLogger.debug("In-flight hit, reusing request", uri);
    return existing.promise;
  }
  if (existing) {
    inflightFetches.delete(uri);
  }

  const gen = ++lyricsGeneration;
  currentFetchAbort?.abort();
  const controller = new AbortController();
  currentFetchAbort = controller;

  let promise: Promise<[object | string, number] | null>;
  promise = fetchLyricsInner(uri, gen, controller.signal)
    .catch((error): [object | string, number] | null => {
      // 已被新请求取代（切歌/重复请求）或已 abort：静默丢弃，绝不能把
      // 错误元组交给调用方的 .then(ApplyLyrics)——那会把新歌的正常歌词
      // 覆盖成"发生未知错误"。
      if (gen !== lyricsGeneration || controller.signal.aborted) {
        return null;
      }
      // 顶层兜底：任何内部 throw（provider / ProcessLyrics / 解析等）都不能让
      // $currentlyFetching 停在 true 或 loader 一直转。降级为错误文案，
      // 而不是把未处理 rejection 留给调用方。
      lyricsLogger.error("Unexpected error while fetching lyrics", error);
      $currentlyFetching.set(false);
      HideLoaderContainer();
      return ["unknown-error", 500];
    })
    .finally(() => {
      // A second request for the same URI may have replaced this entry after the
      // first request was aborted. Never let the old request remove the new one.
      if (inflightFetches.get(uri)?.promise === promise) {
        inflightFetches.delete(uri);
      }
      if (currentFetchAbort === controller) currentFetchAbort = null;
    });
  inflightFetches.set(uri, { generation: gen, controller, promise });
  return promise;
}

function isStale(gen: number): boolean {
  return gen !== lyricsGeneration;
}

async function fetchLyricsInner(
  uri: string,
  gen: number,
  signal: AbortSignal
): Promise<[object | string, number] | null> {
  lyricsLogger.debug("Fetch requested", uri);
  const LyricsContent =
    PageContainer?.querySelector(".LyricsContainer .LyricsContent") ?? undefined;
  if (LyricsContent?.classList.contains("offline")) {
    LyricsContent.classList.remove("offline");
  }

  if (SpotifyPlayer.IsDJ()) {
    $currentlyFetching.set(false);
    return ["dj", 400];
  }

  const mediaType = SpotifyPlayer.GetMediaType();
  if (mediaType && mediaType !== "audio") {
    $currentlyFetching.set(false);
    if (mediaType === "video") return ["video-track", 400];
    if (mediaType === "mixed") return ["mixed-track", 400];
    return ["unknown-track", 400];
  }

  const contentType = SpotifyPlayer.GetContentType();
  if (contentType !== "track") {
    $currentlyFetching.set(false);
    if (contentType === "episode") return ["episode-track", 400];
    return ["unknown-track", 400];
  }

  // Local files have no stable provider identity and must not touch caches or
  // remote sources.
  if (uri.startsWith("spotify:local:")) {
    $currentlyFetching.set(false);
    HideLoaderContainer();
    return ["local-track", 400];
  }

  const trackId = uri.slice("spotify:track:".length);
  const target = buildTarget(uri);
  // 切歌瞬间 uri 已不是当前歌曲：丢弃本次请求（generation 机制会接管）
  if (!target || !trackId || !isActiveRequest(gen, uri, signal)) {
    if (!isStale(gen)) $currentlyFetching.set(false);
    return null;
  }

  $currentlyFetching.set(true);
  if (LyricsContent) LyricsContent.classList.add("HiddenTransitioned");

  // ===== 内存缓存（$currentLyricsData）：命中且身份一致才采用 =====
  const savedLyricsData = $currentLyricsData.get();
  if (savedLyricsData && !isDev) {
    try {
      if (savedLyricsData.startsWith("NO_LYRICS:")) {
        const savedUri = savedLyricsData.slice("NO_LYRICS:".length);
        if (savedUri === uri) {
          lyricsLogger.debug("NO_LYRICS 内存哨兵命中，跳过全部 Provider（清缓存后可重试）", uri);
          $currentlyFetching.set(false);
          return ["lyrics-not-found", 404];
        }
      } else {
        const parsed = JSON.parse(savedLyricsData);
        if (
          parsed?.uri === uri &&
          verifyMatchInfo(parsed?.matchInfo, target) &&
          isValidLyricsModel(parsed)
        ) {
          presentLyrics(parsed, uri, gen);
          scheduleLyricsFinalization(parsed, trackId, uri, gen, signal);
          return [parsed, 200];
        }
      }
    } catch (error) {
      lyricsCacheLogger.error("Error parsing saved lyrics data", error);
    }
  }

  // ===== 持久缓存（LyricsStore）：命中且身份一致才采用 =====
  if (LyricsStore) {
    try {
      const res = await LyricsStore.GetItem(trackId);
      if (isStale(gen)) {
        return null;
      }
      if (res) {
        // 负缓存（NO_LYRICS）：必须是当前曲目身份，才跳过
        if (
          res?.notFound === true &&
          res?.uri === uri &&
          verifyIdentityOnly(res?.matchInfo, target)
        ) {
          lyricsCacheLogger.debug("NO_LYRICS 负缓存命中（身份一致）", trackId);
          $currentlyFetching.set(false);
          return ["lyrics-not-found", 404];
        }
        // 正缓存：必须已通过匹配（HIGH/GOOD）且身份一致
        if (res?.model && res?.uri === uri) {
          if (verifyMatchInfo(res?.matchInfo, target)) {
            const model = res.model;
            // 运行时结构校验：损坏/旧版本模型直接渲染会抛异常且无法回退
            if (!isValidLyricsModel(model)) {
              lyricsCacheLogger.warn("缓存模型结构损坏，删除并重新拉取", trackId);
              await LyricsStore.RemoveItem(trackId).catch(() => {});
              $currentLyricsData.set("");
            } else {
              $currentLyricsData.set(JSON.stringify(model));
              presentLyrics(model, uri, gen);
              scheduleLyricsFinalization(model, trackId, uri, gen, signal);
              return [{ ...model, fromCache: true }, 200];
            }
          }
        }
        // 缓存命中但身份不一致 / 未通过匹配 → 视为陈旧，忽略并重新拉取
        lyricsCacheLogger.debug("缓存命中但身份不一致，重新拉取", trackId);
      }
    } catch (error) {
      // CacheStorage is an optional optimization. A corrupt or unavailable
      // entry must not turn into the user-facing "unknown error" state;
      // continue with the provider pipeline below.
      lyricsCacheLogger.error("Error parsing cache entry", error);
    }
  }

  if (!navigator.onLine) {
    $currentlyFetching.set(false);
    return ["offline", 400];
  }

  ShowLoaderContainer();

  // ===== 主源：LYRIVA API（完全替换内置多源搜索 → Matcher → 取词链） =====
  const requestStartedAt = performance.now();
  const result = await tryLyrivaLyrics(target, signal);
  lyricsLogger.debug("LYRIVA request completed", {
    durationMs: Math.round(performance.now() - requestStartedAt),
    kind: result.kind,
    uri,
  });
  if (isStale(gen)) {
    return null;
  }

  // ===== 兜底：Genius 静态词（LYRIVA 未命中时才走；命中则跳过） =====
  let fallback: GeniusFallbackResult | null = null;
  if (result.kind !== "ok") {
    fallback = await tryGeniusFallback(target, signal);
    if (isStale(gen)) {
      return null;
    }
    if (fallback.kind === "hit") {
      lyricsLogger.info(
        "🎯",
        `Genius 兜底命中: ${fallback.matchInfo.candidateTitle} — ${fallback.matchInfo.candidateArtists.join(", ")} (${fallback.matchInfo.level})`
      );
    }
  }

  const fallbackHit = fallback?.kind === "hit" ? fallback : null;
  if (result.kind === "ok" || fallbackHit) {
    const model = result.kind === "ok" ? result.model : fallbackHit!.model;
    $currentLyricsData.set(JSON.stringify(model));
    if (!isActiveRequest(gen, uri, signal)) return null;
    presentLyrics(model, uri, gen);
    scheduleLyricsFinalization(model, trackId, uri, gen, signal);
    return [{ ...model, fromCache: false }, 200];
  }

  // ===== 权威无歌词 → NO_LYRICS 负缓存（身份限定，防旧错误负缓存误伤） =====
  if (result.kind === "not-found" && fallback?.kind === "miss") {
    if (LyricsStore) {
      try {
        const notFoundEntry = {
          notFound: true,
          uri,
          matchInfo: {
            level: "REJECT" as MatchLevel,
            targetTitle: target.title,
            targetArtists: target.artists,
          },
        };
        await LyricsStore.SetItem(trackId, notFoundEntry);
      } catch (error) {
        lyricsCacheLogger.error("Error saving NO_LYRICS to cache", error);
      }
    }
    HideLoaderContainer();
    $currentlyFetching.set(false);
    return ["lyrics-not-found", 404];
  }

  // ===== skipped（未配 key）/ unavailable（限流、超时、鉴权、服务端）=====
  // 不写负缓存：下首歌或重试仍有机会成功（避免把瞬时故障固化为「无歌词」）。
  // Genius 兜底也未命中才会走到这里。
  if (result.kind === "skipped") {
    lyricsLogger.warn("LYRIVA 内置 API Key 为空，自动歌词获取跳过");
  } else if (result.kind === "unavailable") {
    lyricsLogger.warn(`LYRIVA 不可用：${result.reason}`);
  } else {
    lyricsLogger.warn("歌词来源均未返回可用歌词");
  }
  HideLoaderContainer();
  $currentlyFetching.set(false);
  return ["unknown-error", 500];
}

/**
 * Genius 兜底：LYRIVA 未命中（无歌词/服务不可用）时的静态歌词备选。
 * 只采信 Matcher 判定 HIGH/GOOD 且未被拒的候选——错词比没词更糟。
 * 未配置 Token 时 geniusProvider.search 直接返回空，等价于无兜底。
 */
type GeniusFallbackResult =
  | { kind: "hit"; model: LyricsPayload; matchInfo: MatchInfo }
  | { kind: "miss" }
  | { kind: "unavailable" };

async function tryGeniusFallback(
  target: TargetTrack,
  signal?: AbortSignal
): Promise<GeniusFallbackResult> {
  let cands: Candidate[] = [];
  try {
    cands = await geniusProvider.search(target, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    lyricsCacheLogger.debug("Genius 兜底搜索失败", err);
    return { kind: "unavailable" };
  }
  if (signal?.aborted) return { kind: "unavailable" };
  if (!cands.length) return { kind: "miss" };

  const ranked = cands
    .map((cand) => ({ cand, match: matchCandidate(target, cand) }))
    .sort((a, b) => rankMatch(b.match) - rankMatch(a.match));

  for (const candidate of ranked) {
    if (
      candidate.match.rejected ||
      (candidate.match.level !== "HIGH" && candidate.match.level !== "GOOD")
    ) {
      continue;
    }
    let model: LyricsPayload | null;
    try {
      model = await geniusProvider.fetchLyrics(candidate.cand, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      lyricsCacheLogger.debug("Genius 兜底候选抓取失败", error);
      continue;
    }
    if (signal?.aborted) return { kind: "unavailable" };
    if (!model) continue;
    const matchInfo: MatchInfo = {
      level: candidate.match.level,
      confidence: candidate.match.confidence,
      targetTitle: target.title,
      targetArtists: target.artists,
      candidateTitle: candidate.cand.title,
      candidateArtists: candidate.cand.artists,
      source: "genius",
      savedAt: Date.now(),
    };
    model.uri = target.uri;
    model.matchInfo = matchInfo;
    return { kind: "hit", model, matchInfo };
  }
  return { kind: "miss" };
}

let ContainerShowLoaderTimeout: ReturnType<typeof setTimeout> | null = null;

function ShowLoaderContainer(): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (loaderContainer) {
    if (ContainerShowLoaderTimeout) clearTimeout(ContainerShowLoaderTimeout);
    ContainerShowLoaderTimeout = setTimeout(() => {
      ContainerShowLoaderTimeout = null;
      loaderContainer.classList.add("active");
    }, 200);
  }
}

function HideLoaderContainer(): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (loaderContainer) {
    if (ContainerShowLoaderTimeout) {
      clearTimeout(ContainerShowLoaderTimeout);
      ContainerShowLoaderTimeout = null;
    }
    loaderContainer.classList.remove("active", "queued");
    loaderContainer.querySelector(".loaderMessage")?.remove();
  }
}

export function ClearLyricsPageContainer(): void {
  const lyricsContent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (lyricsContent) lyricsContent.innerHTML = "";
}
