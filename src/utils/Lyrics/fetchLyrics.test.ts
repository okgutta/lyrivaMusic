/// <reference types="node" />
import assert from "node:assert/strict";
import type * as Esbuild from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { LyricsCacheEntry, LyricsPrefetchResult } from "./fetchLyrics.ts";
import type { LyrivaResult } from "./lyriva.ts";
import type { LyricsPayload, TargetTrack } from "./matcher.ts";

const { build } = createRequire(import.meta.url)("esbuild") as typeof Esbuild;
type FetchResult = [object | string, number] | null;
interface Pipeline {
  default(uri: string, options?: { forceRefresh?: boolean }): Promise<FetchResult>;
  prefetchLyrics(target: TargetTrack): Promise<LyricsPrefetchResult>;
  cancelLyricsFetch(): void;
  isCurrentLyricsResult(result: FetchResult): boolean;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function store<T>(initial: T) {
  let value = initial;
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
    },
  };
}
async function until(check: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((done) => setTimeout(done, 0));
  }
  assert.fail(message);
}

const uri = "spotify:track:fixture";
const target: TargetTrack = { uri, title: "Fixture", artists: ["Artist"], durationMs: 200000 };
function model(text: string, processed = true): LyricsPayload {
  return {
    Type: "Static",
    uri,
    Lines: [{ Text: text }],
    _spicyLyricsProcessed: processed,
    matchInfo: { level: "HIGH", targetTitle: target.title, targetArtists: target.artists },
  } as LyricsPayload;
}
function entry(lyrics: LyricsPayload): LyricsCacheEntry {
  return { uri, model: lyrics, matchInfo: lyrics.matchInfo as LyricsCacheEntry["matchInfo"] };
}
const missEntry: LyricsCacheEntry = {
  uri,
  notFound: true,
  matchInfo: { level: "REJECT", targetTitle: target.title, targetArtists: target.artists },
};
function textOf(result: FetchResult): string | undefined {
  return result && typeof result[0] === "object"
    ? (result[0] as LyricsPayload).Lines?.[0]?.Text
    : undefined;
}

const bundle = await build({
  stdin: {
    contents:
      'export { default } from "./src/utils/Lyrics/fetchLyrics.ts"; export * from "./src/utils/Lyrics/fetchLyrics.ts";',
    resolveDir: resolve("."),
  },
  bundle: true,
  write: false,
  platform: "node",
  target: "node22",
  format: "esm",
  plugins: [
    {
      name: "lyrics-fetch-host-fixture",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /\/(?:Defaults|stores|SpotifyPlayer|PageView|ProcessLyrics|Logger|Store|lyriva|genius|Global|diagnostics)\.ts$/,
          },
          (args) => ({ path: args.path.split("/").pop()!, namespace: "pipeline-fixture" })
        );
        builder.onLoad({ filter: /.*/, namespace: "pipeline-fixture" }, (args) => {
          const sources: Record<string, string> = {
            "Defaults.ts": "export const isDev = false;",
            "stores.ts":
              "export const { $currentLyricsData, $currentLyricsType, $currentlyFetching } = fixture.stores;",
            "SpotifyPlayer.ts": "export const SpotifyPlayer = fixture.player;",
            "PageView.ts":
              "export const PageContainer = fixture.page; export default { AppendViewControls() {}, IsOpened: true };",
            "ProcessLyrics.ts": "export async function ProcessLyrics() { return false; }",
            "Logger.ts":
              "export default class Logger { debug() {} info() {} warn() {} error() {} }",
            "Store.ts": "export const GetExpireStore = () => fixture.cache;",
            "lyriva.ts": "export const tryLyrivaLyrics = (...args) => fixture.source(...args);",
            "genius.ts":
              "export const geniusProvider = { search: async () => [], fetchLyrics: async () => null };",
            "Global.ts": "export default { Event: { evoke() {} } };",
            "diagnostics.ts":
              "export function recordCacheDiagnostic() {} export function recordCurrentDiagnostic() {} export function recordLyrivaResult() {}",
          };
          return {
            contents: `const fixture = globalThis.__fetchLyricsFixture; ${sources[args.path]}`,
            loader: "js",
          };
        });
      },
    },
  ],
});

