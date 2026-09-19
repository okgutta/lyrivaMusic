import { ProcessLyrics } from "./ProcessLyrics.ts";
import { buildLyrivaModel } from "./lyrivaMap.ts";
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

const timed = buildLyrivaModel(
  {
    syncedLyrics: [
      {
        startMs: 0,
        durationMs: 1000,
        text: "你好世界",
        words: [
          { text: "你", startMs: 0, durationMs: 250 },
          { text: "好", startMs: 250, durationMs: 250 },
          { text: "世", startMs: 500, durationMs: 250 },
          { text: "界", startMs: 750, durationMs: 250 },
        ],
      },
      {
        startMs: 2000,
        durationMs: 1500,
        text: "Hello world",
        words: [
          { text: "Hello", startMs: 2000, durationMs: 500 },
          { text: "world", startMs: 2500, durationMs: 1000 },
        ],
      },
      {
        startMs: 4000,
        durationMs: 1000,
        text: "Привет мир",
        words: [
          { text: "Привет", startMs: 4000, durationMs: 500 },
          { text: "мир", startMs: 4500, durationMs: 500 },
        ],
      },
    ],
    meta: { matchLevel: "HIGH", matchScore: 0.99 },
  },
  { uri: "spotify:track:timing-fixture", title: "Fixture", artists: ["Fixture"], durationMs: 10000 }
);
if (timed?.Type !== "Syllable")
  throw new Error("Backend word timing did not create syllable lyrics");
const timingSnapshot = () =>
  JSON.stringify(
    timed.Content?.map((line) => ({
      text: line.Text,
      start: line.StartTime,
      end: line.EndTime,
      leadStart: line.Lead?.StartTime,
      leadEnd: line.Lead?.EndTime,
      syllables: line.Lead?.Syllables?.map((word) => ({
        text: word.Text,
        start: word.StartTime,
        end: word.EndTime,
        partOfWord: word.IsPartOfWord,
        preserveTiming: word.PreserveTiming,
      })),
    }))
  );
const before = timingSnapshot();
const enriched = await ProcessLyrics(timed);
if (!enriched || timingSnapshot() !== before) {
  throw new Error(
    "Romanization must preserve the exact source syllable text, boundaries and spacing"
  );
}
const visibleLines = timed.Content?.map((line) =>
  line.Lead?.Syllables?.map(
    (word, index, words) =>
      String(word.Text) + (index < words.length - 1 && !word.IsPartOfWord ? " " : "")
  ).join("")
);
if (visibleLines?.[0] !== "你好世界" || visibleLines[1] !== "Hello world") {
  throw new Error("Extension word groups must join Chinese tokens and retain English word spaces");
}
const romanizedWords = timed.Content?.[2].Lead?.Syllables;
if (
  !romanizedWords?.every(
    (word) =>
      typeof word.TransliteratedText === "string" &&
      word.TransliteratedText.length > 0 &&
      !/[Ѐ-ԯ]/.test(word.TransliteratedText)
  )
) {
  throw new Error("Syllable romanization did not enrich the source tokens");
}

console.log("ProcessLyrics tests passed");
