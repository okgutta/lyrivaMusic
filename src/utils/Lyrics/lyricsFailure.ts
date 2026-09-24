export type LyricsFailureKind =
  | "offline"
  | "network"
  | "timeout"
  | "rate-limit"
  | "service"
  | "unknown";

/** Classify internal errors, but never display backend text or URLs in the UI. */
export function classifyLyricsFailure(reason: unknown): LyricsFailureKind {
  const text = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason ?? "");
  if (/timeout|timed?\s*out|超时/i.test(text)) return "timeout";
  if (/429|rate.?limit|限流/i.test(text)) return "rate-limit";
  if (/network|fetch|网络|请求失败/i.test(text)) return "network";
  if (/服务|响应|解析|\bHTTP\s+\d{3}\b|\b50[0234]\b|\b40[13]\b/i.test(text)) return "service";
  return "unknown";
}

export function lyricsFailureMessage(kind: LyricsFailureKind): string {
  switch (kind) {
    case "offline":
      return "当前处于离线状态，连接网络后再试。";
    case "network":
      return "无法连接歌词服务，请检查网络后重试。";
    case "timeout":
      return "歌词请求超时，请重试。";
    case "rate-limit":
      return "歌词请求较多，请稍后重试。";
    case "service":
      return "歌词服务暂时不可用，请稍后重试。";
    default:
      return "暂时无法加载歌词，请重试。";
  }
}

export function canRetryLyricsNotice(descriptor: unknown): boolean {
  // "lyrics-not-found" is an authoritative backend result and is negative-cached;
  // retrying it only repeats the same request until the cache is explicitly cleared.
  return (
    descriptor === "unknown-error" || descriptor === "offline" || descriptor === "status-not-200"
  );
}
