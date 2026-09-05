// LyraLogger — Lyra 歌词匹配管线的统一日志器
//
// 设计目标：
//   - 一次歌词请求 = 一个 requestId（[LYRA #A81F]），同一次请求的所有日志共用该 id。
//   - 默认简洁（不刷屏）；仅在 developer mode 开启 DEBUG 时输出完整 Matcher 细节。
//   - 统一 emoji + %c 着色 + console.group/groupCollapsed/console.table。
//   - 提供 HARD_REJECT / SELECTED / NO_MATCH 等结构化标记。
//   - 纯日志层：不改变任何匹配/生产逻辑。
import { $developerMode } from "./stores.ts";

const HEAD_STYLE = "color:#5aa9ff;font-weight:700;";
const BODY_STYLE = "color:inherit;";

let seq = 0;
/** 递增生成 4 位十六进制 requestId（A81F 之类），同一次请求内保持不变 */
function nextId(): string {
  seq = (seq + 1) & 0xffff;
  return seq.toString(16).padStart(4, "0").toUpperCase();
}

function text(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export class LyraLogger {
  /** 本次请求的 requestId（4 位十六进制） */
  readonly id: string;
  /** 是否包含 DEBUG 详情（由 developer mode 决定） */
  readonly debugEnabled: boolean;

  constructor(readonly label = "") {
    this.id = nextId();
    this.debugEnabled = Boolean($developerMode.get());
  }

  private frame(emoji: string, body: string): string {
    return `%c[LYRA #${this.id}]%c${emoji ? ` ${emoji}` : ""}${body ? ` ${body}` : ""}`;
  }

  private emit(
    level: "log" | "warn" | "error" | "debug",
    emoji: string,
    body: string
  ): void {
    if (level === "debug" && !this.debugEnabled) return;
    const fn =
      level === "warn" ? console.warn : level === "error" ? console.error : level === "debug" ? console.debug : console.log;
    fn(this.frame(emoji, body), HEAD_STYLE, BODY_STYLE);
  }

  // ============================================================
  // 通用层级
  // ============================================================
  info(emoji: string, message: unknown): void {
    this.emit("log", emoji, text(message));
  }
  debug(message: unknown): void {
    this.emit("debug", "", text(message));
  }
  warn(message: unknown): void {
    this.emit("warn", "⚠️", text(message));
  }
  error(message: unknown): void {
    this.emit("error", "⛔", text(message));
  }

  /** 带缩进的行（无 emoji，用于候选/详情等子行） */
  indent(msg: unknown, pad = ""): void {
    this.emit("log", "", `${pad}${text(msg)}`);
  }

  // ============================================================
  // 结构化输出（默认简洁模式）
  // ============================================================
  /** 🎵 当前曲目：title — artist */
  song(title: string, artist: string): void {
    this.info("🎵", `${title} ${artist ? `— ${artist}` : ""}`.trim());
  }

  /** 🔎 各 Provider 候选数：Genius 8 · LRCLIB 0 · NCM 37 · QQ 25 */
  providerCounts(entries: Array<{ source: string; count: number }>): void {
    if (!entries.length) return;
    this.info("🔎", entries.map((e) => `${cap(e.source)} ${e.count}`).join(" · "));
  }

  /** 🧠 Matcher 区块 */
  matcherStart(): void {
    this.info("🧠", this.debugEnabled ? "Matcher (debug)" : "Matcher");
  }

  /** Matcher 子行：源 状态（如 "   Genius     0.80 GOOD" / "   QQ  REJECT · ARTIST_MISMATCH"） */
  matcherRow(source: string, verdict: string): void {
    this.indent(`${source.padEnd(10)} ${verdict}`, "   ");
  }

  /** ✅ SELECTED 及被选中的候选详情 */
  selected(source: string, title: string, artist: string, extra?: string): void {
    this.info("✅", "SELECTED");
    this.indent(`${source} · ${title}${artist ? ` — ${artist}` : ""}${extra ? ` (${extra})` : ""}`, "   ");
  }

  /** ⚪ NO_MATCH */
  noMatch(): void {
    this.info("⚪", "NO_MATCH");
  }

  /** ❌ HARD_REJECT 及 Reason */
  hardReject(reason: string): void {
    this.info("❌", "HARD_REJECT");
    this.indent(`Reason: ${reason}`, "   ");
  }

  // ============================================================
  // DEBUG 模式的结构化细节（仅 debugEnabled）
  // ============================================================
  /** 目标元数据（DEBUG） */
  debugTarget(target: { title: string; artists: string[]; album?: string; durationMs?: number; isrc?: string }): void {
    if (!this.debugEnabled) return;
    this.group("🎯 Target metadata");
    this.indent(`title="${target.title}"`, "   ");
    this.indent(`artist="${target.artists.join(" / ")}"`, "   ");
    this.indent(`album="${target.album ?? "(none)"}"`, "   ");
    this.indent(`duration=${target.durationMs ? Math.round(target.durationMs / 1000) + "s" : "(unknown)"}`, "   ");
    this.indent(`isrc=${target.isrc ?? "(none)"}`, "   ");
    this.groupEnd();
  }

  /** Provider 候选列表（DEBUG） */
  debugProviders(bySource: Array<{ source: string; candidates: Array<{ title: string; artists: string[] }> }>): void {
    if (!this.debugEnabled) return;
    this.group("🗂 Provider candidates");
    for (const seg of bySource) {
      this.indent(`${cap(seg.source)} (${seg.candidates.length}):`, "   ");
      for (const c of seg.candidates.slice(0, 6)) {
        this.indent(`· ${c.title} — ${c.artists.join(", ") || "(null)"}`, "      ");
      }
      if (seg.candidates.length > 6) this.indent(`· … ${seg.candidates.length - 6} more`, "      ");
    }
    this.groupEnd();
  }

  /** 候选对比表（DEBUG，console.table） */
  debugTable(rows: Array<Record<string, unknown>>): void {
    if (!this.debugEnabled) return;
    console.table(rows);
  }

  /** 单条字段（DEBUG）：Artist match / Title match / Version … */
  debugField(label: string, value: string): void {
    if (!this.debugEnabled) return;
    this.indent(`${label}: ${value}`, "   ");
  }

  private group(label: string): void {
    console.group(`%c[LYRA #${this.id}]%c ${label}`, HEAD_STYLE, BODY_STYLE);
  }
  private groupEnd(): void {
    console.groupEnd();
  }
}

/** 快捷工厂：创建一次请求的日志器 */
export function createLyraRequest(label = ""): LyraLogger {
  return new LyraLogger(label);
}

export const __isDebug = (): boolean => Boolean($developerMode.get());
