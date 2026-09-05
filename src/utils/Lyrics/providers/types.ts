// Provider 界面：Provider 只负责「搜索 → 返回候选」与「按候选取词」，
// 绝不自行决定「这就是目标歌曲」——匹配交给统一的 Lyra Matcher。
// 日志一律通过传入的 LyraLogger（一次请求一个 requestId）；不自行 console。
import type { Candidate, LyricsPayload, LyricSource, TargetTrack } from "../matcher.ts";
import type { LyraLogger } from "../../LyraLogger.ts";

export interface LyricProvider {
  source: LyricSource;
  /** 搜索：把目标曲目的元数据归一化后，返回原始候选列表（不含匹配结果） */
  search(target: TargetTrack, signal?: AbortSignal, log?: LyraLogger): Promise<Candidate[]>;
  /** 按候选取词：返回歌词模型；无可用词/词太少返回 null */
  fetchLyrics(cand: Candidate, signal?: AbortSignal, log?: LyraLogger): Promise<LyricsPayload | null>;
}

/** 取歌词行数（Line 看 Content，Static 看 Lines） */
export function linesOf(payload: LyricsPayload | null | undefined): number {
  if (!payload) return 0;
  if (payload.Type === "Line" && Array.isArray(payload.Content)) return payload.Content.length;
  if (payload.Type === "Static" && Array.isArray(payload.Lines)) return payload.Lines.length;
  return 0;
}

/** 最小行数校验：没有足够内容的歌词不采信（防空壳/错配） */
export const MIN_LYRIC_LINES = 3;
