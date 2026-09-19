/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarkerPayload,
  parseMarkedResponse,
  parseMarkedResponsePartial,
} from "./translationProtocol.ts";

test("markers keep line identity regardless of response order", () => {
  assert.deepEqual(parseMarkedResponse("[[SPICY_TR_a_1]]二\n[[SPICY_TR_a_0]]一", 2, "a"), [
    "一",
    "二",
  ]);
});

test("strict parsing rejects duplicate or missing markers", () => {
  assert.equal(parseMarkedResponse("[[SPICY_TR_a_0]]一\n[[SPICY_TR_a_0]]二", 2, "a"), null);
  assert.equal(parseMarkedResponse("[[SPICY_TR_a_0]]一", 2, "a"), null);
  assert.equal(parseMarkedResponse("[[SPICY_TR_a_0]]一\n[[SPICY_TR_a_5]]二", 2, "a"), null);
});

test("partial parsing keeps recovered lines and blanks the missing ones", () => {
  assert.deepEqual(parseMarkedResponsePartial("[[SPICY_TR_a_0]]一\n[[SPICY_TR_a_2]]三", 3, "a"), [
    "一",
    "",
    "三",
  ]);
  // 整块无标记仍不可信，交给 parseLineFallback
  assert.equal(parseMarkedResponsePartial("一\n二", 2, "a"), null);
  // 重复或越界标记说明响应结构不可信，不能当成"部分成功"
  assert.equal(parseMarkedResponsePartial("[[SPICY_TR_a_0]]一\n[[SPICY_TR_a_0]]二", 2, "a"), null);
  assert.equal(parseMarkedResponsePartial("[[SPICY_TR_a_9]]一", 2, "a"), null);
});

test("partial parsing round-trips a payload the model echoed verbatim", () => {
  const payload = buildMarkerPayload(["甲", "乙"], "n0");
  assert.deepEqual(parseMarkedResponsePartial(payload, 2, "n0"), ["甲", "乙"]);
});
