import { LatestRequestGuard } from "./LatestRequestGuard.ts";

const guard = new LatestRequestGuard<string>();

const first = guard.begin("background");
if (!guard.isCurrent("background", first)) {
  throw new Error("the newest request should be current");
}

const second = guard.begin("background");
if (guard.isCurrent("background", first)) {
  throw new Error("a superseded request must become stale");
}
if (!guard.isCurrent("background", second)) {
  throw new Error("the replacement request should be current");
}

const independent = guard.begin("lyrics");
guard.invalidate("background");
if (!guard.isCurrent("lyrics", independent)) {
  throw new Error("invalidating one key must not affect another key");
}

console.log("LatestRequestGuard tests passed");
