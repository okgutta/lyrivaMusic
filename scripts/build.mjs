import { build, transform } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { wrapRuntime } from "./runtime-wrapper.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const args = process.argv.slice(2);
if (args.some((arg) => !["--no-copy", "--apply"].includes(arg))) {
  throw new Error(
    "Supported production build options: --no-copy, --apply. Use bun run dev for development."
  );
}
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const projectConfig = await readFile("project/config.ts", "utf8");
if (!projectConfig.includes(`ProjectVersion = "${version}"`))
  throw new Error("Project versions differ.");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("A stable semantic version is required.");

execFileSync(
  process.execPath,
  ["node_modules/@spicemod/creator/dist/bin.mjs", "build", "--no-copy", "--no-minify"],
  {
    stdio: "inherit",
    env: { ...process.env, SPICETIFY_SKIP: "true", JITI_FS_CACHE: "0" },
  }
);
const compiled = await readFile("dist/lyrivamusic.js", "utf8");
const runtime = (
  await transform(wrapRuntime(compiled), {
    minify: true,
    target: "chrome120",
    legalComments: "inline",
  })
).code;
await writeFile("dist/lyrivamusic-runtime.js", runtime);

await build({
  stdin: {
    contents: `import { startUpdater } from "./src/updater/core.ts";
      startUpdater({ fallbackCode: ${JSON.stringify(runtime)}, fallbackVersion: ${JSON.stringify(version)}, loaderVersion: 1 })
        .catch(error => console.error("[lyrivaMusic updater]", error));`,
    resolveDir: root,
  },
  bundle: true,
  minify: true,
  format: "iife",
  target: "chrome120",
  outfile: "dist/lyrivamusic.js",
  legalComments: "inline",
});
const hash = (data) => createHash("sha256").update(data).digest("hex");
const manifest = {
  schema: 1,
  version,
  loaderVersion: 1,
  runtime: {
    url: `https://raw.githubusercontent.com/okgutta/lyrivaMusic/updates/versions/v${version}/lyrivamusic-runtime.js`,
    sha256: hash(runtime),
    size: Buffer.byteLength(runtime),
  },
};
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const assets = ["lyrivamusic.js", "lyrivamusic-runtime.js", "manifest.json"];
const checksums = await Promise.all(
  assets.map(async (name) => `${hash(await readFile(join("dist", name)))}  ${name}`)
);
await writeFile("dist/SHA256SUMS.txt", checksums.join("\n") + "\n");
console.log(`Built lyrivaMusic ${version}: installer, runtime, update manifest and checksums.`);

if (!args.includes("--no-copy") && !process.env.CI && process.env.SPICETIFY_SKIP !== "true") {
  const executable = process.platform === "win32" ? "spicetify.exe" : "spicetify";
  let configDir = execFileSync(executable, ["config-dir"], { encoding: "utf8" }).trim();
  // Some Windows Spicetify builds return an empty stdout for `config-dir`.
  // Fall back to the conventional per-user directory so --apply never copies
  // the installer into the repository's local Extensions folder by mistake.
  if (!configDir && process.env.APPDATA) configDir = join(process.env.APPDATA, "spicetify");
  if (!configDir) throw new Error("Unable to determine the Spicetify config directory.");
  const target = resolve(configDir, "Extensions");
  await mkdir(target, { recursive: true });
  await copyFile("dist/lyrivamusic.js", join(target, "lyrivamusic.js"));
  console.log(`Copied installer to ${target}`);
  if (args.includes("--apply")) execFileSync(executable, ["apply"], { stdio: "inherit" });
}