let instance = 0;
async function createPipeline() {
  const items = new Map<string, LyricsCacheEntry>();
  const calls: Array<{ target: TargetTrack; signal: AbortSignal }> = [];
  const stores = {
    $currentLyricsData: store(""),
    $currentLyricsType: store("None"),
    $currentlyFetching: store(false),
  };
  const classes = new Set<string>();
  const element = {
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      contains: (name: string) => classes.has(name),
    },
    querySelector: () => null,
  };
  const fixture = {
    uri,
    stores,
    page: { classList: element.classList, querySelector: () => element },
    player: {
      GetUri: () => fixture.uri,
      GetName: () => target.title,
      GetArtists: () => [{ name: "Artist" }],
      GetAlbumName: () => "Album",
      GetDuration: () => target.durationMs,
      IsDJ: () => false,
      GetMediaType: () => "audio",
      GetContentType: () => "track",
    },
    sourceResult: async (_target: TargetTrack, _signal: AbortSignal): Promise<LyrivaResult> => ({
      kind: "ok",
      model: model("network"),
    }),
    source(track: TargetTrack, signal: AbortSignal) {
      calls.push({ target: track, signal });
      return fixture.sourceResult(track, signal);
    },
    beforeWrite: async (_key: string, _value: LyricsCacheEntry) => {},
    cache: {
      GetItem: async (key: string) => items.get(key),
      async SetItem(key: string, value: LyricsCacheEntry) {
        await fixture.beforeWrite(key, value);
        items.set(key, structuredClone(value));
        return value;
      },
      RemoveItem: async (key: string) => {
        items.delete(key);
      },
      Destroy: async () => {
        items.clear();
      },
    },
  };
  Object.defineProperty(globalThis, "__fetchLyricsFixture", { configurable: true, value: fixture });
  const app: Pipeline = await import(
    `data:text/javascript;base64,${Buffer.from(`${bundle.outputFiles[0].text}\n// fixture ${instance++}`).toString("base64")}`
  );
  return { app, fixture, items, calls, stores };
}

