import Logger from "../Logger.ts";
import { $currentlyFetching } from "../stores.ts";
import { prefetchLyrics, type LyricsPrefetchResult } from "./fetchLyrics.ts";
import { findNextTrackTarget } from "./QueueTrackTarget.ts";

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

  const result = await prefetchLyrics(target);
  if (result === "aborted") return;
  lastTargetUri = target.uri;
  lastResult = result;
  retryAfter = result === "unavailable" ? Date.now() + UNAVAILABLE_RETRY_MS : 0;
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
