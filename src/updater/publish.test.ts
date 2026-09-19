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
  await writeFile(join(directory, "dist/SHA256SUMS.txt"), "test-checksums");
  await writeFile(join(directory, "docs/releases/v1.3.0.md"), "Release notes");
  // Replace fetch before importing the actual publisher. No network call can escape
  // this fixture; unknown requests fail the child process immediately.
  const preload = `
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
const mode = process.env.RELEASE_TEST_MODE;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
let uploads = 0, verified = 0, channelPublished = false;
const draft = { id: 1, tag_name: "v1.3.0", draft: true, assets: [], upload_url: "https://uploads.github.com/repos/okgutta/lyrivaMusic/releases/1/assets{?name}" };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  const path = url.pathname.replace("/repos/okgutta/lyrivaMusic", "");
  const method = init.method || "GET";
  appendFileSync("requests.log", method + " " + path + "\\n");
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
  if (path === "/releases/tags/v1.3.0") {
    if (mode === "published") return json({ ...draft, draft: false });
    if (mode === "retry") return json({ ...draft, assets: ["lyrivamusic.js", "lyrivamusic-runtime.js", "manifest.json", "SHA256SUMS.txt"].map(name => ({ name, digest: "sha256:" + digest(readFileSync("dist/" + name)) })) });
    return json(null, 404);
  }
  if (path === "/releases/latest") return json({ tag_name: mode === "stale" ? "v1.4.0" : "v1.2.0" });
  if (path === "/git/ref/tags/v1.3.0") return json(null, 404);
  if (path === "/git/refs" && method === "POST") {
    const data = JSON.parse(init.body);
    if (data.ref === "refs/heads/updates") channelPublished = true;
    return json({});
  }
  if (path === "/releases" && method === "POST") return json(draft);
  if (url.hostname === "uploads.github.com") {
    uploads++;
    return json({ digest: "sha256:" + (mode === "bad-upload" ? "bad" : digest(init.body)) });
  }
  if (path === "/git/ref/heads/updates") return mode === "immutable" ? json({ object: { sha: "parent" } }) : json(null, 404);
  if (path === "/git/commits/parent") return json({ sha: "parent", tree: { sha: "old-tree" } });
  if (path.startsWith("/contents/")) return json({ sha: "original-blob" });
  if (path === "/git/blobs") return json({ sha: "new-blob" });
  if (path === "/git/trees") {
    assert.equal(uploads, mode === "retry" ? 0 : 4, "upload all assets before channel publication");
    assert.equal(JSON.parse(init.body).tree.length, 2, "runtime and manifest share one commit");
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
    return json({});
  }
  throw new Error("Unexpected publication request: " + method + " " + input);
};`;
  const preloadPath = join(directory, "fixture.mjs");
  await writeFile(preloadPath, preload);
  for (const mode of [
    "success",
    "retry",
    "published",
    "stale",
    "bad-upload",
    "raw-unavailable",
    "immutable",
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
        },
      }
    );
    const failed = ["bad-upload", "raw-unavailable", "immutable"].includes(mode);
    assert.equal(result.status === 0, !failed, `${mode}: ${result.stderr}`);
    const requests = await readFile(join(directory, "requests.log"), "utf8");
    assert.equal(requests.includes("PATCH /releases/1"), ["success", "retry"].includes(mode), mode);
    if (["published", "stale"].includes(mode)) assert.doesNotMatch(requests, /POST|PATCH/);
    if (mode === "retry") assert.doesNotMatch(requests, /assets/);
  }
  console.log("Release publication ordering, retry and fail-closed tests passed");
} finally {
  await rm(directory, { recursive: true, force: true });
}
