import { persistAtom } from "../stores.ts";

export type LyricsTranslationPosition = "below" | "above";

export interface ReadingPreferencesInput {
  fontScale?: unknown;
  translationSize?: unknown;
  lineSpacing?: unknown;
  translationPosition?: unknown;
}

export interface NormalizedReadingPreferences {
  fontScale: number;
  translationSize: number;
  lineSpacing: number;
  translationPosition: LyricsTranslationPosition;
}

function percentage(value: unknown, fallback: number, min: number, max: number, step: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped / step) * step;
}

const fontScale = (value: unknown) => percentage(value, 100, 80, 140, 5);
const translationSize = (value: unknown) => percentage(value, 58, 35, 100, 1);
const lineSpacing = (value: unknown) => percentage(value, 100, 75, 160, 5);
const translationPosition = (value: unknown): LyricsTranslationPosition =>
  value === "above" ? "above" : "below";

/** Accept stored percentages and return safe multipliers for lyric layout. */
export function normalizeReadingPreferences(
  input: ReadingPreferencesInput = {}
): NormalizedReadingPreferences {
  return {
    fontScale: fontScale(input?.fontScale) / 100,
    translationSize: translationSize(input?.translationSize) / 100,
    lineSpacing: lineSpacing(input?.lineSpacing) / 100,
    translationPosition: translationPosition(input?.translationPosition),
  };
}

function readingAtom<Value>(
  key: string,
  defaultValue: Value,
  normalize: (value: unknown) => Value
) {
  const store = persistAtom<Value>(key, defaultValue);
  const set = store.set.bind(store);
  // Validate both old storage and future writes before any subscriber receives them.
  store.set = (value) => set(normalize(value));
  store.set(store.get());
  return store;
}

export const $lyricsFontScale = readingAtom("lyricsFontScale", 100, fontScale);
export const $lyricsTranslationSize = readingAtom("lyricsTranslationSize", 58, translationSize);
export const $lyricsLineSpacing = readingAtom("lyricsLineSpacing", 100, lineSpacing);
export const $lyricsTranslationPosition = readingAtom<LyricsTranslationPosition>(
  "lyricsTranslationPosition",
  "below",
  translationPosition
);
