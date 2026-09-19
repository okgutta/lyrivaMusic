/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { planChunks } from "./chunkPlan.ts";

const plan = (lineCount: number, overrides: Partial<Parameters<typeof planChunks>[1]> = {}) =>
  planChunks(lineCount, {
    maxChunkSize: 20,
    concurrency: 3,
    minParallelLines: 12,
    targetLinesPerChunk: 8,
    ...overrides,
  });

const totalOf = (ranges: ReturnType<typeof planChunks>) =>
  ranges.reduce((sum, r) => sum + r.length, 0);

test("ranges always cover every line exactly once, in order", () => {
  for (const count of [1, 2, 7, 8, 12, 13, 20, 21, 40, 41, 100, 137]) {
    const ranges = plan(count);
    assert.equal(totalOf(ranges), count, `line count ${count}`);
    let expected = 0;
    for (const range of ranges) {
      assert.equal(range.start, expected, `contiguous at ${count}`);
      assert.ok(range.length > 0, `non-empty at ${count}`);
      expected += range.length;
    }
  }
});

test("no range exceeds the per-request limit", () => {
  for (const count of [21, 50, 100, 137]) {
    for (const range of plan(count)) assert.ok(range.length <= 20, `count ${count}`);
    // 串行也必须守住上限
    for (const range of plan(count, { concurrency: 1 })) assert.ok(range.length <= 20);
    // Google 的上限更高，块可以更大
    for (const range of plan(count, { maxChunkSize: 50 })) assert.ok(range.length <= 50);
  }
});

test("short lyrics stay in one chunk so parallelism does not add requests", () => {
  assert.equal(plan(1).length, 1);
  assert.equal(plan(11).length, 1);
  assert.deepEqual(plan(11), [{ start: 0, length: 11 }]);
});

test("parallelism splits work once there are enough lines, capped by concurrency", () => {
  assert.equal(plan(12).length, 2);
  assert.equal(plan(40).length, 3);
  assert.equal(plan(40, { concurrency: 2 }).length, 2);
  // 块大小均衡，避免出现 1 行的尾块；并发 1 时块数只由上限决定
  assert.deepEqual(plan(41, { concurrency: 1 }), [
    { start: 0, length: 14 },
    { start: 14, length: 14 },
    { start: 28, length: 13 },
  ]);
});

test("concave inputs fall back to sane defaults instead of throwing", () => {
  assert.deepEqual(plan(0), []);
  assert.deepEqual(plan(-5), []);
  assert.deepEqual(plan(Number.NaN), []);
  // 非法并发/上限回落到上限与串行，仍不丢行
  assert.equal(totalOf(plan(30, { concurrency: 0 })), 30);
  assert.equal(totalOf(plan(30, { maxChunkSize: 0 })), 30);
  assert.equal(totalOf(plan(30, { targetLinesPerChunk: -1 })), 30);
});
