import { readdir, mkdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
async function discover(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await discover(path)));
    else if (entry.name.endsWith(".test.ts")) result.push(path);
  }
  return result;
}
const files = (await discover(resolve(root, "src"))).sort();
await mkdir(resolve(root, ".tmp/tests"), { recursive: true });
// Bundle third-party packages exactly as production does. This also supports
// the existing cyrillic package's extensionless ESM imports on Node 22/24.
for (const file of files) {
  const out = resolve(
    root,
    ".tmp/tests",
    relative(root, file).replaceAll(/[\\/]/g, "_").replace(/\.ts$/, ".mjs")
  );
  await build({
    entryPoints: [file],
    outfile: out,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    logLevel: "warning",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
  });
  const result = spawnSync(process.execPath, [out], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Verified ${files.length} Spicetify extension test files.`);
