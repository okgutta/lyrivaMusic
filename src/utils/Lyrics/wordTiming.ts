/** The public API uses absolute milliseconds and optional per-word durations. */
export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

const time = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const compact = (value: string) => value.replace(/\s+/g, "");

/** Invalid word data falls back to its original timed line, never guessed syllables. */
export function normalizeWordTiming(
  raw: unknown,
  line: { text: string; startMs: number | null; endMs: number | null },
  trackDurationMs?: number
): TimedWord[] | undefined {
  if (!Array.isArray(raw) || !raw.length || raw.length > 2048 || line.startMs === null) return;
  const words: TimedWord[] = [];
  let previousStart = line.startMs;
  for (let index = 0; index < raw.length; index++) {
    const word = raw[index];
    if (
      !word ||
      typeof word !== "object" ||
      typeof word.text !== "string" ||
      !word.text ||
      !time(word.startMs) ||
      word.startMs < previousStart
    )
      return;
    // A declared duration is authoritative (including zero after offset clipping).
    if (word.durationMs !== undefined && !time(word.durationMs)) return;
    if (word.endMs !== undefined && !time(word.endMs)) return;
    const endMs =
      word.durationMs !== undefined
        ? word.startMs + word.durationMs
        : (word.endMs ?? raw[index + 1]?.startMs ?? line.endMs);
    if (
      !time(endMs) ||
      endMs < word.startMs ||
      endMs > (trackDurationMs ?? Number.MAX_SAFE_INTEGER)
    )
      return;
    words.push({ text: word.text, startMs: word.startMs, endMs });
    previousStart = word.startMs;
  }
  if (compact(words.map((word) => word.text).join("")) !== compact(line.text)) return;
  // Keep the exact source spelling, punctuation and spaces, even when upstream
  // word tokens omit separators. Attach spaces to the preceding word.
  let cursor = 0;
  words.forEach((word, index) => {
    const start = cursor;
    let remaining = compact(word.text).length;
    while (cursor < line.text.length && remaining > 0) {
      if (!/\s/.test(line.text[cursor])) remaining--;
      cursor++;
    }
    while (cursor < line.text.length && /\s/.test(line.text[cursor])) cursor++;
    if (index === words.length - 1) cursor = line.text.length;
    word.text = line.text.slice(start, cursor);
  });
  return words;
}
