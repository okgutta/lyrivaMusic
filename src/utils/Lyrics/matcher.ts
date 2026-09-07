// lyrivaMusic Matcher — 高准确率、宁缺毋滥的歌词匹配核心
//
// 不可违反原则（见项目需求文档 §24）：
//   1. TITLE_MATCH ≠ SONG_MATCH
//   2. SEARCH_RESULT ≠ LYRICS_MATCH
//   3. ARTIST_MISMATCH = HARD_REJECT（无论 score/confidence/duration/title 多高）
//   4. LOOSE/CANDIDATE ≠ FINAL（低置信度候选绝不自动返回歌词）
//   5. 没有足够证据 → NO_MATCH
//   6. 宁可没有歌词，也不要返回错误歌词
//
// Provider 只负责「搜索 → 返回候选」，本模块负责「统一匹配」：
//   normalizeTitle → parseVersion → 三态 artist → title 四态 → version/duration/isrc/album
//   → HARD FILTER → Scoring → Confidence → 可选中性（Selection eligibility）
//
// 纯逻辑、无 Spicetify/浏览器依赖，可直接用 Node 跑单测
// （node src/utils/Lyrics/matcher.test.ts）

import { normalizeText, levenshtein } from "../ncm/similarity.ts";

// ============================================================
// 类型
// ============================================================
export type LyricSource = "ncm" | "qq" | "lrclib" | "genius";

/** 艺人三态：MATCH 确认同一 / MISMATCH 明确不同（硬拒） / UNKNOWN 无法确认 */
export type ArtistStatus = "MATCH" | "MISMATCH" | "UNKNOWN";

/** 标题四态：EXACT 唯一 / NORMALIZED 基本一致 / SIMILAR 仅相似 / MISMATCH 不同 */
export type TitleStatus = "EXACT" | "NORMALIZED" | "SIMILAR" | "MISMATCH";

/** 版本一致性：MATCH 一致 / MISMATCH 不同 / NONE 双方都无版本信息 */
export type VersionStatus = "MATCH" | "MISMATCH" | "NONE";

/** 置信度等级 */
export type MatchLevel = "HIGH" | "GOOD" | "UNCERTAIN" | "REJECT";

export type RejectReason =
  | "ARTIST_MISMATCH"
  | "TITLE_MISMATCH"
  | "LOW_CONFIDENCE"
  | "ISRC_MISMATCH";

export type VersionKind =
  | "live"
  | "remix"
  | "remaster"
  | "acoustic"
  | "demo"
  | "instrumental"
  | "cover"
  | "radio-edit"
  | "extended"
  | "ost"
  | "tv-version"
  | "reprise";

/** Spotify 目标曲目上下文（由 player 元数据归一化后传入） */
export interface TargetTrack {
  uri: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
}

/** 统一候选（Provider 抛出，Matcher 填充匹配元数据） */
export interface Candidate {
  source: LyricSource;
  id: string;
  title: string;
  /** 已拆分后的艺人列表（非拼接字符串） */
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  /** 已抓取的歌词模型（Line/Static），由 provider.fetchLyrics 填充 */
  lyrics?: LyricsPayload;
}

