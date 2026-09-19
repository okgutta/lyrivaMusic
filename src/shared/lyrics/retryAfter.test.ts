/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { parseRetryAfterMs } from "./retryAfter.ts";

const now = Date.parse("2026-01-01T00:00:00Z");

test("delta-seconds is converted to milliseconds", () => {
  assert.equal(parseRetryAfterMs("4", now), 4000);
  assert.equal(parseRetryAfterMs(" 12 ", now), 12_000);
  assert.equal(parseRetryAfterMs("0", now), 0);
});

test("HTTP-date is converted relative to now and never negative", () => {
  assert.equal(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", now), 5000);
  // 已经过去的日期表示"立刻可重试"，不能返回负数
  assert.equal(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:00 GMT", now + 60_000), 0);
});

test("missing or malformed headers yield null", () => {
  assert.equal(parseRetryAfterMs(null, now), null);
  assert.equal(parseRetryAfterMs("", now), null);
  assert.equal(parseRetryAfterMs("   ", now), null);
  assert.equal(parseRetryAfterMs("soon", now), null);
  assert.equal(parseRetryAfterMs("-1", now), null);
});
