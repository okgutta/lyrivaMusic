/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import {
  breakdownCacheKey,
  buildHeuristicBreakdown,
  normalizeToken,
  segmentText,
  similarity,
} from "./wordBreakdown.ts";

const compact = (value: string) => value.replace(/\s+/gu, "");

test("latin text splits on whitespace and drops edge punctuation", () => {
  assert.deepEqual(segmentText("Hello, world!"), ["Hello", "world"]);
  assert.deepEqual(segmentText("  don't   stop  "), ["don't", "stop"]);
  assert.deepEqual(segmentText("…And"), ["And"]);
  assert.deepEqual(segmentText("--"), []);
  assert.deepEqual(segmentText("   "), []);
  assert.deepEqual(segmentText(""), []);
});

test("han runs are cut into even pieces with no single-character tail", () => {
  assert.deepEqual(segmentText("一二"), ["一二"]);
  // 3 字：末尾单字并入前一块，不留孤字
  assert.deepEqual(segmentText("一二三"), ["一二三"]);
  assert.deepEqual(segmentText("一二三四"), ["一二", "三四"]);
  assert.deepEqual(segmentText("一二三四五"), ["一二", "三四五"]);
  assert.deepEqual(segmentText("一二三四五六七"), ["一二", "三四", "五六七"]);
});

test("kana attaches to the preceding token and punctuation breaks words", () => {
  assert.deepEqual(segmentText("君の名前"), ["君の", "名前"]);
  assert.deepEqual(segmentText("今日はいい天気ですね"), ["今日はいい", "天気ですね"]);
  // 标点后重新开词，假名不再黏到标点之前
  assert.deepEqual(segmentText("你好，世界"), ["你好", "世界"]);
  // 谚文没有可依的边界，整段保留
  assert.deepEqual(segmentText("안녕하세요"), ["안녕하세요"]);
});

test("normalization strips diacritics, case and non-alphanumerics", () => {
  assert.equal(normalizeToken("Café"), "cafe");
  assert.equal(normalizeToken("Don't"), "dont");
  assert.equal(normalizeToken("  Hello!  "), "hello");
  assert.equal(normalizeToken("你好"), "你好");
});

test("similarity treats identical tokens as a match and short tokens as noise", () => {
  assert.equal(similarity("Hello", "hello"), 1);
  assert.equal(similarity("Café", "cafe"), 1);
  // 单字符词只有一个 bigram，系数非 0 即 1，没有区分度
  assert.equal(similarity("a", "a"), 1);
  assert.equal(similarity("a", "b"), 0);
  // he/el/ll/lo 对 ha/al/ll/lo：命中 ll、lo，Dice = 2 * 2 / 8
  assert.equal(similarity("hello", "hallo"), 0.5);
  assert.equal(similarity("hello", "world"), 0);
  assert.equal(similarity("hello", "你好"), 0);
  assert.equal(similarity("", "hello"), 0);
});

test("heuristic breakdown covers both sides when token counts line up", () => {
  const breakdown = buildHeuristicBreakdown("Hello world", "你好 世界");
  assert.equal(breakdown.origin, "heuristic");
  assert.deepEqual(breakdown.tokens, [
    { source: "Hello", target: "你好", confidence: "medium" },
    { source: "world", target: "世界", confidence: "medium" },
  ]);
});

test("identical tokens become high-confidence anchors", () => {
  const breakdown = buildHeuristicBreakdown("Hello world", "Hello 世界");
  assert.deepEqual(breakdown.tokens, [
    { source: "Hello", target: "Hello", confidence: "high" },
    { source: "world", target: "世界", confidence: "medium" },
  ]);
});

test("anchors are used in source order even when the target repeats", () => {
  const breakdown = buildHeuristicBreakdown("night night", "夜 夜");
  assert.deepEqual(breakdown.tokens, [
    { source: "night", target: "夜", confidence: "medium" },
    { source: "night", target: "夜", confidence: "medium" },
  ]);
});

test("uneven spans are distributed and never drop either side", () => {
  const source = "I love you";
  const target = "我爱你";
  const breakdown = buildHeuristicBreakdown(source, target);
  assert.ok(breakdown.tokens.length > 0);
  assert.equal(compact(breakdown.tokens.map((token) => token.source).join("")), compact(source));
  assert.equal(compact(breakdown.tokens.map((token) => token.target).join("")), compact(target));
  // 按长度硬分的对照一律降权，UI 才不会把猜测当结论
  assert.ok(breakdown.tokens.every((token) => token.confidence === "low"));
});

test("segmentation failures yield no tokens instead of wrong ones", () => {
  assert.deepEqual(buildHeuristicBreakdown("", "你好"), { tokens: [], origin: "heuristic" });
  assert.deepEqual(buildHeuristicBreakdown("Hello", "  —  "), { tokens: [], origin: "heuristic" });
  assert.deepEqual(buildHeuristicBreakdown("", ""), { tokens: [], origin: "heuristic" });
});

test("cache key folds case and whitespace, keeps the target language", () => {
  assert.equal(breakdownCacheKey("  Hello   World ", "zh"), "zh:hello world");
  assert.equal(breakdownCacheKey("Hello World", "ja"), "ja:hello world");
  assert.notEqual(breakdownCacheKey("Hello", "zh"), breakdownCacheKey("Hello", "ja"));
});