/** 歌词模型统一载荷：三态（Syllable/Line/Static），带翻译/罗马音/匹配信息等扩展字段 */
export type LyricsPayload = {
  Type: string;
  /** Line / Syllable 的 Vocal 组 */
  Content?: Array<{
    Type: string;
    Text?: string;
    StartTime?: number;
    EndTime?: number;
    Translation?: string;
    Lead?: {
      Syllables?: Array<{ Text?: string; IsPartOfWord?: boolean; [k: string]: unknown }>;
      [k: string]: unknown;
    };
    Background?: Array<{
      Syllables?: Array<{ Text?: string; [k: string]: unknown }>;
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  }>;
  /** Static 的行 */
  Lines?: Array<{ Text?: string; [k: string]: unknown }>;
  Language?: string;
  LanguageISO2?: string;
  HasTransliterations?: boolean;
  uri?: string;
  matchInfo?: unknown;
  [k: string]: unknown;
};

/** 单个候选的完整匹配结果 */
export interface MatchResult {
  candidate: Candidate;
  target: TargetTrack;
  titleStatus: TitleStatus;
  artistStatus: ArtistStatus;
  version: VersionStatus;
  titleScore: number;
  artistScore: number;
  durationScore: number;
  albumScore: number;
  isrcScore: number;
  versionScore: number;
  score: number;
  confidence: number;
  level: MatchLevel;
  rejected: boolean;
  rejectReason?: RejectReason;
  /** 艺人不确定（缺艺人/跨语系译名）→ 需要验证，绝不自动返回 */
  needsVerification: boolean;
  /** 艺人名相似度（供日志/排序） */
  artistSimilarity: number;
  /** 版本 token（供日志） */
  versionTokens: VersionKind[];
}

// ============================================================
// 常量与阈值
// ============================================================
// 标题分档
const TITLE_EXACT_SCORE = 40;
const TITLE_NORMALIZED_SCORE = 35;
const TITLE_SIMILAR_SCORE = 15;
const TITLE_MISMATCH_SCORE = 0;
// 艺人分档
const ARTIST_EXACT_SCORE = 40;
const ARTIST_STRONG_SCORE = 30;
const ARTIST_NORMAL_SCORE = 15;
// 时长分档（Sec）
const DURATION_LE3 = 20;
const DURATION_LE10 = 10;
const DURATION_LE20 = 0;
const DURATION_LE40 = -10;
const DURATION_GT40 = -30;
// 版本
const VERSION_MATCH_SCORE = 5;
const VERSION_MISMATCH_SCORE = -20;
// 专辑、ISRC
const ALBUM_SCORE = 5;
const ISRC_MATCH_SCORE = 15;
const ISRC_MISMATCH_SCORE = -25;

// 标题相似度分档（baseTitle 层面）
const TITLE_NORMALIZED_MIN = 0.9;
const TITLE_SIMILAR_MIN = 0.8;

// 艺人确认阈值
const LATIN_CONFIRM = 0.85; // 拉丁：长名：拼写/顺序差异允许；低于此视为不同
const LATIN_SHORT_CONFIRM = 0.9; // 短名（≤10 字符）：1 字符差即视为不同（Artist A vs Artist B）
const SHORT_NAME_LEN = 10;
const AMBIGUOUS_CONFIRM = 0.5; // CJK/谚文/假名：简繁/异体常见；0.5 以上视为同一
const ARTIST_STRONG_SIM = 0.7;
const ARTIST_EXACT_SIM = 0.95;

// 置信度
const CONF_MAX = 100;
const REJECT_CONF = 0.7; // < 0.70 → REJECT
const ACCEPT_CONF = 0.8; // ≥ 0.80 才允许参与最终选择（HIGH/GOOD）
// 艺人不确定时的分数上限（0.72 < 0.80，保证带 needsVerification 的候选永不自动入选）
const UNKNOWN_ARTIST_SCORE_CAP = 72;

// ============================================================
// 版本识别
// ============================================================
const VERSION_TOKEN_MAP: Array<[VersionKind, string[]]> = [
  [
    "live",
    [
      "live",
      "live version",
      "live at",
      "现场",
      "演唱会",
      "音乐节",
      "歌谣祭",
      "大祭典",
      "concert",
      "festival",
      "tour",
      "in concert",
    ],
  ],
  ["remix", ["remix", "混音"]],
  ["remaster", ["remaster", "remastered", "重制版", "reissue"]],
  ["acoustic", ["acoustic", "unplugged", "钢琴版", "吉他版"]],
  ["demo", ["demo"]],
  ["instrumental", ["instrumental", "inst", "伴奏", "karaoke", "off vocal", "纯音乐"]],
  ["cover", ["cover", "翻唱"]],
  ["radio-edit", ["radio edit", "radio version", "radio ver"]],
  ["extended", ["extended mix", "extended version", "dj mix", "extended"]],
  ["ost", ["ost", "original soundtrack", "主题曲"]],
  ["tv-version", ["tv version", "tv ver", "tv size"]],
  ["reprise", ["reprise"]],
];

// 尾部版本词："Song - Live" / "Song Remix" / "Song (Live)"（括号已由 parseTitle 处理）
const TRAILING_VERSION_RE =
  /(?:[-–—:]\s*|\s+)(live(?:\s+version)?|remix|remaster(?:ed)?|acoustic|demo|instrumental|cover|karaoke|radio (?:edit|version|ver)|extended(?: mix)?|ost|tv (?:version|ver|size)|reprise|现场|演唱会|翻唱|混音|伴奏|重制版|纯音乐|钢琴版|吉他版)\s*$/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordHit(kw: string, low: string): boolean {
  // 拉丁关键词（字母/数字/空格）：按词边界匹配，避免 "Alive"/"Deliverance" 被误判成 live
  if (/^[a-z0-9 ]+$/.test(kw)) {
    return new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(low);
  }
  // CJK / 其它：直接用子串（"现场"/"大祭典" 等）
  return low.includes(kw);
}

function tokenizeVersion(low: string): VersionKind[] {
  const out = new Set<VersionKind>();
  for (const [kind, kws] of VERSION_TOKEN_MAP) {
    for (const kw of kws) {
      if (keywordHit(kw, low)) {
        out.add(kind);
        break;
      }
    }
  }
  return [...out];
}

/** 从标题提取 baseTitle + version token 列表（可导出给 provider/日志用） */
export function parseTitle(raw: string): { baseTitle: string; versionTokens: VersionKind[] } {
  let t = String(raw || "").trim();
  const versions = new Set<VersionKind>();

  // 1) 括号/方括号 / 全角括号片段：内容可能是版本元数据（安全提取），整体删除
  t = t.replace(/[[(（【][^\]）)】]*[\])）】]/g, (m) => {
    for (const kind of tokenizeVersion(m.replace(/[[(（【\]）)】]/g, "").toLowerCase())) {
      versions.add(kind);
    }
    return " ";
  });

  // 2) 尾部 "- Live" / "- Remix" 等
  t = t.replace(TRAILING_VERSION_RE, (_match, kw: string) => {
    for (const kind of tokenizeVersion(String(kw).toLowerCase())) versions.add(kind);
    return " ";
  });

  // 3) 去掉 feat. / ft. / featuring 部分（可能是 "Song feat. Artist"）
  t = t.replace(/\s+(?:featuring|feat\.?|ft\.?)\s+.{0,60}$/gi, " ");

  return { baseTitle: normalizeTitle(t), versionTokens: [...versions] };
}

