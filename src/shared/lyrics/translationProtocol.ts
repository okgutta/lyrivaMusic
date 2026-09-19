/** Pure translation response parsing shared by extension and standalone client. */
const MARKER_PREFIX = "[[SPICY_TR_";
const MARKER_REGEX = /\[\[\s*SPICY_TR_([A-Za-z0-9_]+)_(\d+)\s*\]\]/g;

export function cleanLine(text: string): string {
  return (text || "")
    .replace(MARKER_REGEX, "")
    .replace(/```[a-z0-9_-]*/gi, "")
    .replace(/^\s*\d+[.)、]\s*/g, "")
    .replace(
      /^\s*(here('|')?s|here is|here are|sure[,!. ]|translation:?|translated lyrics:?|翻译如下[:：]?|译文[:：]?)\s*/i,
      ""
    )
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMarkerPayload(lines: string[], nonce: string): string {
  return lines.map((line, i) => `${MARKER_PREFIX}${nonce}_${i}]]${line}`).join("\n");
}

export function parseMarkedResponse(
  text: string,
  expectedCount: number,
  nonce: string
): string[] | null {
  const byIndex = parseMarkedResponsePartial(text, expectedCount, nonce);
  if (!byIndex) return null;
  return byIndex.every((line) => line !== "") ? byIndex : null;
}

/**
 * 与 parseMarkedResponse 相同的按标记定位，但允许部分标记缺失：
 * 缺失的位置返回空串，交由调用方定点补译，而不是整块作废。
 * 标记重复或下标越界仍视为不可信响应，返回 null。
 */
export function parseMarkedResponsePartial(
  text: string,
  expectedCount: number,
  nonce: string
): string[] | null {
  if (expectedCount <= 0) return null;
  if (!/^[A-Za-z0-9_]+$/.test(nonce)) return null;
  const markerRegex = new RegExp(`\\[\\[SPICY_TR_${nonce}_(\\d+)\\]\\]`, "g");
  const matches: Array<{ index: number; start: number; markerEnd: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(text)) !== null) {
    matches.push({
      index: Number.parseInt(match[1], 10),
      start: match.index,
      markerEnd: markerRegex.lastIndex,
    });
  }
  if (matches.length === 0) return null;
  const seen = new Set<number>();
  const byIndex = Array.from({ length: expectedCount }, () => "");
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    if (current.index < 0 || current.index >= expectedCount || seen.has(current.index)) return null;
    seen.add(current.index);
    byIndex[current.index] = cleanLine(
      text.slice(current.markerEnd, next ? next.start : text.length)
    );
  }
  return byIndex;
}

export function parseLineFallback(text: string, expectedCount: number): string[] | null {
  const lines = text
    .split(/\r?\n+/)
    .map(cleanLine)
    .filter(Boolean);
  return lines.length === expectedCount ? lines : null;
}
