/// <reference types="node" />
import assert from "node:assert/strict";
import type * as Esbuild from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { LyricsSyllable, SyllableLead } from "../../lyrics.ts";

const { build } = createRequire(import.meta.url)("esbuild") as typeof Esbuild;

class FixtureStyle {
  private values = new Map<string, [string, string]>();
  animation = "";
  willChange = "";
  backfaceVisibility = "";
  setProperty(property: string, value: string, priority = ""): void {
    this.values.set(property, [value, priority]);
  }
  getPropertyValue(property: string): string {
    return this.values.get(property)?.[0] ?? "";
  }
  getPropertyPriority(property: string): string {
    return this.values.get(property)?.[1] ?? "";
  }
  removeProperty(property: string): string {
    const previous = this.getPropertyValue(property);
    this.values.delete(property);
    return previous;
  }
}

let domReads = 0;
let virtual = true;
const viewport = { clientHeight: 600 };
class FixtureElement {
  style = new FixtureStyle();
  isConnected = true;
  classes = new Set<string>();
  classList = {
    contains: (value: string) => this.classes.has(value),
    add: (...values: string[]) => values.forEach((value) => this.classes.add(value)),
    remove: (...values: string[]) => values.forEach((value) => this.classes.delete(value)),
  };
  constructor(
    public top = 0,
    public height = 100
  ) {}
  closest(): typeof viewport {
    assert.equal(virtual, false, "Virtual lyrics must not query the DOM for a viewport");
    return viewport;
  }
  getBoundingClientRect(): { top: number; height: number } {
    assert.equal(virtual, false, "Virtual lyrics must never measure a DOM line");
    domReads++;
    return { top: this.top, height: this.height };
  }
}

function element(top = 0, height = 100): HTMLElement {
  return new FixtureElement(top, height) as unknown as HTMLElement;
}
function node(el: HTMLElement): FixtureElement {
  return el as unknown as FixtureElement;
}
function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const listener of listeners) listener(next);
    },
    listen(listener: (value: T) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      listener(value);
      return () => listeners.delete(listener);
    },
  };
}

let geometryReads = 0;
let revision = 1;
let cacheReady = true;
let mounted: (() => void) | null = null;
const media = { matches: false };
const fixture = {
  stores: {
    $currentLyricsType: store("Syllable"),
    $simpleLyricsMode: store(false),
    $simpleLyricsModeRenderingType: store("calculate"),
    $lyricsContainerExists: store(true),
  },
  model: {
    LyricsObject: { Types: { Syllable: { Lines: [] as LyricsSyllable[] }, Line: { Lines: [] } } },
    SimpleLyricsMode_LetterEffectsStrengthConfig: {
      LongerThan: 1500,
      Longer: { Glow: 0.4, YOffset: 0.45, Scale: 1.103 },
      Shorter: { Glow: 0.285, YOffset: 0.1, Scale: 1.09 },
    },
    preHiddenDotLineMs: 250,
  },
  virtualizer: {
    getLyricsVirtualizer: () => (virtual ? {} : null),
    getLyricsLayoutRevision: () => revision,
    getLyricsViewportHeight: () => (virtual ? viewport.clientHeight : 0),
    getLyricsLineGeometry(el: HTMLElement) {
      geometryReads++;
      return virtual && cacheReady ? { top: node(el).top, height: node(el).height } : null;
    },
    setOnNewElementMounted(callback: () => void) {
      mounted = callback;
    },
  },
};

const observers: Array<{ callback: () => void; disconnected: boolean }> = [];
class FixtureResizeObserver {
  entry: (typeof observers)[number];
  constructor(callback: () => void) {
    this.entry = { callback, disconnected: false };
    observers.push(this.entry);
  }
  observe() {}
  disconnect() {
    this.entry.disconnected = true;
  }
}

