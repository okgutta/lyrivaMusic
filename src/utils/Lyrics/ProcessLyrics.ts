import cyrillicToLatin from "cyrillic-romanization";
import { franc } from "franc-all";
import langs from "langs";
import type { LyricsPayload } from "./matcher.ts";

// Romanization must never execute code fetched at runtime. API-provided
// transliterations are kept as-is; the only generated form is Cyrillic because
// that converter is bundled with the extension and needs no remote dictionary.
const CyrillicTextTest = /[Ѐ-ӿԀ-ԯⷠ-ⷿꙀ-ꚟ]/;

type RomanizeEntry = { target: any; line: any };

function gatherEntries(lyrics: LyricsPayload): { francText: string; entries: RomanizeEntry[] } {
  const entries: RomanizeEntry[] = [];
  const textLines: string[] = [];
  const content = Array.isArray(lyrics.Content) ? lyrics.Content : [];
  const lines = Array.isArray(lyrics.Lines) ? lyrics.Lines : [];

  if (lyrics.Type === "Static") {
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      entries.push({ target: line, line });
      textLines.push(String(line.Text ?? ""));
    }
  } else if (lyrics.Type === "Line") {
    for (const vocalGroup of content) {
      if (!vocalGroup || vocalGroup.Type !== "Vocal") continue;
      entries.push({ target: vocalGroup, line: vocalGroup });
      textLines.push(String(vocalGroup.Text ?? ""));
    }
  } else if (lyrics.Type === "Syllable") {
    for (const vocalGroup of content) {
      if (!vocalGroup || vocalGroup.Type !== "Vocal") continue;

      const syllables = Array.isArray(vocalGroup.Lead?.Syllables) ? vocalGroup.Lead.Syllables : [];
      let lineText = "";
      for (const syllable of syllables) {
        if (!syllable || typeof syllable !== "object") continue;
        if (lineText && !syllable.IsPartOfWord) lineText += " ";
        lineText += String(syllable.Text ?? "");
        entries.push({ target: syllable, line: vocalGroup });
      }
      if (lineText) textLines.push(lineText);

      const backgrounds = Array.isArray(vocalGroup.Background) ? vocalGroup.Background : [];
      for (const background of backgrounds) {
        const backgroundSyllables = Array.isArray(background?.Syllables)
          ? background.Syllables
          : [];
        for (const syllable of backgroundSyllables) {
          if (syllable && typeof syllable === "object") {
            entries.push({ target: syllable, line: vocalGroup });
          }
        }
      }
    }
  }

  return { francText: textLines.join("\n"), entries };
}

const ISO639_3_TO_1: Record<string, string> = {
  ara: "ar",
  bel: "be",
  bul: "bg",
  cmn: "zh",
  deu: "de",
  ell: "el",
  fra: "fr",
  heb: "he",
  hin: "hi",
  ind: "id",
  ita: "it",
  jpn: "ja",
  kaz: "kk",
  kor: "ko",
  mkd: "mk",
  mon: "mn",
  nld: "nl",
  por: "pt",
  rus: "ru",
  spa: "es",
  srp: "sr",
  tgk: "tg",
  tha: "th",
  tur: "tr",
  ukr: "uk",
  vie: "vi",
  yue: "zh",
  zho: "zh",
};

function iso2FromFranc(code3: string): string | undefined {
  if (!code3) return undefined;
  const mapped = ISO639_3_TO_1[code3];
  if (mapped) return mapped;
  return (langs as any).where("3", code3)?.["1"] || undefined;
}

function hasTransliteration(entry: any): boolean {
  return typeof entry?.TransliteratedText === "string" && entry.TransliteratedText.length > 0;
}

export type LyricsAnalysis = {
  entries: RomanizeEntry[];
  hadApiTransliterations: boolean;
};

/** Analyze language metadata. Call this after the first lyrics frame is mounted. */
export function AnalyzeLyrics(lyrics: LyricsPayload): LyricsAnalysis {
  const { francText, entries } = gatherEntries(lyrics);
  const language = francText.trim() ? franc(francText) : "und";
  lyrics.Language = language;
  lyrics.LanguageISO2 = iso2FromFranc(language);

  return {
    entries,
    hadApiTransliterations:
      lyrics.HasTransliterations === true ||
      entries.some(({ target }) => hasTransliteration(target)),
  };
}

/** Apply bundled-only enhancements; this function never performs network I/O. */
export async function ProcessLyrics(
  lyrics: LyricsPayload,
  analysis: LyricsAnalysis = AnalyzeLyrics(lyrics)
): Promise<boolean> {
  let appliedRomanization = false;

  for (const { target, line } of analysis.entries) {
    if (hasTransliteration(target)) continue;
    const source = String(target?.Text ?? "");
    if (!source || !CyrillicTextTest.test(source)) continue;
    const transliterated = cyrillicToLatin(source);
    if (!transliterated || transliterated === source) continue;
    target.TransliteratedText = transliterated;
    line.HasTransliterations = true;
    appliedRomanization = true;
  }

  lyrics.HasTransliterations = analysis.hadApiTransliterations || appliedRomanization;
  return appliedRomanization;
}
