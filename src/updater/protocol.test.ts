/// <reference types="node" />
import assert from "node:assert/strict";
import {
  compareVersions,
  stableVersion,
  parseRelease,
  parseManifest,
  sha256,
  verifiedRuntime,
  requestBytes,
  MAX_RUNTIME_BYTES,
} from "./protocol.ts";

assert.ok(stableVersion("1.2.3"));
for (const invalid of [
  "1.2",
  "01.2.3",
  "1.2.3-beta.1",
  "1.2.3+local",
  "v1.2.3",
  "1.2.3/../x",
  "999999999999999999.2.3",
])
  assert.equal(stableVersion(invalid), false);
assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
assert.equal(compareVersions("2.0.0", "10.0.0"), -1);
assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
assert.equal(parseRelease({ draft: true }), null);
assert.equal(parseRelease({ prerelease: true }), null);
assert.throws(() => parseRelease({ tag_name: "v1.2.3" }));
const release = parseRelease({
  tag_name: "v1.3.0",
  draft: false,
  prerelease: false,
  body: "notes",
  html_url: "https://unrelated.invalid",
})!;
assert.equal(release.url, "https://github.com/okgutta/lyrivaMusic/releases/tag/v1.3.0");
const bytes = new TextEncoder().encode("globalThis.fixture = '字';");
const manifest = {
  schema: 1,
  version: "1.3.0",
  loaderVersion: 1,
  runtime: {
    url: "https://raw.githubusercontent.com/okgutta/lyrivaMusic/updates/versions/v1.3.0/lyrivamusic-runtime.js",
    sha256: await sha256(bytes),
    size: bytes.length,
  },
};
assert.equal(parseManifest(manifest, release).runtime.size, bytes.length);
for (const url of [
  "https://unrelated.invalid/runtime.js",
  manifest.runtime.url + "?ref=other",
  manifest.runtime.url.replace("okgutta", "attacker"),
  manifest.runtime.url.replace("v1.3.0", "v1.4.0"),
  manifest.runtime.url.replace("https:", "http:"),
])
  assert.throws(() =>
    parseManifest({ ...manifest, runtime: { ...manifest.runtime, url } }, release)
  );
assert.throws(() => parseManifest({ ...manifest, version: "1.4.0" }, release));
assert.throws(() => parseManifest({ ...manifest, schema: 2 }, release));
assert.throws(() =>
  parseManifest(
    { ...manifest, runtime: { ...manifest.runtime, size: MAX_RUNTIME_BYTES + 1 } },
    release
  )
);
assert.throws(() =>
  parseManifest({ ...manifest, runtime: { ...manifest.runtime, sha256: "bad" } }, release)
);
assert.equal(await verifiedRuntime(bytes, manifest.runtime), "globalThis.fixture = '字';");
await assert.rejects(verifiedRuntime(bytes, { ...manifest.runtime, sha256: "0".repeat(64) }));
await assert.rejects(verifiedRuntime(bytes, { ...manifest.runtime, size: bytes.length + 1 }));
const invalidUtf8 = new Uint8Array([255]);
const withBom = new TextEncoder().encode("\uFEFFvoid 0;");
const decodedBom = await verifiedRuntime(withBom, {
  size: withBom.length,
  sha256: await sha256(withBom),
});
assert.deepEqual(
  new TextEncoder().encode(decodedBom),
  withBom,
  "Stored source must round-trip exactly for startup hash verification"
);
await assert.rejects(verifiedRuntime(invalidUtf8, { size: 1, sha256: await sha256(invalidUtf8) }));

let options: RequestInit | undefined;
await requestBytes(
  (async (_url, init) => {
    options = init;
    return new Response(bytes);
  }) as typeof fetch,
  manifest.runtime.url,
  bytes.length
);
assert.equal(options?.credentials, "omit");
assert.equal(options?.redirect, "error");
assert.equal(new Headers(options?.headers).has("Authorization"), false);
await assert.rejects(
  requestBytes(
    (async () => new Response(new Uint8Array(20))) as typeof fetch,
    manifest.runtime.url,
    10
  )
);
assert.equal(
  await requestBytes(
    (async () => new Response(null, { status: 404 })) as typeof fetch,
    manifest.runtime.url,
    10,
    undefined,
    true
  ),
  null
);
await assert.rejects(
  requestBytes(
    (async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), {
              once: true,
            });
          },
        })
      )) as typeof fetch,
    manifest.runtime.url,
    10,
    undefined,
    false,
    5
  ),
  /超时/
);
console.log("Updater protocol tests passed");
