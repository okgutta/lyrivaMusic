/// <reference types="node" />
import assert from "node:assert/strict";
import { startUpdater } from "./core.ts";
import type { UpdateBridge } from "./contracts.ts";
import type { CachedRuntime, StoredUpdates, UpdateStorage } from "./storage.ts";
import { LATEST_RELEASE_URL, sha256 } from "./protocol.ts";

class MemoryStorage implements UpdateStorage {
  value: StoredUpdates = {};
  async read() {
    return structuredClone(this.value);
  }
  async update(change: (state: StoredUpdates) => StoredUpdates) {
    this.value = structuredClone(change(this.value));
  }
}
async function runtime(version: string, code = `version ${version}`): Promise<CachedRuntime> {
  const bytes = new TextEncoder().encode(code);
  return { version, code, loaderVersion: 1, size: bytes.length, sha256: await sha256(bytes) };
}
const fallback = { fallbackCode: "embedded", fallbackVersion: "1.2.0", loaderVersion: 1 };
const next = await runtime("1.3.0");
const root = "https://raw.githubusercontent.com/okgutta/lyrivaMusic/updates/versions/v1.3.0";
let corrupt = false;
let requiredLoader = 1;
let fetchCount = 0;
const request = (async (url: string | URL | Request) => {
  fetchCount++;
  if (String(url) === LATEST_RELEASE_URL)
    return Response.json({
      tag_name: "v1.3.0",
      draft: false,
      prerelease: false,
      body: "release notes",
    });
  if (String(url) === `${root}/manifest.json`)
    return Response.json({
      schema: 1,
      version: next.version,
      loaderVersion: requiredLoader,
      runtime: { url: `${root}/lyrivamusic-runtime.js`, size: next.size, sha256: next.sha256 },
    });
  assert.equal(String(url), `${root}/lyrivamusic-runtime.js`);
  return new Response(corrupt ? "x".repeat(next.size) : next.code);
}) as typeof fetch;
const executed: string[] = [];
const storage = new MemoryStorage();
const host: { __LYRIVA_UPDATER__?: UpdateBridge } = {};
const bridge = await startUpdater(fallback, {
  storage,
  request,
  host,
  execute: (code) => {
    executed.push(code);
  },
  reload() {},
});
assert.deepEqual(executed, ["embedded"]);
assert.equal(fetchCount, 0, "Bootstrap must not check before the runtime is ready");
await startUpdater(fallback, {
  host,
  execute: () => {
    throw new Error("duplicate execution");
  },
});
assert.equal(executed.length, 1, "Only one runtime executes in a session");
const phases: string[] = [];
bridge.subscribe((state) => {
  phases.push(state.phase);
});
const checking = bridge.check();
assert.equal(bridge.check(), checking, "Concurrent checks must share one flight");
await checking;
assert.equal(fetchCount, 3);
assert.ok(phases.indexOf("available") < phases.indexOf("downloading"));
assert.equal(bridge.getState().phase, "ready");
assert.equal(bridge.getState().progress, 100);
assert.deepEqual(storage.value.pending, next);
assert.equal(
  storage.value.current,
  undefined,
  "Download must not promote before startup is healthy"
);
assert.equal(executed.length, 1, "A download must not hot execute into the existing runtime");
await bridge.check();
assert.equal(fetchCount, 5, "An already verified pending version must not be downloaded twice");

const nextHost: { __LYRIVA_UPDATER__?: UpdateBridge } = {};
const rebooted = await startUpdater(fallback, {
  storage,
  request,
  host: nextHost,
  execute: (code) => {
    assert.equal(code, next.code);
    assert.ok(nextHost.__LYRIVA_UPDATER__);
  },
  reload() {},
});
assert.deepEqual(storage.value.trial, { version: "1.3.0", kind: "pending" });
rebooted.markHealthy("9.9.9");
await Promise.resolve();
assert.equal(storage.value.current, undefined);
rebooted.markHealthy("1.3.0");
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(storage.value.current, next);
assert.equal(storage.value.pending, undefined);
assert.equal(storage.value.trial, undefined);

// Hash failures never replace a previously healthy cached runtime; retry works.
storage.value = { current: await runtime("1.2.0") };
corrupt = true;
const corruptBridge = await startUpdater(fallback, {
  storage,
  request,
  host: {},
  execute() {},
  reload() {},
});
await corruptBridge.check();
assert.equal(corruptBridge.getState().phase, "error");
assert.equal(storage.value.current?.version, "1.2.0");
assert.equal(storage.value.pending, undefined);
corrupt = false;
await corruptBridge.download();
assert.equal(corruptBridge.getState().phase, "ready");

// An unacknowledged pending runtime is skipped next time, not executed alongside
// an old version in the failing session. A verified current runtime remains usable.
storage.value = { current: await runtime("1.2.0"), pending: next };
let failuresExecuted = 0;
const beforeError = console.error;
console.error = () => {};
try {
  const failed = await startUpdater(fallback, {
    storage,
    request,
    host: {},
    execute() {
      failuresExecuted++;
      throw new Error("fixture startup failure");
    },
    reload() {},
  });
  assert.equal(failed.getState().phase, "error");
  assert.equal(failuresExecuted, 1);
} finally {
  console.error = beforeError;
}
let recovered = "";
const recoveredBridge = await startUpdater(fallback, {
  storage,
  request,
  host: {},
  execute: (code) => {
    recovered = code;
  },
  reload() {},
});
assert.equal(recovered, "version 1.2.0");
assert.equal(storage.value.pending, undefined);
assert.equal(storage.value.badVersion, "1.3.0");
await recoveredBridge.check();
assert.equal(
  recoveredBridge.getState().phase,
  "error",
  "Do not automatically redownload a known bad release"
);

storage.value = { pending: { ...next, code: "modified" } };
let usedFallback = false;
await startUpdater(fallback, {
  storage,
  host: {},
  execute: (code) => {
    usedFallback = code === "embedded";
  },
  reload() {},
});
assert.ok(usedFallback, "Persisted code must be reverified before execution");

requiredLoader = 2;
storage.value = {};
const loaderBridge = await startUpdater(fallback, {
  storage,
  request,
  host: {},
  execute() {},
  reload() {},
});
const beforeFetch = fetchCount;
await loaderBridge.check();
assert.equal(loaderBridge.getState().loaderUpdateRequired, true);
assert.equal(loaderBridge.getState().phase, "available");
assert.equal(
  fetchCount - beforeFetch,
  2,
  "Incompatible loader must not download or execute the runtime"
);
assert.equal(storage.value.pending, undefined);

let storageFailureFallback = "";
const unavailable: UpdateStorage = {
  read: async () => {
    throw new Error("storage unavailable");
  },
  update: async () => {
    throw new Error("storage unavailable");
  },
};
await startUpdater(fallback, {
  storage: unavailable,
  host: {},
  execute: (code) => {
    storageFailureFallback = code;
  },
  reload() {},
});
assert.equal(storageFailureFallback, fallback.fallbackCode);
console.log("Updater bootstrap tests passed");
