import { $developerMode } from "../stores.ts";

export type DiagnosticLevel = "idle" | "working" | "success" | "warning" | "error";
export type DiagnosticArea = "service" | "current" | "prefetch" | "cache";

export interface DiagnosticStatus {
  level: DiagnosticLevel;
  title: string;
  detail: string;
  source?: string;
  uri?: string;
  track?: string;
  durationMs?: number;
}

const AREA_LABELS: Record<DiagnosticArea, string> = {
  service: "LYRIVA",
  current: "当前歌词",
  prefetch: "预取",
  cache: "缓存",
};

const LEVEL_LABELS: Record<DiagnosticLevel, string> = {
  idle: "WAIT",
  working: "RUN",
  success: "OK",
  warning: "WARN",
  error: "ERROR",
};

const LEVEL_STYLES: Record<DiagnosticLevel, string> = {
  idle: "background:#3f4350;color:#eef0f6;border-radius:3px;padding:2px 5px;font-weight:700",
  working: "background:#665cf0;color:#fff;border-radius:3px;padding:2px 5px;font-weight:700",
  success: "background:#18794e;color:#e9fff3;border-radius:3px;padding:2px 5px;font-weight:700",
  warning: "background:#8a6116;color:#fff7dd;border-radius:3px;padding:2px 5px;font-weight:700",
  error: "background:#a83246;color:#fff0f2;border-radius:3px;padding:2px 5px;font-weight:700",
};

function emitDiagnostic(area: DiagnosticArea, status: DiagnosticStatus): void {
  // Structured diagnostics are intentionally opt-in. Critical operational
  // warnings still use Logger and remain visible independently.
  if (!$developerMode.get()) return;

  const method =
    status.level === "error"
      ? console.error
      : status.level === "warning"
        ? console.warn
        : status.level === "working"
          ? console.debug
          : console.info;
  const details = {
    detail: status.detail,
    source: status.source,
    durationMs: status.durationMs,
    track: status.track,
    uri: status.uri,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
  };
  method.call(
    console,
    "%c lyrivaMusic %c " +
      AREA_LABELS[area] +
      " %c " +
      LEVEL_LABELS[status.level] +
      " %c " +
      status.title,
    "background:#6e63f0;color:#fff;border-radius:4px 0 0 4px;padding:2px 6px;font-weight:700",
    "background:#292734;color:#d8d5e8;padding:2px 6px;font-weight:600",
    LEVEL_STYLES[status.level],
    "color:#d8d8df;font-weight:600",
    details
  );
}

export function recordServiceDiagnostic(status: DiagnosticStatus): void {
  emitDiagnostic("service", status);
}

export function recordCurrentDiagnostic(status: DiagnosticStatus): void {
  emitDiagnostic("current", status);
}

export function recordPrefetchDiagnostic(status: DiagnosticStatus): void {
  emitDiagnostic("prefetch", status);
}

export function recordCacheDiagnostic(status: DiagnosticStatus): void {
  emitDiagnostic("cache", { ...status, source: status.source ?? "本地缓存" });
}

type LyrivaDiagnosticResult =
  | { kind: "ok" }
  | { kind: "not-found" }
  | { kind: "unavailable"; reason: string }
  | { kind: "skipped" };

export function recordLyrivaResult(
  result: LyrivaDiagnosticResult,
  durationMs: number,
  context: string
): void {
  const common = { source: "LYRIVA", durationMs };
  switch (result.kind) {
    case "ok":
      recordServiceDiagnostic({
        ...common,
        level: "success",
        title: "服务正常",
        detail: `${context} · 已返回歌词`,
      });
      break;
    case "not-found":
      recordServiceDiagnostic({
        ...common,
        level: "success",
        title: "请求完成，无匹配歌词",
        detail: `${context} · 404 是正常的未命中结果`,
      });
      break;
    case "skipped":
      recordServiceDiagnostic({
        ...common,
        level: "error",
        title: "服务未配置",
        detail: `${context} · LYRIVA 密钥为空`,
      });
      break;
    case "unavailable":
      recordServiceDiagnostic({
        ...common,
        level: "error",
        title: "服务不可用",
        detail: `${context} · ${result.reason}`,
      });
      break;
  }
}
