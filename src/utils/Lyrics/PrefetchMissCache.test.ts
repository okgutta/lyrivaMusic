import { PrefetchMissCache } from "./PrefetchMissCache.ts";

let now = 1_000;
const cache = new PrefetchMissCache(100, 2, () => now);

cache.remember("track:a");
if (!cache.has("track:a")) throw new Error("remembered miss was not returned");

now += 101;
if (cache.has("track:a")) throw new Error("expired miss was returned");

cache.remember("track:a");
cache.remember("track:b");
cache.remember("track:c");
if (cache.has("track:a")) throw new Error("oldest miss was not evicted");
if (!cache.has("track:b") || !cache.has("track:c")) {
  throw new Error("recent misses were evicted unexpectedly");
}

cache.clear("track:b");
if (cache.has("track:b")) throw new Error("cleared miss was returned");

console.log("PrefetchMissCache tests passed");
