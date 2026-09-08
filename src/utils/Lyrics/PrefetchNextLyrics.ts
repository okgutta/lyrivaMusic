import Logger from "../Logger.ts";
import { $currentlyFetching } from "../stores.ts";
import { prefetchLyrics, type LyricsPrefetchResult } from "./fetchLyrics.ts";
import { findNextTrackTarget } from "./QueueTrackTarget.ts";
import { recordPrefetchDiagnostic } from "./diagnostics.ts";

const prefetchLogger = new Logger("Lyrics Prefetch");
const QUEUE_POLL_INTERVAL_MS = 5_000;
const DEFAULT_PREFETCH_DELAY_MS = 750;
const UNAVAILABLE_RETRY_MS = 30_000;

let started = false;
let scheduled: ReturnType<typeof setTimeout> | null = null;
let lastTargetUri: string | null = null;
let lastResult: LyricsPrefetchResult | null = null;
let retryAfter = 0;

function getNextTarget() {
  const runtime = (globalThis as any).Spicetify;
  return findNextTrackTarget(
    runtime?.Player?.data?.item?.uri,
    runtime?.Player?.data?.nextItems,
    runtime?.Queue?.nextTracks
  );
}

async function runNextLyricsPrefetch(): Promise<void> {
  // Never compete with the user-visible current-track request. Its completion
  // schedules this function again immediately.
  if ($currentlyFetching.get()) return;
  const target = getNextTarget();
  if (!target) return;

  if (lastTargetUri === target.uri) {
    if (lastResult === "cached" || lastResult === "fetched" || lastResult === "miss") return;
    if (lastResult === "unavailable" && Date.now() < retryAfter) return;
  }

  const track = `${target.title} — ${target.artists.join(", ")}`;
  recordPrefetchDiagnostic({
    level: "working",
    title: "正在预取下一首",
    detail: track,
    uri: target.uri,
    track,
  });
  const startedAt = performance.now();
  const result = await prefetchLyrics(target);
  if (result === "aborted") return;
  const durationMs = Math.round(performance.now() - startedAt);
  lastTargetUri = target.uri;
  lastResult = result;
  retryAfter = result === "unavailable" ? Date.now() + UNAVAILABLE_RETRY_MS : 0;
  const presentation: Record<
    Exclude<LyricsPrefetchResult, "aborted">,
    { level: "success" | "warning" | "error"; title: string; detail: string }
  > = {
    cached: { level: "success", title: "下一首已缓存", detail: "无需再次请求歌词服务" },
    fetched: { level: "success", title: "下一首已预取", detail: "切歌时可直接读取本地缓存" },
    miss: { level: "warning", title: "下一首无歌词", detail: "LYRIVA 未找到匹配歌词" },
    unavailable: {
      level: "error",
      title: "预取暂不可用",
      detail: "服务或网络异常，30 秒后自动重试",
    },
  };
  recordPrefetchDiagnostic({
    ...presentation[result],
    durationMs,
    uri: target.uri,
    track,
  });
  prefetchLogger.debug("下一首歌词预取完成", { uri: target.uri, result });
}

/** Debounced trigger used after current-track fetches and queue changes. */
export function scheduleNextLyricsPrefetch(delayMs = DEFAULT_PREFETCH_DELAY_MS): void {
  if (scheduled) clearTimeout(scheduled);
  scheduled = setTimeout(() => {
    scheduled = null;
    void runNextLyricsPrefetch().catch((error) => {
      prefetchLogger.debug("下一首歌词预取任务失败", error);
    });
  }, delayMs);
}

/** Poll only the lightweight queue revision state; network work remains deduplicated. */
export function startNextLyricsPrefetching(): void {
  if (started) return;
  started = true;
  setInterval(() => scheduleNextLyricsPrefetch(0), QUEUE_POLL_INTERVAL_MS);
}
