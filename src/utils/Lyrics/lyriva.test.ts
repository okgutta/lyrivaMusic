import assert from "node:assert/strict";
import type { TargetTrack } from "./matcher.ts";

// The adapter's logger reads the Spotify settings when its module loads.
(globalThis as any).Spicetify = { LocalStorage: { get: () => null, set: () => {} } };
(globalThis as any).window = {};
const { tryLyrivaLyrics } = await import("./lyriva.ts");
const originalFetch = globalThis.fetch;
const target: TargetTrack = {
  uri: "spotify:track:test",
  title: "Test Song",
  artists: ["Test Artist"],
};
const calls: { url: string; init: RequestInit }[] = [];
let failDirect = false;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, init });
  if (failDirect && url.startsWith("https://api.lyriva.xyz/")) {
    throw new TypeError("Failed to fetch");
  }
  return Response.json({ error: { code: "LYRICS_NOT_FOUND" } }, { status: 404 });
};

function checkRequest(index: number, proxy: boolean) {
  const request = calls[index];
  assert.ok(request);
  const url = proxy ? request.url.replace("https://cors-proxy.spicetify.app/", "") : request.url;
  assert.equal(new URL(url).origin, "https://api.lyriva.xyz");
  assert.equal(new URL(url).searchParams.get("title"), target.title);
  assert.equal(request.url.startsWith("https://cors-proxy.spicetify.app/"), proxy);
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get("X-Client-Name"), "lyrivaMusic");
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.has("Authorization"), false);
  assert.equal(headers.has("User-Agent"), false);
  assert.equal(request.init.credentials, "omit");
  assert.ok(request.init.signal instanceof AbortSignal);
}

try {
  assert.deepEqual(await tryLyrivaLyrics(target), { kind: "not-found" });
  assert.equal(calls.length, 1);
  checkRequest(0, false);

  failDirect = true;
  assert.deepEqual(await tryLyrivaLyrics(target), { kind: "not-found" });
  assert.equal(calls.length, 3);
  checkRequest(1, false);
  checkRequest(2, true);

  assert.deepEqual(await tryLyrivaLyrics(target), { kind: "not-found" });
  assert.equal(calls.length, 4);
  checkRequest(3, true);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(tryLyrivaLyrics(target, controller.signal), { name: "AbortError" });
  assert.equal(calls.length, 4);
  console.log(
    "LYRIVA client identity verified for direct requests, proxy fallback and cancellation."
  );
} finally {
  globalThis.fetch = originalFetch;
  delete (globalThis as any).Spicetify;
  delete (globalThis as any).window;
}
