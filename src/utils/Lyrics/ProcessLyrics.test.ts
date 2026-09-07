import { ProcessLyrics } from "./ProcessLyrics.ts";
import type { LyricsPayload } from "./matcher.ts";

const cyrillic: LyricsPayload = {
  Type: "Line",
  Content: [{ Type: "Vocal", Text: "Привет мир" }],
};

const changed = await ProcessLyrics(cyrillic);
const transliterated = String(cyrillic.Content?.[0]?.TransliteratedText ?? "");
if (!changed || !cyrillic.HasTransliterations || /[Ѐ-ԯ]/.test(transliterated)) {
  throw new Error("Bundled Cyrillic romanization failed");
}

const supplied = {
  Type: "Static",
  HasTransliterations: true,
  Lines: [{ Text: "中文", TransliteratedText: "zhong wen" }],
} satisfies LyricsPayload;

const suppliedChanged = await ProcessLyrics(supplied);
if (suppliedChanged || supplied.Lines[0].TransliteratedText !== "zhong wen") {
  throw new Error("API-provided transliteration was overwritten");
}

console.log("ProcessLyrics tests passed");