const bundle = await build({
  stdin: {
    contents: 'export * from "./src/utils/Lyrics/Animator/Lyrics/LyricsAnimator.ts";',
    resolveDir: resolve("."),
  },
  bundle: true,
  write: false,
  platform: "node",
  target: "node22",
  format: "esm",
  plugins: [
    {
      name: "lyrics-animator-host-fixture",
      setup(builder) {
        builder.onResolve(
          { filter: /\/(?:stores|lyrics|LyricsVirtualizer|CompactMode|PopupLyrics)\.ts$/ },
          (args) => ({ path: args.path.split("/").pop()!, namespace: "lyrics-fixture" })
        );
        builder.onLoad({ filter: /.*/, namespace: "lyrics-fixture" }, (args) => {
          const exports: Record<string, string> = {
            "stores.ts": `export const { $currentLyricsType, $simpleLyricsMode,
              $simpleLyricsModeRenderingType, $lyricsContainerExists } = fixture.stores;`,
            "lyrics.ts": `export const { LyricsObject,
              SimpleLyricsMode_LetterEffectsStrengthConfig, preHiddenDotLineMs } = fixture.model;`,
            "LyricsVirtualizer.ts": `export const { getLyricsVirtualizer,
              getLyricsLayoutRevision, getLyricsLineGeometry, getLyricsViewportHeight,
              setOnNewElementMounted } = fixture.virtualizer;`,
            "CompactMode.ts": "export const IsCompactMode = () => false;",
            "PopupLyrics.ts": "export const IsPIP = false;",
          };
          return {
            contents: `const fixture = globalThis.__lyricsAnimatorFixture; ${exports[args.path]}`,
            loader: "js",
          };
        });
      },
    },
  ],
});

const previousGlobals = new Map(
  ["window", "performance", "ResizeObserver", "__lyricsAnimatorFixture"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ])
);
let wallTime = 0;
for (const [key, value] of Object.entries({
  window: { matchMedia: () => media },
  performance: { now: () => wallTime },
  ResizeObserver: FixtureResizeObserver,
  __lyricsAnimatorFixture: fixture,
})) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

