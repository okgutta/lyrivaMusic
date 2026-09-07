import type { AudioAnalysisData } from "../components/DynamicBG/BackgroundAnimationController";
import { GetExpireStore } from "../modules/Store";

interface CachedAudioAnalysis {
  analysis?: AudioAnalysisData;
  /** Persisted when Spotify has no analysis for this track (HTTP 404). */
  notFound?: boolean;
  /** 429/网络错误后的短 TTL 冷却（秒）：避免随 progress 事件高频重试被限流 */
  retryAfter?: number;
}

function getCosmosErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const e = error as { status?: unknown; code?: unknown };
  if (typeof e.status === "number") {
    return e.status;
  }
  if (typeof e.code === "number") {
    return e.code;
  }
  return undefined;
}

export const AudioAnalysisStore = GetExpireStore<CachedAudioAnalysis>(
  "SpicyLyrics_AudioAnalysis",
  1,
  {
    Duration: 1,
    Unit: "Months",
  }
);

function isAudioAnalysisData(data: unknown): data is AudioAnalysisData {
  if (!data || typeof data !== "object") {
    return false;
  }

  const parsed = data as Partial<AudioAnalysisData>;
  return !!parsed.track && Array.isArray(parsed.sections) && Array.isArray(parsed.beats);
}

/**
 * Gets and validates the Spotify audio analysis for a given track URI.
 * * @param uri The Spotify track URI (e.g., 'spotify:track:4uLU6hMCjMI75M1A2tKUQC')
 * @returns The parsed AudioAnalysisData, or null if the fetch fails
 */
export async function getDynamicAudioAnalysis(uri: string): Promise<AudioAnalysisData | null> {
  if (!uri) {
    return null;
  }

  // Local tracks aren't hosted by Spotify, so there's no audio analysis to
  // load for them — skip the request entirely.
  if (uri.startsWith("spotify:local:")) {
    return null;
  }

  const trackId = uri.split(":")[2];
  if (!trackId) {
    return null;
  }

  // CacheStorage 异常不应让整个函数 reject（调用方依赖它返回 null 走兜底）
  let cached: CachedAudioAnalysis | undefined;
  try {
    cached = await AudioAnalysisStore.GetItem(trackId);
  } catch (err) {
    console.error("AudioAnalysis cache read failed:", err);
    cached = undefined;
  }
  if (cached?.notFound) {
    return null;
  }
  if (cached?.analysis && isAudioAnalysisData(cached.analysis)) {
    return cached.analysis;
  }
  // 冷却期内（429/网络错误后 60s）不再发请求
  if (cached?.retryAfter && cached.retryAfter > Date.now() / 1000) {
    return null;
  }

  const url = `https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${trackId}?format=json`;
  try {
    const data = (await Spicetify.CosmosAsync.get(url)) as unknown;
    if (!isAudioAnalysisData(data)) {
      throw new Error("Payload is missing required audio analysis arrays (sections/beats).");
    }

    await AudioAnalysisStore.SetItem(trackId, {
      analysis: data,
    });

    return data;
  } catch (error: unknown) {
    const httpStatus = getCosmosErrorStatus(error);
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : undefined;

    // 写负缓存/冷却前先读现有条目：并发请求可能刚写入成功 analysis，
    // 整体覆盖会把它冲掉（动态背景停摆约 60s）。读取失败按无条目处理。
    let existing: CachedAudioAnalysis | undefined;
    try {
      existing = await AudioAnalysisStore.GetItem(trackId);
    } catch (err) {
      console.error("AudioAnalysis cache read (on failure) failed:", err);
      existing = undefined;
    }

    const writeFallback = async (entry: CachedAudioAnalysis): Promise<void> => {
      // SetItem 失败不能覆盖原始错误路径——静默降级，仍返回 null
      try {
        await AudioAnalysisStore.SetItem(trackId, entry);
      } catch (err) {
        console.error("AudioAnalysis cache write (on failure) failed:", err);
      }
    };

    if (httpStatus === 404) {
      console.error("Analysis not found (404)");
      await writeFallback({
        analysis: existing?.analysis,
        notFound: true,
      });
    } else if (httpStatus === 429) {
      console.error("Rate limited (429)");
      // 60s 冷却，避免每次 progress 事件（约 250ms 一次）都重试
      await writeFallback({
        analysis: existing?.analysis,
        retryAfter: Date.now() / 1000 + 60,
      });
    } else {
      console.error("Network or Validation Error:", message || error);
      // 网络错误同样冷却，防止连续失败高频打网
      await writeFallback({
        analysis: existing?.analysis,
        retryAfter: Date.now() / 1000 + 60,
      });
    }
    return null;
  }
}
