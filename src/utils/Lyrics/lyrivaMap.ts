// LYRIVA 响应 → LyricsPayload 映射（纯函数，无 Spicetify/浏览器依赖，可直接 Node 单测）
// 输入：LYRIVA /v1/lyrics 的 `data` 字段 + target；输出：Line/Static 歌词模型或 null（无词）。
import { parseLrc, findNear } from "../ncm/parseLrc.ts";
import { splitArtists, type LyricsPayload, type MatchLevel, type TargetTrack } from "./matcher.ts";

/** 至少要有 3 行同步歌词才采信为 Line 模型，否则回退 Static（或视为无词） */
const MIN_LINES = 3;

/** meta.matchLevel → HIGH/GOOD。缓存命中时可能缺失 matchLevel，此时用 qualityScore（0-100）兜底。 */
export function metaToLevel(meta: any): MatchLevel {
  const s = String(meta?.matchLevel ?? "").toUpperCase();
  if (s.includes("HIGH")) return "HIGH";
  if (s.includes("GOOD") || s.includes("MEDIUM")) return "GOOD";
  if (s.includes("UNCERTAIN") || s.includes("LOW")) return "UNCERTAIN";
  if (s.includes("REJECT") || s.includes("MISMATCH")) return "REJECT";
  const q = Number(meta?.qualityScore);
  if (Number.isFinite(q)) return q >= 90 ? "HIGH" : q >= 80 ? "GOOD" : "UNCERTAIN";
  return "UNCERTAIN";
}

/** 置信度归一化到 0..1。
 *  matchScore 单位不稳定（文档 0.98 / 实测 7），仅当已落在 0..1 时采用；
 *  否则用 qualityScore（文档明确 0-100）归一化。 */
export function confidenceOf(meta: any): number {
  const ms = Number(meta?.matchScore);
  if (Number.isFinite(ms) && ms >= 0 && ms <= 1) return ms;
  const q = Number(meta?.qualityScore);
  if (Number.isFinite(q)) return Math.min(1, Math.max(0, q / 100));
  return 0;
}

/** translation 字段：LRC（含时间戳）→ 按时间对齐；否则按行序兜底。 */
export function mapTranslations(raw: unknown, rowStartMs: number[]): string[] {
  const empty = rowStartMs.map(() => "");
  if (!raw) return empty;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return empty;
    // 含 [mm:ss...] 时间戳 → LRC
    if (/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?]/.test(s)) {
      const rows = parseLrc(s);
      return rowStartMs.map((t) => findNear(rows, t));
    }
    // 纯文本：按行序对齐
    const lines = s.split(/\r?\n/).map((l) => l.trim());
    return rowStartMs.map((_, i) => lines[i] ?? "");
  }
  if (Array.isArray(raw)) {
    return rowStartMs.map((_, i) => String(raw[i] ?? "").trim());
  }
  return empty;
}

/**
 * LYRIVA 完整响应 → LyricsPayload。
 * `/v1/lyrics` 把匹配信息放在与 `data` 同级的 `meta` 中。
 */
export function buildLyrivaModelFromResponse(
  response: any,
  target: TargetTrack
): LyricsPayload | null {
  const data = response?.data;
  if (!data || typeof data !== "object") return null;
  return buildLyrivaModel(data, target, response?.meta);
}

/** LYRIVA `data` → LyricsPayload（Line 优先，回退 Static）。无可用词返回 null。 */
export function buildLyrivaModel(
  data: any,
  target: TargetTrack,
  responseMeta?: any
): LyricsPayload | null {
  const synced = Array.isArray(data?.syncedLyrics) ? data.syncedLyrics : [];
  const rows = synced
    .map((s: any) => ({
      startMs: Number(s?.startMs),
      text: typeof s?.text === "string" ? s.text.trim() : "",
    }))
    .filter(
      (r: { startMs: number; text: string }) =>
        r.text.length > 0 && Number.isFinite(r.startMs) && r.startMs >= 0
    )
    .sort((a: { startMs: number }, b: { startMs: number }) => a.startMs - b.startMs);

  const plain = typeof data?.plainLyrics === "string" ? data.plainLyrics : "";
  const plainLines = plain
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter(Boolean);

  if (rows.length < MIN_LINES && plainLines.length < MIN_LINES) {
    return null;
  }

  const track = data?.track ?? {};
  // 正式契约是顶层 response.meta；data.meta 仅用于兼容旧响应。
  const meta = responseMeta ?? data?.meta ?? {};
  const candidateArtists =
    typeof track?.artist === "string"
      ? splitArtists(track.artist)
      : Array.isArray(track?.artist)
        ? track.artist.map((a: any) => String(a ?? "").trim()).filter(Boolean)
        : [];
  const matchLevel = metaToLevel(meta);
  const confidence = confidenceOf(meta);
  if (matchLevel === "REJECT" || matchLevel === "UNCERTAIN" || confidence < 0.8) {
    return null;
  }
  const matchInfo = {
    level: matchLevel,
    confidence,
    targetTitle: target.title,
    targetArtists: target.artists,
    candidateTitle: String(track?.title ?? target.title ?? ""),
    candidateArtists,
    source: "lyriva",
    savedAt: Date.now(),
  };

  // 同步歌词充足 → Line 模型（EndTime 取下一行起点，末行 +4s；单位秒）
  if (rows.length >= MIN_LINES) {
    const translations = mapTranslations(
      data?.translation,
      rows.map((r: { startMs: number }) => r.startMs)
    );
    const Content = rows.map((r: { startMs: number; text: string }, i: number) => {
      const endMs = i + 1 < rows.length ? rows[i + 1].startMs : r.startMs + 4000;
      const translation = translations[i];
      return {
        Type: "Vocal",
        Text: r.text,
        StartTime: r.startMs / 1000,
        EndTime: endMs / 1000,
        ...(translation ? { Translation: translation } : {}),
      };
    });
    return {
      Type: "Line",
      Content,
      uri: target.uri,
      source: "lyriva",
      matchInfo,
    } satisfies LyricsPayload;
  }

  // 同步歌词不足 → Static 模型（纯文本行）
  return {
    Type: "Static",
    Lines: plainLines.map((t: string) => ({ Text: t })),
    uri: target.uri,
    source: "lyriva",
    matchInfo,
  } satisfies LyricsPayload;
}
