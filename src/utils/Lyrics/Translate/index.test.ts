/// <reference types="node" />
import assert from "node:assert/strict";
import type * as Esbuild from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// esbuild's native loader must resolve from node_modules, not be rebundled.
const { build } = createRequire(import.meta.url)("esbuild") as typeof Esbuild;

// Exercise the real orchestrator, provider requests, stores and both caches.
// Only the Spotify host's playback metadata, DOM renderer and notification surface are replaced.
const bundle = await build({
  stdin: {
    contents: `
      export * from "./src/utils/Lyrics/Translate/index.ts";
      export * from "./src/utils/Lyrics/Translate/state.ts";
      export * from "./src/utils/Lyrics/Translate/cache.ts";
      export * from "./src/utils/stores.ts";
    `,
    resolveDir: resolve("."),
  },
  bundle: true,
  write: false,
  platform: "node",
  target: "node22",
  format: "esm",
  plugins: [
    {
      name: "spotify-host-fixture",
      setup(builder) {
        builder.onResolve({ filter: /\/notify\.ts$/ }, () => ({
          path: "notifications",
          namespace: "spotify-fixture",
        }));
        builder.onResolve({ filter: /(?:SpotifyPlayer|Global\/Applyer)\.ts$/ }, (args) => ({
          path: args.path.includes("SpotifyPlayer") ? "player" : "renderer",
          namespace: "spotify-fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "spotify-fixture" }, (args) => ({
          contents:
            args.path === "notifications"
              ? "export function notify() {}"
              : args.path === "player"
                ? `export const SpotifyPlayer = {
              GetUri: () => globalThis.__translationTestUri,
              GetArtists: () => [],
              GetName: () => "Fixture"
            };`
                : "export default async function ApplyLyrics() {}",
          loader: "js",
        }));
      },
    },
  ],
});

const storage = new Map<string, string>();
(globalThis as any).Spicetify = {
  LocalStorage: {
    get: (key: string) => storage.get(key) ?? null,
    set: (key: string, value: string) => storage.set(key, value),
    remove: (key: string) => storage.delete(key),
  },
};
(globalThis as any).window = { _spicy_lyrics_metadata: undefined };
const app = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function translatedResponse(init: RequestInit, translation: string) {
  const body = JSON.parse(String(init.body));
  const content = String(body.messages[1].content)
    .split("\n")
    .map((line, index) => {
      const marker = line.match(/^\[\[SPICY_TR_[^\]]+\]\]/)?.[0] ?? "";
      return `${marker}${translation}${index + 1}`;
    })
    .join("\n");
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
}
const scenarios = [
  { name: "provider", provider: "deepseek", change: () => app.$translationProvider.set("openai") },
  {
    name: "deepseek-key",
    provider: "deepseek",
    change: () => app.$deepSeekApiKey.set("changed-fixture"),
  },
  {
    name: "openai-key",
    provider: "openai",
    change: () => app.$openaiApiKey.set("changed-fixture"),
  },
  { name: "model", provider: "deepseek", change: () => app.$deepSeekModel.set("changed-model") },
  {
    name: "custom-key",
    provider: "custom",
    change: () => app.$customApiKey.set("changed-fixture"),
  },
  {
    name: "custom-address",
    provider: "custom",
    change: () => app.$customApiBaseUrl.set("https://second.example/v1"),
  },
  {
    name: "custom-model",
    provider: "custom",
    change: () => app.$customApiModel.set("changed-model"),
  },
];
const realFetch = globalThis.fetch;
try {
  for (const scenario of scenarios) {
    storage.clear();
    app.$translationProvider.set(scenario.provider);
    app.$deepSeekApiKey.set("deepseek-fixture");
    app.$deepSeekModel.set("deepseek-chat");
    app.$openaiApiKey.set("openai-fixture");
    app.$customApiKey.set("custom-fixture");
    app.$customApiModel.set("fixture-model");
    app.$customApiBaseUrl.set("https://first.example/v1");
    const uri = `spotify:track:${scenario.name}`;
    (globalThis as any).__translationTestUri = uri;
    app.resetTranslationForTrack(uri);
    const model = {
      Type: "Line",
      LanguageISO2: "en",
      Content: [
        { Type: "Vocal", Text: "first fixture line" },
        { Type: "Vocal", Text: "second fixture line" },
        { Type: "Vocal", Text: "third fixture line" },
      ],
    };
    app.prepareLyricsForDisplay(uri, model);
    assert.equal(app.$translationState.get(), "ready");
    const started = deferred<RequestInit>();
    const staleResponse = deferred<Response>();
    globalThis.fetch = (async (_url, init) => {
      started.resolve(init!);
      // Deliberately ignore abort: a stale transport must still never publish.
      return staleResponse.promise;
    }) as typeof fetch;
    const staleRun = app.requestTranslationToggle();
    const oldRequest = await started.promise;
    scenario.change();
    assert.equal(
      oldRequest.signal?.aborted,
      true,
      `${scenario.name}: old request was not cancelled`
    );
    staleResponse.resolve(translatedResponse(oldRequest, "旧服务译文"));
    await staleRun;
    assert.deepEqual(app.getCacheSnapshot(), {}, `${scenario.name}: stale line cache was written`);
    assert.equal(
      [...storage.keys()].some((key) => key.startsWith("SL:translationTrack:")),
      false,
      `${scenario.name}: stale track cache was written`
    );
    assert.equal(
      app.$translationState.get(),
      "ready",
      `${scenario.name}: stale run changed button state`
    );

    globalThis.fetch = (async (_url, init) =>
      translatedResponse(init!, "新服务译文")) as typeof fetch;
    await app.requestTranslationToggle();
    assert.equal(app.$translationState.get(), "complete", `${scenario.name}: next request failed`);
    const provider = app.$translationProvider.get();
    const cache = app.getCacheSnapshot();
    assert.equal(Object.keys(cache).length, 3);
    assert.ok(
      Object.entries(cache).every(
        ([key, value]) =>
          key.startsWith(`${provider}|`) && (value as { t: string }).t.startsWith("新服务译文")
      ),
      `${scenario.name}: new line cache has wrong origin`
    );
    const tracks = [...storage.entries()].filter(([key]) => key.startsWith("SL:translationTrack:"));
    assert.equal(tracks.length, 1);
    assert.ok(tracks[0][0].startsWith(`SL:translationTrack:${provider}:`));
    assert.ok(
      JSON.parse(tracks[0][1]).lines.every((line: string) => line.startsWith("新服务译文"))
    );
  }
} finally {
  globalThis.fetch = realFetch;
}
console.log("Translation configuration race tests passed (7 configurations, both caches)");