const previousGlobals = new Map(
  ["document", "navigator", "__fetchLyricsFixture"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ])
);
Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden: true } });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
try {
  // A manual retry must cross all three cache layers, while ordinary requests
  // retain existing memory/local positive and negative cache behavior.
  for (const kind of ["memory-positive", "memory-negative", "local-positive", "local-negative"]) {
    const { app, fixture, stores, items, calls } = await createPipeline();
    if (kind === "memory-positive") stores.$currentLyricsData.set(JSON.stringify(model("memory")));
    if (kind === "memory-negative") stores.$currentLyricsData.set(`NO_LYRICS:${uri}`);
    if (kind === "local-positive") items.set("fixture", entry(model("local")));
    if (kind === "local-negative") items.set("fixture", missEntry);
    const cached = await app.default(uri);
    assert.equal(calls.length, 0, `${kind}: normal fetch should use its cache`);
    if (kind.endsWith("negative")) assert.equal(cached?.[0], "lyrics-not-found");
    else assert.equal(textOf(cached), kind === "memory-positive" ? "memory" : "local");
    fixture.sourceResult = async () => ({ kind: "ok", model: model("fresh") });
    const fresh = await app.default(uri, { forceRefresh: true });
    assert.equal(textOf(fresh), "fresh", `${kind}: force must bypass its cache`);
    assert.equal(calls.length, 1);
    assert.equal(stores.$currentlyFetching.get(), false);
    app.cancelLyricsFetch();
  }

  {
    const { app, fixture, calls } = await createPipeline();
    fixture.sourceResult = async () => ({ kind: "not-found" });
    assert.equal(await app.prefetchLyrics(target), "miss");
    assert.equal((await app.default(uri))?.[0], "lyrics-not-found");
    assert.equal(calls.length, 1, "Ordinary fetch should reuse the recent prefetch miss");
    fixture.sourceResult = async () => ({ kind: "ok", model: model("after-prefetch-miss") });
    assert.equal(textOf(await app.default(uri, { forceRefresh: true })), "after-prefetch-miss");
    assert.equal(calls.length, 2, "Manual retry must clear the prefetch miss");
    app.cancelLyricsFetch();
  }

  {
    const { app, fixture, calls, stores } = await createPipeline();
    const first = deferred<LyrivaResult>();
    const second = deferred<LyrivaResult>();
    fixture.sourceResult = () => (calls.length === 1 ? first.promise : second.promise);
    const old = app.default(uri);
    await until(() => calls.length === 1, "First provider request did not start");
    const fresh = app.default(uri, { forceRefresh: true });
    await until(() => calls.length === 2, "Force reused the old same-track request");
    assert.equal(calls[0].signal.aborted, true);
    // The old transport deliberately ignores abort and completes late.
    first.resolve({ kind: "unavailable", reason: "old failure" });
    assert.equal(await old, null);
    assert.equal(
      stores.$currentlyFetching.get(),
      true,
      "Old completion must not clear the newer loading state"
    );
    const duplicate = app.default(uri);
    second.resolve({ kind: "ok", model: model("replacement") });
    const result = await fresh;
    assert.equal(
      await duplicate,
      result,
      "Old finally must not remove the replacement in-flight entry"
    );
    assert.equal(calls.length, 2);
    assert.equal(textOf(result), "replacement");
    assert.equal(app.isCurrentLyricsResult(result), true);
    app.cancelLyricsFetch();
    assert.equal(
      app.isCurrentLyricsResult(result),
      false,
      "Already-resolved results become stale when the page closes"
    );
  }

  {
    const { app, fixture, calls, stores, items } = await createPipeline();
    const pendingPrefetch = deferred<LyrivaResult>();
    fixture.sourceResult = () => pendingPrefetch.promise;
    const prefetch = app.prefetchLyrics(target);
    await until(() => calls.length === 1, "The queued-track prefetch did not start");
    fixture.sourceResult = async () => ({ kind: "ok", model: model("forced-after-prefetch") });
    const forced = await app.default(uri, { forceRefresh: true });
    assert.equal(calls.length, 2, "Force must not wait for an unfinished same-track prefetch");
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(textOf(forced), "forced-after-prefetch");
    pendingPrefetch.resolve({ kind: "ok", model: model("obsolete-prefetch") });
    assert.equal(await prefetch, "aborted");
    assert.notEqual(items.get("fixture")?.model?.Lines?.[0]?.Text, "obsolete-prefetch");
    assert.equal(
      JSON.parse(stores.$currentLyricsData.get()).Lines[0].Text,
      "forced-after-prefetch"
    );
    app.cancelLyricsFetch();
  }

  for (const stop of ["track-change", "page-close"]) {
    const { app, fixture, calls } = await createPipeline();
    const pending = deferred<LyrivaResult>();
    fixture.sourceResult = () => pending.promise;
    const request = app.default(uri);
    await until(() => calls.length === 1, `${stop}: provider request did not start`);
    if (stop === "track-change") fixture.uri = "spotify:track:other";
    else app.cancelLyricsFetch();
    pending.resolve({ kind: "not-found" });
    assert.equal(await request, null, `${stop}: late errors must not reach the renderer`);
    app.cancelLyricsFetch();
  }

  {
    const { app, fixture, calls, items, stores } = await createPipeline();
    const writingOldMiss = deferred<void>();
    const releaseOldMiss = deferred<void>();
    fixture.sourceResult = async () => ({ kind: "not-found" });
    fixture.beforeWrite = async (_key, value) => {
      if (value.notFound) {
        writingOldMiss.resolve();
        await releaseOldMiss.promise;
      }
    };
    const old = app.default(uri);
    await writingOldMiss.promise;
    fixture.sourceResult = async () => ({
      kind: "ok",
      model: model("fresh-after-old-write", false),
    });
    const retry = app.default(uri, { forceRefresh: true });
    releaseOldMiss.resolve();
    assert.equal(await old, null, "A stale negative-cache write cannot return an error tuple");
    assert.equal(textOf(await retry), "fresh-after-old-write");
    await until(
      () => items.get("fixture")?.model?.Lines?.[0]?.Text === "fresh-after-old-write",
      "Fresh lyrics were not persisted after the queued old write"
    );
    assert.equal(calls.length, 2);
    assert.equal(items.get("fixture")?.notFound, undefined);
    assert.equal(
      JSON.parse(stores.$currentLyricsData.get()).Lines[0].Text,
      "fresh-after-old-write"
    );
    assert.equal(stores.$currentlyFetching.get(), false);
    app.cancelLyricsFetch();
  }

  {
    const { app, fixture, calls, items } = await createPipeline();
    fixture.sourceResult = async () => ({ kind: "unavailable", reason: "LYRIVA 请求限流（429）" });
    const failed = await app.default(uri);
    assert.equal(failed?.[1], 500);
    assert.equal(items.size, 0, "Transient failures must never become a negative cache");
    fixture.sourceResult = async () => ({ kind: "ok", model: model("recovered") });
    assert.equal(textOf(await app.default(uri, { forceRefresh: true })), "recovered");
    assert.equal(calls.length, 2);
    assert.equal(
      app.isCurrentLyricsResult(failed),
      false,
      "A completed prior failure is stale after retry"
    );
    app.cancelLyricsFetch();
  }
} finally {
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}

console.log(
  "Lyrics fetch retry tests passed (cache bypass, prefetch misses, cancellation, stale writes, recovery)"
);
