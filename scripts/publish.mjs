import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// CI's repository-scoped token is supplied by Actions, never bundled in the extension.
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required for release publishing.");
const repository = "okgutta/lyrivaMusic";
if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== repository) {
  throw new Error("Forks must configure their own update channel before publishing.");
}
const api = `https://api.github.com/repos/${repository}`;
const sha =
  process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Expected a stable semantic version.");
const tag = `v${version}`;
const versionParts = version.split(".").map(Number);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const parseStableTag = (tagName) => {
  const match = typeof tagName === "string" && /^v(\d+)\.(\d+)\.(\d+)$/.exec(tagName);
  return match ? match.slice(1).map(Number) : null;
};
const compareVersions = (left, right) => {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};
async function request(path, { method = "GET", body, binary = false, optional = false } = {}) {
  const url = path.startsWith("https:") ? path : api + path;
  if (!["api.github.com", "uploads.github.com"].includes(new URL(url).hostname))
    throw new Error("Invalid GitHub host.");
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": binary ? "application/octet-stream" : "application/json" } : {}),
    },
    ...(body !== undefined ? { body: binary ? body : JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  if (optional && response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GitHub ${method} ${new URL(url).pathname}: HTTP ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

let release = await request(`/releases/tags/${tag}`, { optional: true });
const isCurrentLatest = (latestRelease) =>
  Boolean(
    latestRelease?.tag_name === tag &&
    (latestRelease.id == null || release?.id == null || latestRelease.id === release.id)
  );
async function removeOlderReleases() {
  const latestRelease = await request("/releases/latest", { optional: true });
  if (!isCurrentLatest(latestRelease)) {
    console.log(`${tag} is not the latest release; keeping existing releases.`);
    return;
  }

  const releases = [];
  for (let page = 1; ; page++) {
    const pageReleases = await request(`/releases?per_page=100&page=${page}`);
    if (!Array.isArray(pageReleases)) throw new Error("GitHub releases response is not an array.");
    releases.push(...pageReleases);
    if (pageReleases.length < 100) break;
  }

  for (const candidate of releases) {
    if (candidate.id === release?.id || candidate.tag_name === tag) continue;
    if (candidate.draft || candidate.prerelease || candidate.id == null) continue;
    const candidateVersion = parseStableTag(candidate.tag_name);
    if (!candidateVersion || compareVersions(candidateVersion, versionParts) >= 0) continue;
    await request(`/releases/${candidate.id}`, { method: "DELETE" });
    console.log(`Removed older release ${candidate.tag_name}`);
  }
}
if (release && !release.draft) {
  if (process.env.KEEP_ONLY_LATEST_RELEASE === "true") await removeOlderReleases();
  console.log(`${tag} is already published. Increase the version for the next release.`);
  process.exit(0);
}
const latest = await request("/releases/latest", { optional: true });
const latestVersion = parseStableTag(latest?.tag_name);
if (latestVersion && compareVersions(versionParts, latestVersion) <= 0) {
  if (versionParts.every((part, index) => part === latestVersion[index])) {
    console.log(`${tag} is already the latest release; skipping stale workflow.`);
  } else {
    console.log(`${tag} is older than the latest release; skipping stale workflow.`);
  }
  process.exit(0);
}
const manifestBytes = await readFile("dist/manifest.json");
const manifest = JSON.parse(manifestBytes);
const runtimeBytes = await readFile("dist/lyrivamusic-runtime.js");
if (
  manifest.version !== version ||
  manifest.schema !== 1 ||
  manifest.runtime.sha256 !== hash(runtimeBytes) ||
  manifest.runtime.size !== runtimeBytes.length ||
  manifest.runtime.url !==
    `https://raw.githubusercontent.com/${repository}/updates/versions/${tag}/lyrivamusic-runtime.js`
) {
  throw new Error("Release build and manifest differ.");
}
const installerBytes = await readFile("dist/lyrivamusic.js");
const installerDigest = `sha256:${hash(installerBytes)}`;
const existingInstaller = release?.assets.find((asset) => asset.name === "lyrivamusic.js");
if (existingInstaller && existingInstaller.digest !== installerDigest)
  throw new Error("Existing draft asset differs: lyrivamusic.js");
let notes;
try {
  notes = await readFile(`docs/releases/${tag}.md`, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  notes = (
    await request("/releases/generate-notes", {
      method: "POST",
      body: { tag_name: tag, target_commitish: sha },
    })
  ).body;
}
const existingTag = await request(`/git/ref/tags/${tag}`, { optional: true });
if (existingTag && existingTag.object.sha !== sha)
  throw new Error("The version tag already points to another object.");
if (!existingTag)
  await request("/git/refs", { method: "POST", body: { ref: `refs/tags/${tag}`, sha } });
if (!release)
  release = await request("/releases", {
    method: "POST",
    body: {
      tag_name: tag,
      target_commitish: sha,
      name: `lyrivaMusic ${tag}`,
      body: notes,
      draft: true,
      prerelease: false,
    },
  });
// Users install one file. Internal update artifacts are served from updates only.
if (!existingInstaller) {
  const url = release.upload_url.replace(/\{.*$/, "") + "?name=lyrivamusic.js";
  const uploaded = await request(url, { method: "POST", body: installerBytes, binary: true });
  if (uploaded.digest !== installerDigest)
    throw new Error("Asset verification failed: lyrivamusic.js");
}

// A retry may resume a draft created by the previous publisher. Remove only
// its known internal attachments; published releases exited above untouched.
const internalAssets = new Set(["lyrivamusic-runtime.js", "manifest.json", "SHA256SUMS.txt"]);
for (const asset of release.assets) {
  if (internalAssets.has(asset.name)) {
    await request(`/releases/assets/${asset.id}`, { method: "DELETE" });
  }
}

// Runtime and manifest enter the distribution branch in one Git commit.
// The Release becomes visible only after both files are available.
const channel = await request("/git/ref/heads/updates", { optional: true });
const parent = channel ? await request(`/git/commits/${channel.object.sha}`) : null;
const tree = [];
for (const [name, bytes] of [
  ["lyrivamusic-runtime.js", runtimeBytes],
  ["manifest.json", manifestBytes],
]) {
  const path = `versions/${tag}/${name}`;
  const existing = channel
    ? await request(`/contents/${path}?ref=updates`, { optional: true })
    : null;
  const blob = await request("/git/blobs", {
    method: "POST",
    body: { content: bytes.toString("base64"), encoding: "base64" },
  });
  if (existing && existing.sha !== blob.sha)
    throw new Error(`Published channel version is immutable: ${path}`);
  tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
}
const newTree = await request("/git/trees", {
  method: "POST",
  body: { ...(parent ? { base_tree: parent.tree.sha } : {}), tree },
});
const commit = await request("/git/commits", {
  method: "POST",
  body: { message: `Publish ${tag}`, tree: newTree.sha, parents: parent ? [parent.sha] : [] },
});
if (channel) {
  await request("/git/refs/heads/updates", {
    method: "PATCH",
    body: { sha: commit.sha, force: false },
  });
} else {
  await request("/git/refs", {
    method: "POST",
    body: { ref: "refs/heads/updates", sha: commit.sha },
  });
}
for (const [name, bytes] of [
  ["manifest.json", manifestBytes],
  ["lyrivamusic-runtime.js", runtimeBytes],
]) {
  const url = `https://raw.githubusercontent.com/${repository}/updates/versions/${tag}/${name}?release=${commit.sha}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), cache: "no-store" });
  if (!response.ok || hash(Buffer.from(await response.arrayBuffer())) !== hash(bytes)) {
    throw new Error(
      `Update channel is not ready: ${name}. Release remains a draft; rerun publishing.`
    );
  }
}
await request(`/releases/${release.id}`, {
  method: "PATCH",
  body: { draft: false, make_latest: "true", body: notes },
});

// This project intentionally exposes only the current stable release. Keep
// older release entries out of the public Releases page after the new one is
// fully published; tags and the updates branch remain available as history.
if (process.env.KEEP_ONLY_LATEST_RELEASE === "true") await removeOlderReleases();
console.log(`Published https://github.com/${repository}/releases/tag/${tag}`);
