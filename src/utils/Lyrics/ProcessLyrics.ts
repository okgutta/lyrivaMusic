import cyrillicToLatin from "cyrillic-romanization";
import { franc } from "franc-all";
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
  // ISO 639-3 -> ISO 639-1. Keep this lookup local so lyric processing does
  // not ship the 40 KB `langs` package just to resolve a three-letter code.
  abk: "ab",
  aar: "aa",
  afr: "af",
  aka: "ak",
  sqi: "sq",
  amh: "am",
  ara: "ar",
  arg: "an",
  hye: "hy",
  asm: "as",
  ava: "av",
  ave: "ae",
  aym: "ay",
  aze: "az",
  bam: "bm",
  bak: "ba",
  eus: "eu",
  bel: "be",
  ben: "bn",
  bih: "bh",
  bis: "bi",
  bos: "bs",
  bre: "br",
  bul: "bg",
  mya: "my",
  cat: "ca",
  cha: "ch",
  che: "ce",
  nya: "ny",
  zho: "zh",
  // franc distinguishes Mandarin and Cantonese; both use the Chinese UI
  // language code in the existing app behavior.
  cmn: "zh",
  yue: "zh",
  chv: "cv",
  cor: "kw",
  cos: "co",
  cre: "cr",
  hrv: "hr",
  ces: "cs",
  dan: "da",
  div: "dv",
  nld: "nl",
  dzo: "dz",
  eng: "en",
  epo: "eo",
  est: "et",
  ewe: "ee",
  fao: "fo",
  fij: "fj",
  fin: "fi",
  fra: "fr",
  ful: "ff",
  glg: "gl",
  kat: "ka",
  deu: "de",
  ell: "el",
  grn: "gn",
  guj: "gu",
  hat: "ht",
  hau: "ha",
  heb: "he",
  her: "hz",
  hin: "hi",
  hmo: "ho",
  hun: "hu",
  ina: "ia",
  ind: "id",
  ile: "ie",
  gle: "ga",
  ibo: "ig",
  ipk: "ik",
  ido: "io",
  isl: "is",
  ita: "it",
  iku: "iu",
  jpn: "ja",
  jav: "jv",
  kal: "kl",
  kan: "kn",
  kau: "kr",
  kas: "ks",
  kaz: "kk",
  khm: "km",
  kik: "ki",
  kin: "rw",
  kir: "ky",
  kom: "kv",
  kon: "kg",
  kor: "ko",
  kur: "ku",
  kua: "kj",
  lat: "la",
  ltz: "lb",
  lug: "lg",
  lim: "li",
  lin: "ln",
  lao: "lo",
  lit: "lt",
  lub: "lu",
  lav: "lv",
  glv: "gv",
  mkd: "mk",
  mlg: "mg",
  msa: "ms",
  mal: "ml",
  mlt: "mt",
  mri: "mi",
  mar: "mr",
  mah: "mh",
  mon: "mn",
  nau: "na",
  nav: "nv",
  nde: "nd",
  nep: "ne",
  ndo: "ng",
  nob: "nb",
  nno: "nn",
  nor: "no",
  iii: "ii",
  nbl: "nr",
  oci: "oc",
  oji: "oj",
  chu: "cu",
  orm: "om",
  ori: "or",
  oss: "os",
  pan: "pa",
  pli: "pi",
  fas: "fa",
  pol: "pl",
  pus: "ps",
  por: "pt",
  que: "qu",
  roh: "rm",
  run: "rn",
  ron: "ro",
  rus: "ru",
  san: "sa",
  srd: "sc",
  snd: "sd",
  sme: "se",
  smo: "sm",
  sag: "sg",
  srp: "sr",
  gla: "gd",
  sna: "sn",
  sin: "si",
  slk: "sk",
  slv: "sl",
  som: "so",
  sot: "st",
  spa: "es",
  sun: "su",
  swa: "sw",
  ssw: "ss",
  swe: "sv",
  tam: "ta",
  tel: "te",
  tgk: "tg",
  tha: "th",
  tir: "ti",
  bod: "bo",
  tuk: "tk",
  tgl: "tl",
  tsn: "tn",
  ton: "to",
  tur: "tr",
  tso: "ts",
  tat: "tt",
  twi: "tw",
  tah: "ty",
  uig: "ug",
  ukr: "uk",
  urd: "ur",
  uzb: "uz",
  ven: "ve",
  vie: "vi",
  vol: "vo",
  wln: "wa",
  cym: "cy",
  wol: "wo",
  fry: "fy",
  xho: "xh",
  yid: "yi",
  yor: "yo",
  zha: "za",
  zul: "zu",
};

function iso2FromFranc(code3: string): string | undefined {
  if (!code3) return undefined;
  return ISO639_3_TO_1[code3];
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
