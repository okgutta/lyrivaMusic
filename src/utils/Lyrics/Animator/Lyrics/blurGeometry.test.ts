import { computeDistanceBlur, type BlurLineGeometry } from "./blurGeometry.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function close(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 0.000001, `${message}: ${actual} !== ${expected}`);
}

const active = { top: 500, height: 100 };
close(computeDistanceBlur(active, active, 600), 0, "The active line stays clear");
close(
  computeDistanceBlur({ top: 525, height: 50 }, active, 600),
  0,
  "Backing vocals sharing the active center stay clear"
);
close(
  computeDistanceBlur({ top: 540, height: 20 }, active, 600),
  0,
  "Rows inside the active line's footprint stay clear"
);

const near = computeDistanceBlur({ top: 610, height: 60 }, active, 600);
const middle = computeDistanceBlur({ top: 710, height: 60 }, active, 600);
const edge = computeDistanceBlur({ top: 820, height: 60 }, active, 600);
assert(near > 0 && near < 1, "Nearby rows should remain easy to read");
assert(near < middle && middle < edge, "Blur increases with physical distance");
close(edge, 6.8, "The viewport edge reaches the maximum blur");
close(
  computeDistanceBlur({ top: 50_000, height: 60 }, active, 600),
  6.8,
  "Distant rows cannot exceed the blur limit"
);

close(
  computeDistanceBlur({ top: 650, height: 100 }, active, 600),
  computeDistanceBlur({ top: 610, height: 180 }, active, 600),
  "Rows with equal centers have equal blur even when their heights differ"
);
close(
  computeDistanceBlur({ top: 310, height: 100 }, active, 600),
  computeDistanceBlur({ top: 690, height: 100 }, active, 600),
  "A centered viewport treats equal distances above and below equally"
);
close(
  computeDistanceBlur({ top: 710, height: 60 }, active, 600),
  computeDistanceBlur({ top: -290, height: 60 }, { top: -500, height: 100 }, 600),
  "Moving the coordinate origin must not change blur"
);
assert(
  computeDistanceBlur({ top: 710, height: 60 }, active, 900) < middle,
  "Larger viewports provide a wider clear area"
);
assert(
  computeDistanceBlur({ top: 610, height: 60 }, active, 600, 150) < near,
  "Top-aligned lyrics use the larger available area below the active line"
);
assert(
  computeDistanceBlur({ top: 410, height: 60 }, active, 600, 150) > near,
  "Top-aligned lyrics fade faster into the shorter area above the active line"
);

for (const geometry of [
  { top: Number.NaN, height: 20 },
  { top: Number.POSITIVE_INFINITY, height: 20 },
  { top: 20, height: Number.NEGATIVE_INFINITY },
  { top: 20, height: -1 },
] satisfies BlurLineGeometry[]) {
  close(computeDistanceBlur(geometry, active, 600), 0, "Invalid rows remain readable");
  close(computeDistanceBlur(active, geometry, 600), 0, "Invalid active rows remain readable");
}
for (const viewport of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  close(computeDistanceBlur({ top: 710, height: 60 }, active, viewport), 0, "Invalid viewport");
}
close(computeDistanceBlur(active, active, 600, Number.NaN), 0, "Invalid viewport anchor");
for (const anchor of [-10, 0, 600, 700]) {
  const blur = computeDistanceBlur({ top: 710, height: 60 }, active, 600, anchor);
  assert(Number.isFinite(blur) && blur >= 0 && blur <= 6.8, "Edge anchors stay bounded");
}
close(
  computeDistanceBlur({ top: 0, height: 0 }, { top: 0, height: 0 }, 1),
  0,
  "Collapsed active musical lines stay clear"
);

console.log("Lyrics blur geometry tests passed");
