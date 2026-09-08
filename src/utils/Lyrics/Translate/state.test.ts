import { settledTranslationState } from "./state.ts";

let failures = 0;
let passed = 0;

function check(name: string, actual: string, expected: string): void {
  if (actual === expected) {
    passed++;
    return;
  }
  failures++;
  console.error(`[state] ${name}: expected ${expected}, received ${actual}`);
}

check(
  "no lyrics is unavailable",
  settledTranslationState({
    entryCount: 0,
    translatedCount: 0,
    hasNativeTranslation: false,
    hasTrackCache: false,
    sourceMatchesTarget: false,
  }),
  "unavailable"
);

check(
  "native translation is complete even when some lines are intentionally omitted",
  settledTranslationState({
    entryCount: 10,
    translatedCount: 6,
    hasNativeTranslation: true,
    hasTrackCache: false,
    sourceMatchesTarget: false,
  }),
  "complete"
);

check(
  "whole-track cache is complete even when identity lines are blank",
  settledTranslationState({
    entryCount: 10,
    translatedCount: 8,
    hasNativeTranslation: false,
    hasTrackCache: true,
    sourceMatchesTarget: false,
  }),
  "complete"
);

check(
  "line cache covering every line is complete",
  settledTranslationState({
    entryCount: 10,
    translatedCount: 10,
    hasNativeTranslation: false,
    hasTrackCache: false,
    sourceMatchesTarget: false,
  }),
  "complete"
);

check(
  "original lyrics without translation is ready",
  settledTranslationState({
    entryCount: 10,
    translatedCount: 0,
    hasNativeTranslation: false,
    hasTrackCache: false,
    sourceMatchesTarget: false,
  }),
  "ready"
);

check(
  "partial in-memory translation remains ready to translate missing lines",
  settledTranslationState({
    entryCount: 10,
    translatedCount: 4,
    hasNativeTranslation: false,
    hasTrackCache: false,
    sourceMatchesTarget: false,
  }),
  "ready"
);

check(
  "source already matching target is unavailable",
  settledTranslationState({
    entryCount: 10,
    translatedCount: 0,
    hasNativeTranslation: false,
    hasTrackCache: false,
    sourceMatchesTarget: true,
  }),
  "unavailable"
);

console.log(`[state] ${passed} passed, ${failures} failed`);
if (failures > 0) (globalThis as any).process?.exit?.(1);
