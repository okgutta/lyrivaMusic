/// <reference types="node" />
import assert from "node:assert/strict";
import type * as Esbuild from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { LyricsObject as Model } from "../../lyrics.ts";
import type { ApplySyllableLyrics } from "./Syllable.ts";
import type { ApplyLineLyrics } from "./Line.ts";
import type { ApplyStaticLyrics } from "../Static.ts";
import type { positionLineTranslation } from "../Utils/TranslationPosition.ts";

const { build } = createRequire(import.meta.url)("esbuild") as typeof Esbuild;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

class FixtureStyle {
  private properties = new Map<string, string>();
  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }
  get scale(): string {
    return this.properties.get("scale") ?? "";
  }
  set scale(value: string) {
    this.setProperty("scale", value);
  }
  get transform(): string {
    return this.properties.get("transform") ?? "";
  }
  set transform(value: string) {
    this.setProperty("transform", value);
  }
  toString(): string {
    return [...this.properties].map(([name, value]) => `${name}: ${value};`).join(" ");
  }
}

// Keep actual DOM child order, including the text nodes used by Line and Static.
// This fixture implements only the renderer's element-construction operations.
class FixtureText {
  readonly nodeType = 3;
  parentElement: FixtureElement | null = null;
  constructor(public textContent: string) {}
}
class FixtureElement {
  readonly nodeType = 1;
  parentElement: FixtureElement | null = null;
  childNodes: Array<FixtureElement | FixtureText> = [];
  private classes = new Set<string>();
  private attributes = new Map<string, string>();
  style = new FixtureStyle();
  classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force = !this.classes.has(name)) => {
      if (force) this.classes.add(name);
      else this.classes.delete(name);
      return force;
    },
  };
  constructor(readonly tagName: string) {}
  get children(): FixtureElement[] {
    return this.childNodes.filter((child): child is FixtureElement => child.nodeType === 1);
  }
  get lastElementChild(): FixtureElement | null {
    return this.children.at(-1) ?? null;
  }
  get firstChild(): FixtureElement | FixtureText | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): FixtureElement | FixtureText | null {
    return this.childNodes.at(-1) ?? null;
  }
  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }
  set textContent(value: string) {
    for (const child of this.childNodes) child.parentElement = null;
    this.childNodes = [];
    if (value) this.appendChild(new FixtureText(value));
  }
  get className(): string {
    return [...this.classes].join(" ");
  }
  set className(value: string) {
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }
  appendChild<T extends FixtureElement | FixtureText>(child: T): T {
    const previous = child.parentElement;
    if (previous) previous.childNodes.splice(previous.childNodes.indexOf(child), 1);
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore<T extends FixtureElement | FixtureText>(
    child: T,
    before: FixtureElement | FixtureText | null
  ): T {
    if (child === before) return child;
    if (!before) return this.appendChild(child);
    const previous = child.parentElement;
    if (previous) previous.childNodes.splice(previous.childNodes.indexOf(child), 1);
    const index = this.childNodes.indexOf(before);
    assert.ok(index >= 0, "Reference child belongs to parent");
    child.parentElement = this;
    this.childNodes.splice(index, 0, child);
    return child;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  get outerHTML(): string {
    const attributes = new Map(this.attributes);
    if (this.className) attributes.set("class", this.className);
    if (this.style.toString()) attributes.set("style", this.style.toString());
    const serializedAttributes = [...attributes]
      .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
      .join("");
    const content = this.childNodes
      .map((child) =>
        child instanceof FixtureElement ? child.outerHTML : escapeHtml(child.textContent)
      )
      .join("");
    const tag = this.tagName.toLowerCase();
    return `<${tag}${serializedAttributes}>${content}</${tag}>`;
  }
}

const mountRoot = new FixtureElement("DIV");
const host = {
  translationPosition: "below" as "below" | "above",
  PageContainer: { querySelector: () => mountRoot },
  createContainer() {
    const Container = new FixtureElement("DIV");
    Container.classList.add("SpicyLyricsScrollContainer");
    return { Container, Append: (parent: FixtureElement) => parent.appendChild(Container) };
  },
  mountVirtualLines(_scroll: unknown, container: FixtureElement, lines: FixtureElement[]) {
    for (const line of lines) container.appendChild(line);
  },
};

const bundle = await build({
  stdin: {
    contents: `
      export * from "./src/utils/Lyrics/Applyer/Synced/Syllable.ts";
      export * from "./src/utils/Lyrics/Applyer/Synced/Line.ts";
      export * from "./src/utils/Lyrics/Applyer/Static.ts";
      export * from "./src/utils/Lyrics/lyrics.ts";
      export * from "./src/utils/Lyrics/Applyer/Utils/TranslationPosition.ts";
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
      name: "lyrics-renderer-host-fixture",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /\/(?:stores|readingPreferences|PageView|Styles|ScrollSimplebar|lyrics|CreateLyricsContainer|LyricsVirtualizer|ApplyIsByCommunity|ApplyLyricsCredits|ApplyProvider|OnApply)\.tsx?$/,
          },
          (args) => ({ path: args.path.split("/").pop()!, namespace: "renderer-fixture" })
        );
        builder.onLoad({ filter: /.*/, namespace: "renderer-fixture" }, (args) => {
          const sources: Record<string, string> = {
            "readingPreferences.ts": `export const $lyricsTranslationPosition = { get: () => host.translationPosition };`,
            "stores.ts": `
              export const $lyricsContainerExists = { get: () => true };
              export const $minimalLyricsMode = { get: () => false };
              export const $simpleLyricsMode = { get: () => false };`,
            "PageView.ts": "export const PageContainer = host.PageContainer;",
            "Styles.ts": "export function applyStyles() {} export function removeAllStyles() {}",
            "ScrollSimplebar.ts": `
              export const ScrollSimplebar = { getScrollElement: () => ({}) };
              export function MountScrollSimplebar() {}
              export function RecalculateScrollSimplebar() {}`,
            "CreateLyricsContainer.ts":
              "export const CreateLyricsContainer = host.createContainer;",
            "LyricsVirtualizer.ts": "export const initLyricsVirtualizer = host.mountVirtualLines;",
            "ApplyIsByCommunity.tsx": "export function ApplyIsByCommunity() {}",
            "ApplyLyricsCredits.ts": "export function ApplyLyricsCredits() {}",
            "ApplyProvider.ts": "export function ApplyLyricsProvider() {}",
            "OnApply.ts": "export function EmitApply() {}",
            // These are live ESM bindings shared by Syllable and Emphasize. A
            // frozen index would silently send all later words to the first row.
            "lyrics.ts": `
              export const LyricsObject = { Types: {
                Syllable: { Lines: [] }, Line: { Lines: [] }, Static: { Lines: [] }
              } };
              export let CurrentLineLyricsObject = -1;
              export let LINE_SYNCED_CurrentLineLyricsObject = -1;
              export function SetWordArrayInCurentLine() {
                CurrentLineLyricsObject = LyricsObject.Types.Syllable.Lines.length - 1;
                if (CurrentLineLyricsObject >= 0)
                  LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables = { Lead: [] };
              }
              export function SetWordArrayInCurentLine_LINE_SYNCED() {
                LINE_SYNCED_CurrentLineLyricsObject = LyricsObject.Types.Line.Lines.length - 1;
                if (LINE_SYNCED_CurrentLineLyricsObject >= 0)
                  LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables = { Lead: [] };
              }
              export function resetFixtureModel() {
                for (const type of Object.values(LyricsObject.Types)) type.Lines = [];
                CurrentLineLyricsObject = LINE_SYNCED_CurrentLineLyricsObject = -1;
              }
              export const getInterludeTimePadding = () => -550;
              export const getLyricsBetweenShow = () => 3;
              export function setRomanizedStatus() {}`,
          };
          return {
            contents: `const host = globalThis.__lyricsRendererFixture; ${sources[args.path]}`,
            loader: "js",
          };
        });
      },
    },
  ],
});

interface RendererApp {
  positionLineTranslation: typeof positionLineTranslation;
  ApplySyllableLyrics: typeof ApplySyllableLyrics;
  ApplyLineLyrics: typeof ApplyLineLyrics;
  ApplyStaticLyrics: typeof ApplyStaticLyrics;
  LyricsObject: typeof Model;
  resetFixtureModel: () => void;
}

const previousGlobals = new Map(
  ["document", "__lyricsRendererFixture"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ])
);
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { createElement: (tag: string) => new FixtureElement(tag.toUpperCase()) },
});
Object.defineProperty(globalThis, "__lyricsRendererFixture", { configurable: true, value: host });

function dom(element: HTMLElement): FixtureElement {
  return element as unknown as FixtureElement;
}
function hasClass(element: FixtureElement, name: string): boolean {
  return element.classList.contains(name);
}
function assertTranslationLast(element: HTMLElement, original: string, translation: string): void {
  const row = dom(element);
  const translated = row.lastElementChild;
  assert.ok(
    translated && hasClass(translated, "line-translation"),
    "Translation must be the last element in its lead row"
  );
  assert.equal(translated.textContent, translation);
  assert.equal(
    row.childNodes
      .slice(0, -1)
      .map((child) => child.textContent)
      .join(""),
    original,
    "Every original token must precede the translated row"
  );
  assert.equal(row.children.filter((child) => hasClass(child, "line-translation")).length, 1);
}

try {
  const app: RendererApp = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  type SyllableData = Parameters<RendererApp["ApplySyllableLyrics"]>[0];
  const input: SyllableData = {
    Type: "Syllable",
    StartTime: 0,
    Content: [
      {
        Lead: {
          StartTime: 0,
          EndTime: 0.8,
          Syllables: [
            { Text: "Hello ", StartTime: 0, EndTime: 0.3 },
            { Text: "world", StartTime: 0.3, EndTime: 0.8 },
          ],
        },
        Translation: "你好，世界",
      },
      {
        Lead: { StartTime: 1, EndTime: 3, Syllables: [{ Text: "Hold", StartTime: 1, EndTime: 3 }] },
        Translation: "持续长音",
        Background: [
          { StartTime: 1.5, EndTime: 2, Syllables: [{ Text: "echo", StartTime: 1.5, EndTime: 2 }] },
        ],
      },
      {
        Lead: {
          StartTime: 3,
          EndTime: 4,
          Syllables: [
            { Text: "sun", StartTime: 3, EndTime: 3.4, IsPartOfWord: true },
            { Text: "rise", StartTime: 3.4, EndTime: 3.7 },
            { Text: "!", StartTime: 3.7, EndTime: 4 },
          ],
        },
        Translation: "日出",
      },
      {
        Lead: {
          StartTime: 4,
          EndTime: 6,
          Syllables: [
            {
              Text: "准确",
              TransliteratedText: "zhun que",
              StartTime: 4,
              EndTime: 6,
              PreserveTiming: true,
            },
          ],
        },
        Translation: "保持逐字时间",
      },
    ],
  };
  app.ApplySyllableLyrics(input);
  const rows = app.LyricsObject.Types.Syllable.Lines;
  assert.equal(rows.length, 5, "Four lead rows and one separate backing row are rendered");
  assertTranslationLast(rows[0].HTMLElement, "Hello world", "你好，世界");
  assertTranslationLast(rows[1].HTMLElement, "Hold", "持续长音");
  assertTranslationLast(rows[3].HTMLElement, "sunrise!", "日出");
  assertTranslationLast(rows[4].HTMLElement, "准确", "保持逐字时间");

  const emphasized = rows[1].Syllables!.Lead[0];
  assert.ok(emphasized.LetterGroup, "The long-word path executes real Emphasize");
  assert.equal(emphasized.Letters?.length, 4);
  assert.equal(
    emphasized.Letters?.map((letter) => dom(letter.HTMLElement).textContent).join(""),
    "Hold"
  );
  assert.equal(emphasized.Letters?.[0].StartTime, 1000);
  assert.equal(emphasized.Letters?.at(-1)?.EndTime, 2750);
  const groupedRow = dom(rows[3].HTMLElement);
  assert.ok(hasClass(groupedRow.children[0], "word-group"));
  assert.equal(groupedRow.children[0].textContent, "sunrise");
  assert.equal(groupedRow.children[1].textContent, "!");
  assert.equal(
    rows[3].Syllables!.Lead.length,
    3,
    "Grouped tokens remain in the correct live model row"
  );
  assert.equal(
    rows[4].Syllables!.Lead[0].LetterGroup,
    undefined,
    "Accurate timing tokens bypass guessed letter splitting"
  );
  assert.equal(rows[4].Syllables!.Lead[0].StartTime, 4000);
  assert.equal(rows[4].Syllables!.Lead[0].EndTime, 6000);

  const lead = dom(rows[1].HTMLElement);
  const backing = dom(rows[2].HTMLElement);
  assert.ok(rows[2].BGLine && hasClass(backing, "bg-line"));
  assert.equal(backing.textContent, "echo");
  assert.equal(
    backing.children.some((child) => hasClass(child, "line-translation")),
    false
  );
  assert.equal(backing.parentElement, lead.parentElement);
  assert.equal(
    lead.parentElement!.children.indexOf(backing),
    lead.parentElement!.children.indexOf(lead) + 1,
    "Backing vocals follow the translated lead as a separate sibling"
  );
  assert.equal(
    rows[2].Syllables!.Lead[0].BGWord,
    true,
    "Background timing goes into its own live model row"
  );

  // Share the actual renderer output with CSS visual QA. This artifact contains
  // only the static fixture above; custom properties and direct styles survive.
  const artifactDirectory = resolve(".tmp/lyrics-review");
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    resolve(artifactDirectory, "syllable-fixture.html"),
    `${lead.parentElement!.parentElement!.outerHTML}\n`,
    "utf8"
  );

  app.resetFixtureModel();
  app.ApplySyllableLyrics({ ...input, Content: [input.Content[3]] }, true);
  assertTranslationLast(
    app.LyricsObject.Types.Syllable.Lines[0].HTMLElement,
    "zhun que",
    "保持逐字时间"
  );

  app.resetFixtureModel();
  app.ApplyLineLyrics({
    Type: "Line",
    StartTime: 0,
    Content: [{ Text: "Original line", Translation: "逐行译文", StartTime: 0, EndTime: 2 }],
  });
  const lineRow = app.LyricsObject.Types.Line.Lines[0].HTMLElement;
  assertTranslationLast(lineRow, "Original line", "逐行译文");
  assert.equal(
    dom(lineRow).childNodes[0].nodeType,
    3,
    "Line lyrics retain an original text node before translation"
  );

  app.resetFixtureModel();
  app.ApplyStaticLyrics({
    Type: "Static",
    Lines: [{ Text: "Static original", Translation: "静态译文" }],
  });
  const staticRow = app.LyricsObject.Types.Static.Lines[0].HTMLElement;
  assertTranslationLast(staticRow, "Static original", "静态译文");
  assert.equal(
    dom(staticRow).childNodes[0].nodeType,
    3,
    "Static lyrics retain an original text node before translation"
  );

  // Switching reading order reuses the same translation and live timed nodes.
  const originalWordNodes = [...lead.childNodes].slice(0, -1);
  const translation = lead.lastElementChild!;
  app.positionLineTranslation(
    lead as unknown as HTMLElement,
    translation as unknown as HTMLElement,
    "above"
  );
  assert.equal(lead.firstChild, translation);
  assert.equal(lead.childNodes.length, originalWordNodes.length + 1);
  originalWordNodes.forEach((word, index) => assert.equal(lead.childNodes[index + 1], word));
  app.positionLineTranslation(
    lead as unknown as HTMLElement,
    translation as unknown as HTMLElement,
    "below"
  );
  assert.equal(lead.childNodes.length, originalWordNodes.length + 1);
  originalWordNodes.forEach((word, index) => assert.equal(lead.childNodes[index], word));
  assert.equal(lead.lastChild, translation);

  host.translationPosition = "above";
  app.resetFixtureModel();
  app.ApplySyllableLyrics({ ...input, Content: [input.Content[3]] });
  const aboveWordRow = app.LyricsObject.Types.Syllable.Lines[0];
  assert.ok(hasClass(dom(aboveWordRow.HTMLElement).children[0], "line-translation"));
  assert.equal(aboveWordRow.Syllables!.Lead[0].StartTime, 4000);
  assert.equal(aboveWordRow.Syllables!.Lead[0].EndTime, 6000);
  app.resetFixtureModel();
  app.ApplyLineLyrics({
    Type: "Line",
    StartTime: 0,
    Content: [{ Text: "Original", Translation: "译文", StartTime: 0, EndTime: 2 }],
  });
  assert.equal(
    dom(app.LyricsObject.Types.Line.Lines[0].HTMLElement).firstChild?.textContent,
    "译文"
  );
  app.resetFixtureModel();
  app.ApplyStaticLyrics({ Type: "Static", Lines: [{ Text: "Original", Translation: "译文" }] });
  assert.equal(
    dom(app.LyricsObject.Types.Static.Lines[0].HTMLElement).firstChild?.textContent,
    "译文"
  );
} finally {
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}

console.log(
  "Lyrics renderer translation-order tests passed (words, emphasis, grouping, backing vocals, line, static)"
);