// ============================================================
// 标题归一化
// ============================================================
/** 轻量归一化：大小写 / NFKC / 零宽 / 标点→空格 / 连续空格→单个。保留词间空格。 */
export function normalizeTitle(raw: unknown): string {
  return String(raw || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ")
    .replace(/[‘’"“”]/g, "'")
    .replace(/[【】[\]()（）{}<>《》]/g, " ")
    .replace(/[.,:;!?、。，；！？…·・]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 标题相似度（纯 levenshtein 比率，无子串捷径——避免 "Ocean"≈"Ocean Eyes" 被误判） */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  return Math.max(0, 1 - dist / Math.max(x.length, y.length));
}

function titleStatusOf(aBase: string, bBase: string, sim: number): TitleStatus {
  if (aBase === bBase) return "EXACT";
  if (sim >= TITLE_NORMALIZED_MIN) return "NORMALIZED";
  if (sim >= TITLE_SIMILAR_MIN) return "SIMILAR";
  return "MISMATCH";
}

// ============================================================
// 艺人匹配（三态）
// ============================================================
const ARTIST_SEPARATOR_RE =
  /\s*(?:featuring|feat\.?|ft\.?|with|\bvs\.?|\bversus\b|&|;|；|,|，|、|\/|\||·|\band\b|\b和\b)\s*/gi;

/** 艺人字符串拆分（供 provider 抛出 Candidate 前使用 + 用于测试）；括号内容为别名清掉 */
export function splitArtists(raw: string): string[] {
  const r = String(raw || "").trim();
  if (!r) return [];
  const stripped = r
    .replace(/[[(（【][^\]）)】]*[\])）】]/g, " ")
    .replace(/[[(（【\]）)】]/g, " ")
    .replace(ARTIST_SEPARATOR_RE, "|");
  return [
    ...new Set(
      stripped
        .split("|")
        .map((p) => normalizeText(p))
        .filter(Boolean)
    ),
  ];
}

function scriptOf(s: string): "latin" | "cjk" | "hangul" | "kana" | "other" {
  if (/[\u3040-\u30ff]/.test(s)) return "kana";
  if (/[\uac00-\ud7af]/.test(s)) return "hangul";
  if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(s)) return "cjk";
  if (/[a-z0-9]/.test(s)) return "latin";
  return "other";
}

function isAmbiguousScript(script: string): boolean {
  return script === "cjk" || script === "hangul" || script === "kana";
}

/**
 * 艺人三态匹配。
 * MATCH  ：至少一对「同语系」艺人构成确认相似。
 * MISMATCH：存在同语系 pair 却无一确认相似（→ 明确不同艺人）；或完全跨语系且数量不对称（单人对多人）。
 * UNKNOWN ：候选缺艺人；或完全跨语系且数量对称（单对单，可能是译名）。
 *
 * 关键设计：只要「有同语系 pair 可比较」，就必须有一对确认相似才算 MATCH，否则判 MISMATCH。
 * 这修复了「中文/韩文/日文同名不同艺人永远无法硬拒」的问题：
 *   蔡依林 vs 周杰伦（同 CJK、相似度 0）→ MISMATCH（此前是 UNKNOWN→loose→可能自动返回）。
 *   陈奕迅 vs 陳奕迅（简繁，相似度 0.67）→ MATCH。
 * 译名（周杰伦 vs Jay Chou，全跨语系 1v1）→ 保留 UNKNOWN（不误杀），但绝不自动返回。
 */
export function artistMatch(
  spotArtists: string[],
  candArtists: string[]
): { status: ArtistStatus; similarity: number } {
  const sp = spotArtists.map(normalizeText).filter(Boolean);
  const ca = candArtists.map(normalizeText).filter(Boolean);
  if (!sp.length || !ca.length) return { status: "UNKNOWN", similarity: 0 };

  let bestSimilarity = 0;
  let anySameScriptPair = false;

  for (const a of sp) {
    for (const b of ca) {
      const sa = scriptOf(a);
      const sb = scriptOf(b);
      if (sa !== sb) continue; // 跨语系：可能是译名/罗马音，不在此判定
      anySameScriptPair = true;
      const s = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
      if (s <= 0) continue;
      if (isAmbiguousScript(sa)) {
        if (s >= AMBIGUOUS_CONFIRM) bestSimilarity = Math.max(bestSimilarity, s);
      } else if (sa === "other") {
        // 泰文/阿拉伯文等非拉丁非 CJK：语系内同名差异普遍，无法可靠区分 → 只认完全一致，
        // 其余归入 UNKNOWN（宁可不判，也不要误拒成 MISMATCH 硬拒）
        if (s >= 0.99) bestSimilarity = Math.max(bestSimilarity, s);
      } else {
        // 拉丁：短名（任一方 ≤10 字符）需要更接近（1 字符差即不同人），长名放宽
        const shortName = a.length <= SHORT_NAME_LEN || b.length <= SHORT_NAME_LEN;
        const bar = shortName ? LATIN_SHORT_CONFIRM : LATIN_CONFIRM;
        if (s >= bar) bestSimilarity = Math.max(bestSimilarity, s);
      }
    }
  }

  if (bestSimilarity > 0) return { status: "MATCH", similarity: bestSimilarity };
  // 同语系 pair 存在却无一确认相似 → 明确不同。但 "other"（泰/阿等）不在此列：
  // 它们不做 MATCH 判定，也不会因无相似对而误判 MISMATCH。
  if (
    anySameScriptPair &&
    !sp.some((a) => scriptOf(a) === "other") &&
    !ca.some((b) => scriptOf(b) === "other")
  ) {
    return { status: "MISMATCH", similarity: 0 };
  }
  // 完全跨语系：译名是「一对一」（或整团对整团）的；数量不对称（单人对多人）→ 明确不同
  if (sp.length !== ca.length) return { status: "MISMATCH", similarity: 0 };
  return { status: "UNKNOWN", similarity: 0 };
}

// ============================================================
// 版本比较
// ============================================================
function versionStatusOf(spotTokens: VersionKind[], candTokens: VersionKind[]): VersionStatus {
  const a = new Set(spotTokens);
  const b = new Set(candTokens);
  if (a.size === 0 && b.size === 0) return "NONE";
  const overlap = [...a].some((v) => b.has(v));
  return overlap ? "MATCH" : "MISMATCH";
}

// ============================================================
// 时长 / ISRC / 专辑
// ============================================================
function durationScoreOf(
  spotMs?: number,
  candMs?: number
): { score: number; gapSec: number | null } {
  if (!spotMs || spotMs <= 0 || !candMs || candMs <= 0) return { score: 0, gapSec: null };
  const gapSec = Math.abs(spotMs - candMs) / 1000;
  if (gapSec <= 3) return { score: DURATION_LE3, gapSec };
  if (gapSec <= 10) return { score: DURATION_LE10, gapSec };
  if (gapSec <= 20) return { score: DURATION_LE20, gapSec };
  if (gapSec <= 40) return { score: DURATION_LE40, gapSec };
  return { score: DURATION_GT40, gapSec };
}

function albumScoreOf(spot?: string, cand?: string): number {
  if (!spot || !cand) return 0;
  const sa = normalizeText(spot);
  const ca = normalizeText(cand);
  if (!sa || !ca) return 0;
  return sa === ca || sa.includes(ca) || ca.includes(sa) ? ALBUM_SCORE : 0;
}

function isrcScoreOf(spot?: string, cand?: string): { score: number; matched: boolean | null } {
  if (!spot || !cand) return { score: 0, matched: null };
  const s = normalizeText(spot);
  const c = normalizeText(cand);
  if (!s || !c) return { score: 0, matched: null };
  if (s === c) return { score: ISRC_MATCH_SCORE, matched: true };
  return { score: ISRC_MISMATCH_SCORE, matched: false };
}

// ============================================================
// 统一评分
// ============================================================
// target 的标题在 scorePool 里对每个候选重复解析（parseTitle 含正则），memo 后一次请求只算一次。
const parsedTitleMemo = new Map<string, ReturnType<typeof parseTitle>>();
function parseTitleCached(raw: string): ReturnType<typeof parseTitle> {
  let hit = parsedTitleMemo.get(raw);
  if (!hit) {
    hit = parseTitle(raw);
    parsedTitleMemo.set(raw, hit);
    // 防无限增长：请求级生命周期，超过 500 条清空（几乎不可能触发）
    if (parsedTitleMemo.size > 500) parsedTitleMemo.clear();
  }
  return hit;
}

export function matchCandidate(target: TargetTrack, cand: Candidate): MatchResult {
  const sp = parseTitleCached(target.title);
  const cp = parseTitle(cand.title);
  const sim = titleSimilarity(sp.baseTitle, cp.baseTitle);
  const titleStatus = titleStatusOf(sp.baseTitle, cp.baseTitle, sim);
  const titleScore =
    titleStatus === "EXACT"
      ? TITLE_EXACT_SCORE
      : titleStatus === "NORMALIZED"
        ? TITLE_NORMALIZED_SCORE
        : titleStatus === "SIMILAR"
          ? TITLE_SIMILAR_SCORE
          : TITLE_MISMATCH_SCORE;

  const am = artistMatch(target.artists, cand.artists);
  const artistScore =
    am.status === "MATCH"
      ? am.similarity >= ARTIST_EXACT_SIM
        ? ARTIST_EXACT_SCORE
        : am.similarity >= ARTIST_STRONG_SIM
          ? ARTIST_STRONG_SCORE
          : ARTIST_NORMAL_SCORE
      : 0;

  const dur = durationScoreOf(target.durationMs, cand.durationMs);
  const albumScore = albumScoreOf(target.album, cand.album);
  const isrc = isrcScoreOf(target.isrc, cand.isrc);
  const version = versionStatusOf(sp.versionTokens, cp.versionTokens);
  const versionScore =
    version === "MISMATCH" ? VERSION_MISMATCH_SCORE : version === "MATCH" ? VERSION_MATCH_SCORE : 0;

  // ---- HARD REJECT：艺人明确不同 → 与分数无关，永不放行 ----
  if (am.status === "MISMATCH") {
    return finalize(
      target,
      cand,
      titleStatus,
      am,
      titleScore,
      dur,
      albumScore,
      isrc,
      version,
      versionScore,
      cp.versionTokens,
      /* rejected */ true,
      "ARTIST_MISMATCH"
    );
  }
  // ---- HARD REJECT：标题不同（titles 完全不同，不可能是同一首） ----
  if (titleStatus === "MISMATCH") {
    return finalize(
      target,
      cand,
      titleStatus,
      am,
      titleScore,
      dur,
      albumScore,
      isrc,
      version,
      versionScore,
      cp.versionTokens,
      /* rejected */ true,
      "TITLE_MISMATCH"
    );
  }

  // ---- 总分 ----
  let score = titleScore + artistScore + dur.score + albumScore + isrc.score + versionScore;
  if (am.status === "UNKNOWN") {
    // 艺人不确定：即使 title/duration 全中也不允许高出 UNCERTAIN（见 finalize 的 needsVerification）
    // 这里对分数做温和上限（72/100 = 0.72，恒 < 0.80 的 ACCEPT_CONF），确保永远不能自动选中
    score = Math.min(score, UNKNOWN_ARTIST_SCORE_CAP);
  }
  const confidence = clamp(score / CONF_MAX, 0, 1);

  // ---- LOW_CONFIDENCE：conf < 0.70 → REJECT ----
  if (score < REJECT_CONF * CONF_MAX) {
    return finalize(
      target,
      cand,
      titleStatus,
      am,
      titleScore,
      dur,
      albumScore,
      isrc,
      version,
      versionScore,
      cp.versionTokens,
      /* rejected */ true,
      "LOW_CONFIDENCE"
    );
  }

  return finalize(
    target,
    cand,
    titleStatus,
    am,
    titleScore,
    dur,
    albumScore,
    isrc,
    version,
    versionScore,
    sp.versionTokens,
    /* rejected */ false,
    undefined,
    score,
    confidence
  );
}

function finalize(
  target: TargetTrack,
  cand: Candidate,
  titleStatus: TitleStatus,
  am: { status: ArtistStatus; similarity: number },
  titleScore: number,
  dur: { score: number; gapSec: number | null },
  albumScore: number,
  isrc: { score: number; matched: boolean | null },
  version: VersionStatus,
  versionScore: number,
  versionTokens: VersionKind[],
  rejected: boolean,
  rejectReason?: RejectReason,
  outScore?: number,
  outConfidence?: number
): MatchResult {
  const score = outScore ?? 0;
  const confidence = outConfidence ?? clamp(score / CONF_MAX, 0, 1);
  const level = confidenceLevel(confidence, rejected);
  // 艺人无法确认 → 需要验证，绝不允许自动返回（即使分数被 cap 后仍 <0.80 也不会入选）
  const needsVerification = am.status === "UNKNOWN";
  return {
    candidate: cand,
    target,
    titleStatus,
    artistStatus: am.status,
    version,
    titleScore,
    artistScore: am.status === "MATCH" ? scoreArtistFromSim(am.similarity) : 0,
    durationScore: dur.score,
    albumScore,
    isrcScore: isrc.score,
    versionScore,
    score,
    confidence,
    level,
    rejected,
    rejectReason,
    needsVerification,
    artistSimilarity: am.similarity,
    versionTokens,
  };
}

function scoreArtistFromSim(sim: number): number {
  if (sim >= ARTIST_EXACT_SIM) return ARTIST_EXACT_SCORE;
  if (sim >= ARTIST_STRONG_SIM) return ARTIST_STRONG_SCORE;
  return ARTIST_NORMAL_SCORE;
}

function confidenceLevel(confidence: number, rejected: boolean): MatchLevel {
  if (rejected) return "REJECT";
  if (confidence >= 0.9) return "HIGH";
  if (confidence >= 0.8) return "GOOD";
  if (confidence >= 0.7) return "UNCERTAIN";
  return "REJECT";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================================
// 排名：level 优先（HIGH > GOOD > UNCERTAIN > REJECT），同级比 score
// ============================================================
const LEVEL_RANK: Record<MatchLevel, number> = { HIGH: 4, GOOD: 3, UNCERTAIN: 2, REJECT: 1 };

export function rankMatch(m: MatchResult): number {
  return LEVEL_RANK[m.level] * 100000 + m.score;
}

// ============================================================
// 最终选择（HARD FILTER）
// ============================================================
/** 一个候选是否具备自动选中资格（过滤掉 rejected / MISMATCH / 需验证 / conf<0.80） */
export function isSelectable(m: MatchResult): boolean {
  return !m.rejected && !m.needsVerification && m.confidence >= ACCEPT_CONF;
}

/**
 * 从池中选择唯一最佳候选。
 * 先 HARD FILTER（剔除 rejected / MISMATCH / needsVerification / conf < 0.80），再 sort。
 * 绝不返回 candidates[0] / bestCandidate ?? candidates[0] / 只因为有歌词就接受。
 * @returns 无合格候选时返回 null（调用方应返回 NO_MATCH）。
 */
export function selectBest(pool: MatchResult[]): MatchResult | null {
  const eligible = pool.filter(isSelectable);
  if (!eligible.length) return null;
  eligible.sort((a, b) => rankMatch(b) - rankMatch(a));
  return eligible[0];
}

// ============================================================
// 结构化调试日志（[lyrivaMusic Matcher]）
// ============================================================
