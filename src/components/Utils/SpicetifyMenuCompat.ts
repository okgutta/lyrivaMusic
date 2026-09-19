type ClientRequire = ((id: string) => unknown) & {
  m: Record<string, unknown>;
};

type ClientChunks = {
  push: (chunk: unknown[]) => unknown;
};

const menuItemMarkers = ["menuItemLabel", "autoClose", "leadingIcon", "trailingIcon"];

function isNativeMenuItem(value: unknown): value is (...args: unknown[]) => unknown {
  if (typeof value !== "function") return false;
  const source = Function.prototype.toString.call(value);
  return menuItemMarkers.every((marker) => source.includes(marker));
}

/** Repair the specific MenuItem extraction collision in Spicetify 2.45 / Spotify 1.3. */
export function ensureSpicetifyMenuItem(): void {
  const current = Spicetify.ReactComponent?.MenuItem;
  if (typeof current !== "function") return;
  const source = Function.prototype.toString.call(current);
  // The wrapper's handleMouseEnter/onClick heuristic selects AudioWaveform
  // before MenuItem. AudioWaveform ignores children, so menu text disappears.
  if (!source.includes("audioAnalysis") || !source.includes("threeBandWaveform")) return;

  try {
    const client = window as Window & {
      rspackChunk?: ClientChunks;
      rspackChunkclient_web?: ClientChunks;
      webpackChunkclient_web?: ClientChunks;
    };
    const chunks =
      client.rspackChunk ?? client.rspackChunkclient_web ?? client.webpackChunkclient_web;
    if (!chunks) return;

    // Use the same client runtime entry point as Spicetify, without depending
    // on module IDs (which change between Spotify builds).
    let requireModule: ClientRequire | undefined;
    chunks.push([
      [Symbol("lyrivaMusic-menu-compat")],
      {},
      (require: ClientRequire) => {
        requireModule = require;
      },
    ]);
    if (typeof requireModule !== "function" || !requireModule.m) return;

    const candidates = new Set<(...args: unknown[]) => unknown>();
    for (const [id, factory] of Object.entries(requireModule.m)) {
      if (!isNativeMenuItem(factory)) continue;
      const exports = requireModule(id);
      if (!exports || typeof exports !== "object") continue;
      for (const value of Object.values(exports)) {
        if (isNativeMenuItem(value)) candidates.add(value);
      }
    }
    if (candidates.size === 1) {
      Object.assign(Spicetify.ReactComponent, { MenuItem: [...candidates][0] });
    }
  } catch (error) {
    console.warn("[lyrivaMusic] Failed to restore the native settings menu item", error);
  }
}
