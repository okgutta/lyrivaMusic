/// <reference types="node" />
import assert from "node:assert/strict";
import { ReducedMotionStyles } from "./reducedMotion.ts";

const values = new Map<string, [string, string]>([["scale", ["0.95", ""]]]);
let writes = 0;
const element = {
  style: {
    getPropertyValue: (name: string) => values.get(name)?.[0] ?? "",
    getPropertyPriority: (name: string) => values.get(name)?.[1] ?? "",
    setProperty(name: string, value: string, priority = "") {
      values.set(name, [value, priority]);
      writes++;
    },
    removeProperty(name: string) {
      values.delete(name);
      writes++;
    },
  },
} as unknown as HTMLElement;
const motion = new ReducedMotionStyles();
assert.equal(motion.apply(element, false), false);
assert.equal(writes, 0);
assert.equal(motion.apply(element, true), true);
assert.deepEqual(values.get("scale"), ["1", "important"]);
assert.deepEqual(values.get("transform"), ["none", "important"]);
assert.equal(motion.protects(element, "scale"), true);
assert.equal(
  motion.protects(element, "--gradient-position"),
  false,
  "Highlight timing stays enabled"
);
motion.apply(element, true);
assert.equal(writes, 3, "Stable preference performs no further style writes");
assert.equal(motion.apply(element, false), true);
assert.deepEqual(values.get("scale"), ["0.95", ""]);
assert.equal(values.has("transform"), false);
assert.equal(values.has("transition"), false);
assert.equal(motion.protects(element, "scale"), false);
console.log("Reduced motion preference and restoration tests passed");