try {
  // The real animator, cubic splines, springs and motion/geometry helpers execute.
  // Only host state, playback model and the virtualizer's cached measurements are fixtures.
  const app = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  const frame = (position: number) => {
    wallTime += 1000 / 60;
    app.Animate(position);
  };
  const word = (start: number, end: number): SyllableLead => ({
    HTMLElement: element(),
    StartTime: start,
    EndTime: end,
    TotalTime: end - start,
  });
  const line = (
    start: number,
    end: number,
    top: number,
    words: SyllableLead[] = []
  ): LyricsSyllable => ({
    HTMLElement: element(top),
    StartTime: start,
    EndTime: end,
    Syllables: { Lead: words },
  });
  const useLines = (lines: LyricsSyllable[]) => {
    fixture.model.LyricsObject.Types.Syllable.Lines = lines;
    app.setBlurringLastLine(null);
    revision++;
  };
  const value = (el: HTMLElement, property: string) => node(el).style.getPropertyValue(property);
  const blur = (item: LyricsSyllable) => Number.parseFloat(value(item.HTMLElement, "--BlurAmount"));

  const lead = line(0, 4000, 500);
  const backing = line(1000, 2500, 820);
  backing.BGLine = true;
  const upcoming = line(5000, 7000, 1100);
  useLines([lead, backing, upcoming]);
  frame(500);
  assert.equal(blur(lead), 0);
  assert.ok(blur(backing) > 0);
  const initialGeometryReads = geometryReads;
  frame(600);
  frame(700);
  assert.equal(geometryReads, initialGeometryReads, "Unchanged frames reuse cached blur geometry");
  frame(1500);
  assert.equal(blur(lead), 0);
  assert.equal(
    blur(backing),
    0,
    "A late backing vocal must become clear within the same lead line"
  );
  const overlapReads = geometryReads;
  frame(1600);
  assert.equal(
    geometryReads,
    overlapReads,
    "Overlapping vocals must not recalculate blur each frame"
  );
  frame(3000);
  assert.ok(
    blur(backing) > 0,
    "An ended backing vocal must regain distance blur before the lead ends"
  );
  node(upcoming.HTMLElement).top = 660;
  revision++;
  frame(3100);
  assert.ok(blur(upcoming) < 3, "A layout revision refreshes cached row geometry");
  assert.equal(domReads, 0);

  cacheReady = false;
  app.setBlurringLastLine(null);
  frame(3200);
  assert.equal(domReads, 0, "A virtual cache still initializing must never trigger DOM fallback");
  cacheReady = true;
  assert.ok(mounted);
  (mounted as () => void)();
  frame(3250);
  assert.equal(blur(lead), 0);

  virtual = false;
  useLines([line(0, 4000, 100), line(4000, 8000, 340)]);
  frame(1000);
  assert.equal(domReads, 2, "Non-virtual lyrics measure their connected rows once");
  frame(1100);
  frame(1200);
  assert.equal(domReads, 2, "Non-virtual lyrics do not read layout each frame");
  observers.findLast((observer) => !observer.disconnected)!.callback();
  frame(1300);
  assert.equal(domReads, 4, "A real resize invalidates the fallback measurements");
  frame(4500);
  assert.equal(domReads, 6, "Changing the active line refreshes the fallback geometry");
  fixture.stores.$lyricsContainerExists.set(false);
  assert.ok(
    observers.every((observer) => observer.disconnected),
    "Leaving lyrics releases observers"
  );
  fixture.stores.$lyricsContainerExists.set(true);

  virtual = true;
  const short = word(900, 1100);
  const long = word(0, 2000);
  const letter = { HTMLElement: element(), StartTime: 0, EndTime: 2000 };
  const group = { ...word(0, 2000), LetterGroup: true, Letters: [letter] };
  const dot = { ...word(0, 2000), Dot: true };
  const motionLine = line(0, 5000, 500, [short, long, group, dot]);
  node(motionLine.HTMLElement).style.setProperty("transition", "opacity 0.2s");
  useLines([motionLine]);
  for (let i = 0; i < 45; i++) frame(1000);
  assert.equal(value(short.HTMLElement, "--gradient-position"), "40%");
  assert.equal(value(long.HTMLElement, "--gradient-position"), "40%");
  assert.ok(
    Math.abs(Number(value(short.HTMLElement, "scale")) - 1) <
      Math.abs(Number(value(long.HTMLElement, "scale")) - 1),
    "Short words receive less scale than sustained words at the same progress"
  );
  assert.ok(
    parseFloat(value(short.HTMLElement, "--text-shadow-opacity")) <
      parseFloat(value(long.HTMLElement, "--text-shadow-opacity")),
    "Short words receive less glow than sustained words"
  );
  frame(1050);
  assert.equal(value(short.HTMLElement, "--gradient-position"), "70%");
  assert.equal(value(long.HTMLElement, "--gradient-position"), "43%");

  media.matches = true;
  const animatedElements = [
    motionLine.HTMLElement,
    short.HTMLElement,
    long.HTMLElement,
    group.HTMLElement,
    letter.HTMLElement,
    dot.HTMLElement,
  ];
  for (const position of [1060, 1070, 3000, 1000]) {
    frame(position);
    for (const el of animatedElements) {
      assert.equal(
        value(el, "scale"),
        "1",
        "Reduced motion suppresses every word/letter/dot scale"
      );
      assert.equal(value(el, "transform"), "none", "Reduced motion suppresses every translation");
      assert.equal(node(el).style.getPropertyPriority("scale"), "important");
      assert.equal(node(el).style.getPropertyPriority("transform"), "important");
    }
  }
  assert.equal(
    value(short.HTMLElement, "--gradient-position"),
    "40%",
    "Timing still advances in reduced motion"
  );
  media.matches = false;
  frame(1050);
  assert.equal(node(long.HTMLElement).style.getPropertyPriority("transform"), "");
  assert.notEqual(
    value(long.HTMLElement, "transform"),
    "none",
    "Ordinary motion resumes after the preference is disabled"
  );
  assert.notEqual(value(long.HTMLElement, "scale"), "1");
  assert.equal(
    value(motionLine.HTMLElement, "transition"),
    "opacity 0.2s",
    "Original inline styles are restored"
  );
  assert.equal(domReads, 6, "All subsequent virtual frames avoid DOM geometry reads");
} finally {
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}

console.log(
  "LyricsAnimator integration tests passed (geometry caching, backing vocals, timing, reduced motion)"
);
