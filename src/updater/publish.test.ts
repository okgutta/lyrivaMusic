/// <reference types="node" />
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const publisher = resolve("scripts/publish.mjs");
const directory = await mkdtemp(resolve(".tmp/tests/release-"));
const runtime = "window.testRuntime = true;";
const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.stringify({
  schema: 1,
  version: "1.3.0",
  loaderVersion: 1,
  runtime: {
    url: "https://raw.githubusercontent.com/okgutta/lyrivaMusic/updates/versions/v1.3.0/lyrivamusic-runtime.js",
    sha256: hash(runtime),
    size: Buffer.byteLength(runtime),
  },
});

try {
  await mkdir(join(directory, "dist"));
  await mkdir(join(directory, "docs/releases"), { recursive: true });
  await writeFile(join(directory, "package.json"), '{"version":"1.3.0"}');
  await writeFile(join(directory, "dist/lyrivamusic-runtime.js"), runtime);
  await writeFile(join(directory, "dist/manifest.json"), manifest);
  await writeFile(join(directory, "dist/lyrivamusic.js"), "installer");
  await writeFile(join(directory, "docs/releases/v1.3.0.md"), "Release notes");
  // Replace fetch before importing the actual publisher. No network call can escape
  // this fixture; unknown requests fail the child process immediately.
  const preload = `
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
const mode = process.env.RELEASE_TEST_MODE;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
let uploads = 0, verified = 0, channelPublished = false, releasePublished = false;
const removedAssets = [];
const removedReleases = [];
const pagedReleases = [
  Array.from({ length: 100 }, (_, index) => ({
    id: 1000 + index,
    tag_name: "v99.0." + index,
    draft: false,
    prerelease: false,
  })),
  [
    { id: 201, tag_name: "v1.2.0", draft: false, prerelease: false },
    { id: 202, tag_name: "v1.4.0", draft: false, prerelease: false },
    { id: 203, tag_name: "nightly", draft: false, prerelease: false },
    { id: 204, tag_name: "v1.1.0", draft: true, prerelease: false },
    { id: 205, tag_name: "v1.1.0", draft: false, prerelease: true },
  ],
];
const draft = { id: 1, tag_name: "v1.3.0", draft: true, assets: [], upload_url: "https://uploads.github.com/repos/okgutta/lyrivaMusic/releases/1/assets{?name}" };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  const path = url.pathname.replace("/repos/okgutta/lyrivaMusic", "");
  const method = init.method || "GET";
  appendFileSync("requests.log", method + " " + path + url.search + "\\n");
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
  if (path === "/releases/tags/v1.3.0") {
    if (["published", "published-cleanup", "published-stale"].includes(mode)) return json({ ...draft, draft: false });
    if (["retry", "retry-legacy", "installer-mismatch"].includes(mode)) {
      const assets = [{ id: 10, name: "lyrivamusic.js", digest: mode === "installer-mismatch" ? "sha256:wrong" : "sha256:" + digest(readFileSync("dist/lyrivamusic.js")) }];
      if (mode === "retry-legacy" || mode === "installer-mismatch") assets.push(...["lyrivamusic-runtime.js", "manifest.json", "SHA256SUMS.txt"].map((name, index) => ({id: 11 + index, name})));
      if (mode === "retry-legacy") assets.push({ id: 14, name: "maintainer-notes.txt" });
      return json({ ...draft, assets });
    }
    return json(null, 404);
  }
  if (path === "/releases/latest") {
    if (mode === "published-cleanup" || (mode === "cleanup" && releasePublished)) {
      return json({ id: 1, tag_name: "v1.3.0" });
    }
    if (["stale", "published-stale"].includes(mode)) return json({ id: 2, tag_name: "v1.4.0" });
    return json({ tag_name: "v1.2.0" });
  }
  if (path === "/git/ref/tags/v1.3.0") return json(null, 404);
  if (path === "/git/refs" && method === "POST") {
    const data = JSON.parse(init.body);
    if (data.ref === "refs/heads/updates") channelPublished = true;
    return json({});
  }
  if (path === "/releases" && method === "POST") return json(draft);
  if (path === "/releases" && method === "GET") {
    assert.ok(["cleanup", "published-cleanup"].includes(mode));
    return json(pagedReleases[Number(url.searchParams.get("page")) - 1] ?? []);
  }
  if (url.hostname === "uploads.github.com") {
    assert.equal(url.searchParams.get("name"), "lyrivamusic.js", "only the installer is a Release attachment");
    uploads++;
    return json({ digest: "sha256:" + (mode === "bad-upload" ? "bad" : digest(init.body)) });
  }
  if (path.startsWith("/releases/assets/") && method === "DELETE") {
    assert.equal(mode, "retry-legacy", "clean internal attachments only on an existing draft");
    const id = Number(path.split("/").pop());
    assert.ok([11, 12, 13].includes(id), "never remove the installer");
    removedAssets.push(id);
    return new Response(null, { status: 204 });
  }
  if (path.startsWith("/releases/") && method === "DELETE") {
    assert.ok(["cleanup", "published-cleanup"].includes(mode));
    removedReleases.push(Number(path.split("/").pop()));
    return new Response(null, { status: 204 });
  }
  if (path === "/git/ref/heads/updates") return mode === "immutable" ? json({ object: { sha: "parent" } }) : json(null, 404);
  if (path === "/git/commits/parent") return json({ sha: "parent", tree: { sha: "old-tree" } });
  if (path.startsWith("/contents/")) return json({ sha: "original-blob" });
  if (path === "/git/blobs") return json({ sha: "new-blob" });
  if (path === "/git/trees") {
    assert.equal(uploads, ["retry", "retry-legacy"].includes(mode) ? 0 : 1, "verify the single installer before channel publication");
    assert.deepEqual(removedAssets, mode === "retry-legacy" ? [11, 12, 13] : []);
    assert.deepEqual(JSON.parse(init.body).tree.map(item => item.path).sort(), ["versions/v1.3.0/lyrivamusic-runtime.js", "versions/v1.3.0/manifest.json"], "runtime and manifest retain the existing update URLs in one commit");
    return json({ sha: "tree" });
  }
  if (path === "/git/commits") return json({ sha: "commit" });
  if (url.hostname === "raw.githubusercontent.com") {
    assert.equal(channelPublished, true);
    verified++;
    return new Response(mode === "raw-unavailable" ? "wrong bytes" : readFileSync("dist/" + path.split("/").pop()));
  }
  if (path === "/releases/1" && method === "PATCH") {
    assert.equal(verified, 2, "verify both public files before exposing stable release");
    assert.equal(JSON.parse(init.body).draft, false);
    releasePublished = true;
    return json({});
  }
  throw new Error("Unexpected publication request: " + method + " " + input);
};`;
  const preloadPath = join(directory, "fixture.mjs");
  await writeFile(preloadPath, preload);
  for (const mode of [
    "success",
    "retry",
    "retry-legacy",
    "installer-mismatch",
    "published",
    "stale",
    "bad-upload",
    "raw-unavailable",
    "immutable",
    "cleanup",
    "published-cleanup",
    "published-stale",
  ]) {
    await writeFile(join(directory, "requests.log"), "");
    const result = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(preloadPath).href, publisher],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_TOKEN: "fixture-token",
          GITHUB_SHA: "a".repeat(40),
          GITHUB_REPOSITORY: "okgutta/lyrivaMusic",
          RELEASE_TEST_MODE: mode,
          KEEP_ONLY_LATEST_RELEASE: ["cleanup", "published-cleanup", "published-stale"].includes(
            mode
          )
            ? "true"
            : "",
        },
      }
    );
    const failed = ["bad-upload", "raw-unavailable", "immutable", "installer-mismatch"].includes(
      mode
    );
    assert.equal(result.status === 0, !failed, `${mode}: ${result.stderr}`);
    const requests = await readFile(join(directory, "requests.log"), "utf8");
    assert.equal(
      requests.includes("PATCH /releases/1"),
      ["success", "retry", "retry-legacy", "cleanup"].includes(mode),
      mode
    );
    if (["published", "stale"].includes(mode)) assert.doesNotMatch(requests, /POST|PATCH|DELETE/);
    if (mode === "retry") assert.doesNotMatch(requests, /assets/);
    if (mode === "installer-mismatch") assert.doesNotMatch(requests, /POST|PATCH|DELETE/);
    if (["cleanup", "published-cleanup"].includes(mode)) {
      assert.match(requests, /DELETE \/releases\/201/);
      assert.match(requests, /GET \/releases\?per_page=100&page=1/);
      assert.match(requests, /GET \/releases\?per_page=100&page=2/);
      assert.doesNotMatch(requests, /DELETE \/releases\/(202|203|204|205|10\d\d)/);
    }
    if (mode === "published-stale") {
      assert.doesNotMatch(requests, /GET \/releases\?per_page=100/);
      assert.doesNotMatch(requests, /DELETE \/releases\//);
    }
  }
  console.log(
    "Single-file Release publication, legacy draft cleanup and update compatibility tests passed"
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
