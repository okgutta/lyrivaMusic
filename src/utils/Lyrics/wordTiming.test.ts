import { normalizeWordTiming } from "./wordTiming.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const line = { text: "你好 世界", startMs: 1000, endMs: 2200 };
const words = normalizeWordTiming(
  [
    { text: "你好", startMs: 1000, durationMs: 400 },
    { text: "世界", startMs: 1500, durationMs: 500 },
  ],
  line,
  10000
);
assert(
  words?.[0].endMs === 1400 && words[1].endMs === 2000,
  "API durationMs must be added to each absolute word start"
);
assert(
  words.map((word) => word.text).join("") === line.text,
  "Word timing must preserve spaces and source text"
);

const clipped = normalizeWordTiming([{ text: "字", startMs: 0, durationMs: 0 }], {
  text: "字",
  startMs: 0,
  endMs: 0,
});
assert(
  clipped?.length === 1 &&
    clipped[0].startMs === 0 &&
    clipped[0].endMs === 0 &&
    clipped[0].text === "字",
  "Zero-duration words from API offset clipping must retain their text and timing"
);

const startsOnly = normalizeWordTiming(
  [
    { text: "你好", startMs: 1000 },
    { text: "世界", startMs: 1500 },
  ],
  line
);
assert(
  startsOnly?.[0].endMs === 1500 && startsOnly[1].endMs === 2200,
  "Optional word durations should use the next known timestamp or row end"
);
const legacy = normalizeWordTiming([{ text: line.text, startMs: 1000, endMs: 2000 }], line);
assert(legacy?.[0].endMs === 2000, "Existing explicit endMs payloads should remain supported");

for (const invalid of [
  [{ text: line.text, startMs: 1000, durationMs: -1 }],
  [{ text: line.text, startMs: 1000, durationMs: Number.NaN }],
  [{ text: line.text, startMs: 1000, endMs: 900 }],
  [{ text: "different text", startMs: 1000, durationMs: 500 }],
  [
    { text: "你好", startMs: 1400, durationMs: 400 },
    { text: "世界", startMs: 1300, durationMs: 500 },
  ],
  [{ text: line.text, startMs: 1000, durationMs: 10000 }],
]) {
  assert(
    !normalizeWordTiming(invalid, line, 10000),
    "Invalid word timing should fall back to the line without inventing karaoke"
  );
}
console.log("Word timing tests passed");
