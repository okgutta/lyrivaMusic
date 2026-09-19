/// <reference types="node" />
import assert from "node:assert/strict";
import { softenWordMotion } from "./wordEmphasis.ts";

const peak = { scale: 1.0505, yOffset: -1 / 60, glow: 1 };
const fast = softenWordMotion(180, peak);
const long = softenWordMotion(1800, peak);
assert.ok(fast.scale < 1.011 && fast.scale > 1);
assert.ok(Math.abs(fast.yOffset) < Math.abs(long.yOffset));
assert.ok(fast.glow < long.glow && long.glow < peak.glow);
assert.ok(long.scale < 1.04, "Long notes retain a restrained emphasis");
assert.deepEqual(softenWordMotion(699, peak), softenWordMotion(700, peak));
assert.ok(Math.abs(softenWordMotion(701, peak).scale - fast.scale) < 0.000001);

let previous = fast;
for (let duration = 700; duration <= 1600; duration += 10) {
  const next = softenWordMotion(duration, peak);
  assert.ok(next.scale >= previous.scale && next.glow >= previous.glow);
  assert.ok(next.yOffset <= previous.yOffset);
  previous = next;
}
assert.deepEqual(softenWordMotion(60000, peak), long, "Very long notes remain bounded");
assert.deepEqual(softenWordMotion(-50, peak), fast);
assert.deepEqual(softenWordMotion(Number.NaN, peak), fast);
assert.deepEqual(softenWordMotion(Infinity, peak), fast);
assert.deepEqual(softenWordMotion(1600, { scale: 1, yOffset: 0, glow: 0 }), {
  scale: 1,
  yOffset: 0,
  glow: 0,
});
assert.deepEqual(peak, { scale: 1.0505, yOffset: -1 / 60, glow: 1 }, "Input remains reusable");
console.log("Word emphasis duration and continuity tests passed");
