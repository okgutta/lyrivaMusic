import Global from "../../../../components/Global/Global.ts";
import { PageContainer } from "../../../../components/Pages/PageView.ts";
import { onFrame } from "../../../../modules/FrameLoop.ts";
import {
  breakdownCacheKey,
  buildHeuristicBreakdown,
  type BreakdownToken,
} from "../../../../shared/lyrics/wordBreakdown.ts";
import {
  $learningHideWords,
  $learningMode,
  $lyricsContainerExists,
  $translationTargetLang,
} from "../../../stores.ts";
import { triggerRemeasureLV } from "../../LyricsVirtualizer.ts";

/**
 * 逐词对照（Learning Mode）——扩展端的注入层。
 *
 * 翻译管线只返回整行译文，没有词级对齐信息，所以对照清单是启发式推断
 * （见 src/shared/lyrics/wordBreakdown.ts），每个 token 带 confidence，
 * UI 据此降低低置信度对照的视觉权重。
 *
 * 注入位置：当前行（.line.Active）之后插入一个兄弟节点 div.line-learning。
 * 之所以不把清单塞进 .line 内部：
 *   - .line 的内容归 Syllable / Line applyer 与 LyricsAnimator 所有，改文本或
 *     class 会破坏音节时序、字素动画，以及 LinesEvListener 的点击跳转映射；
 *   - 虚拟化器的 wrapper 是"行 + 注入行"的容器，卸载/重挂载时整块搬走，
 *     注入内容自然跟着回来，不需要在挂载回调里重建。
 * 代价是 Mixed.css 里 `.line.Active + .line.Sung` 会因中间多了个兄弟节点失效
 * （极简模式全屏下上一行的透明度微调），属可接受的视觉降级。
 *
 * 类名必须避开 line / word / Emphasis / letter 这些类 token：lyrics.ts 的
 * LinesEvListener 用 closest(".line, .word, .Emphasis") 做类 token 精确匹配，
 * 命中就把播放位置跳到该行/词。`.line-learning` 等不会命中。
 *
 * PiP 窗口下 #SpicyLyricsPage 建在 Picture-in-Picture document 里，所以所有
 * DOM 操作都要经过 PageContainer.ownerDocument，模块级 document 会指向主窗口。
 */

/** 检查间隔：120ms 足够跟上换行，又不必每帧查 DOM */
const LEARNING_THROTTLE_MS = 120;
/** 任一侧没有对应词时的占位，避免渲染出零宽空盒子 */
const EMPTY_CELL = "—";
/** 推断结果缓存上限；超出直接清空（一首歌的行数远低于此，不做 LRU） */
const BREAKDOWN_CACHE_LIMIT = 512;

interface CurrentRow {
  key: string;
  line: HTMLElement;
  row: HTMLElement;
  tokens: BreakdownToken[];
}

let stopFrame: (() => void) | null = null;
let lastCheck = 0;
/** 上一次的对照键；与当前行一致且节点仍在文档里时不重建 */
let lastKey = "";
let currentRow: CurrentRow | null = null;
const breakdownCache = new Map<string, BreakdownToken[]>();
/** 藏词自测：已揭示的 token 下标，按对照键分组 */
const revealed = new Map<string, Set<number>>();

function collapse(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/**
 * 取一行的原文。
 *
 * 不用 line.textContent：那里混着译文字块，Syllable 行还会带上间奏的 "•"。
 */
function extractSourceText(line: HTMLElement): string {
  if (line.classList.contains("musical-line")) return "";
  // Syllable 行：正文是一串 .word / .letterGroup（逐字动画的词被包在后者里），
  // 各自 textContent 直接相接就是原文——provider 把词间空格留在音节文本里，
  // 中文本来就没有空格，所以不能按 " " 拼接，否则汉字会被逐字拆开。
  const pieces = line.querySelectorAll<HTMLElement>(".word:not(.dot), .letterGroup");
  if (pieces.length > 0) {
    return collapse(Array.from(pieces, (piece) => piece.textContent ?? "").join(""));
  }
  // Line / Static 行：正文是 .line 的裸文本节点，克隆一份摘掉译文与间奏点再取文本
  const clone = line.cloneNode(true) as HTMLElement;
  clone.querySelector(".line-translation")?.remove();
  clone.querySelector(".dotGroup")?.remove();
  return collapse(clone.textContent ?? "");
}

function extractTargetText(line: HTMLElement): string {
  return line.querySelector<HTMLElement>(".line-translation")?.textContent?.trim() ?? "";
}

function breakdownFor(key: string, source: string, target: string): BreakdownToken[] {
  const cached = breakdownCache.get(key);
  if (cached) return cached;
  const tokens = buildHeuristicBreakdown(source, target).tokens;
  if (breakdownCache.size >= BREAKDOWN_CACHE_LIMIT) breakdownCache.clear();
  breakdownCache.set(key, tokens);
  return tokens;
}

function toggleReveal(key: string, index: number): void {
  const set = revealed.get(key) ?? new Set<number>();
  if (set.has(index)) set.delete(index);
  else set.add(index);
  revealed.set(key, set);
  applyRevealState(key, index);
}

/**
 * 就地切换一个 token 的揭示状态。
 * 不整行重建：重建会换掉节点，键盘用户刚按下去的那个按钮会丢焦点。
 */
function applyRevealState(key: string, index: number): void {
  if (currentRow?.key !== key) return;
  const revealedHere = revealed.get(key)?.has(index) === true;
  const cell = currentRow.row.querySelectorAll<HTMLElement>(".learning-token")[index];
  const target = cell?.querySelector<HTMLElement>(".learning-target");
  if (!cell || !target) return;
  target.classList.toggle("learning-hidden", !revealedHere);
  // 遮住时要让读屏也读不到答案，否则藏词自测对它们形同虚设
  if (revealedHere) target.removeAttribute("aria-hidden");
  else target.setAttribute("aria-hidden", "true");
  cell.setAttribute("aria-label", tokenLabel(cell, revealedHere));
  cell.setAttribute("aria-pressed", String(revealedHere));
}

/** 遮住时不把译文写进无障碍名称，同时说明点一下会发生什么 */
function tokenLabel(cell: HTMLElement, revealedHere: boolean): string {
  const source = cell.querySelector(".learning-source")?.textContent ?? EMPTY_CELL;
  if (!revealedHere) return `${source} — 已隐藏，点击揭示译文`;
  const target = cell.querySelector(".learning-target")?.textContent ?? EMPTY_CELL;
  return `${source} — ${target}`;
}

/**
 * 生成对照清单节点；藏词自测只遮目标一侧，原文始终可见。
 * 文档对象从行长上取而不是 PageContainer：PiP 开/关会把 PageContainer 换成
 * 另一个 document 的节点，用行自己的 ownerDocument 才不会把节点建错文档。
 */
function renderRow(line: HTMLElement, key: string, tokens: BreakdownToken[]): HTMLElement {
  const doc = line.ownerDocument;
  const row = doc.createElement("div");
  row.className = "line-learning";
  row.dataset.origin = "heuristic";

  const hideTargets = $learningHideWords.get();
  const revealedHere = revealed.get(key);

  tokens.forEach((token, index) => {
    const cell = doc.createElement("span");
    cell.className = "learning-token";
    cell.dataset.confidence = token.confidence;

    const source = doc.createElement("span");
    source.className = "learning-source";
    source.textContent = token.source || EMPTY_CELL;
    cell.appendChild(source);

    const target = doc.createElement("span");
    target.className = "learning-target";
    target.textContent = token.target || EMPTY_CELL;
    cell.appendChild(target);

    if (hideTargets && token.target) {
      const revealedToken = revealedHere?.has(index) === true;
      target.classList.toggle("learning-hidden", !revealedToken);
      cell.classList.add("learning-interactive");
      // 可聚焦 + 回车/空格：藏词自测要靠键盘也能用
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-pressed", String(revealedToken));
      // 遮住时读屏也不能读到答案，否则藏词自测对它们形同虚设
      if (!revealedToken) target.setAttribute("aria-hidden", "true");
      cell.setAttribute("aria-label", tokenLabel(cell, revealedToken));
      const reveal = (event: Event) => {
        event.stopPropagation();
        event.preventDefault();
        toggleReveal(key, index);
      };
      cell.addEventListener("click", reveal);
      cell.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") reveal(event);
      });
    }

    row.appendChild(cell);
  });

  return row;
}

function removeRow(): boolean {
  if (!currentRow) return false;
  currentRow.row.remove();
  currentRow = null;
  return true;
}

function rebuildRow(): void {
  const current = currentRow;
  if (!current) return;
  removeRow();
  if (!current.line.isConnected) return;
  const row = renderRow(current.line, current.key, current.tokens);
  current.line.after(row);
  currentRow = { ...current, row };
  triggerRemeasureLV();
}

function resetLearning(): void {
  // 这里不触发重测量：调用点要么是关闭逐词对照（节点刚被摘掉），
  // 要么是新歌词正在应用、整个容器马上要被销毁。
  removeRow();
  lastKey = "";
  lastCheck = 0;
  breakdownCache.clear();
  revealed.clear();
}

function updateLearningRow(): void {
  const container = PageContainer;
  if (!container) return;

  // bg-line（背景和声）与 musical-line（间奏点）也在同一批 LyricsObject 里，
  // 都可能被标成 Active，但它们没有可对照的正文。
  const line = container.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent .line.Active:not(.musical-line):not(.bg-line)"
  );
  // 虚拟化器卸载后元素脱离文档；此时不重建，重挂载时注入行仍在 wrapper 里。
  if (!line || !line.isConnected) return;

  const target = extractTargetText(line);
  const source = target ? extractSourceText(line) : "";
  const key = target && source ? breakdownCacheKey(source, $translationTargetLang.get()) : "";

  if (!key) {
    if (lastKey !== "") {
      lastKey = "";
      if (removeRow()) triggerRemeasureLV();
    }
    return;
  }
  if (key === lastKey && currentRow?.row.isConnected) return;

  lastKey = key;
  removeRow();
  // 换行时丢掉上一行的揭示状态：藏词自测要在重听同一句时重新开始，
  // 顺带把 Map 的规模限制在当前这一行。
  if (revealed.size > 0) revealed.clear();

  const tokens = breakdownFor(key, source, target);
  if (tokens.length === 0) return;

  const row = renderRow(line, key, tokens);
  line.after(row);
  currentRow = { key, line, row, tokens };
  triggerRemeasureLV();
}

function learningTick(): void {
  // 容器不存在（歌词页关闭 / 尚未打开）时自停，由 $lyricsContainerExists 重启，
  // 避免应用启动到打开歌词页之间空转烧帧。
  if (!$lyricsContainerExists.get()) {
    stopLearning();
    resetLearning();
    return;
  }
  const now = performance.now();
  if (now - lastCheck < LEARNING_THROTTLE_MS) return;
  lastCheck = now;
  updateLearningRow();
}

function stopLearning(): void {
  stopFrame?.();
  stopFrame = null;
}

function startLearning(): void {
  if (stopFrame !== null || !$learningMode.get()) return;
  stopFrame = onFrame(learningTick);
}

// 歌词重应用前会先发 not-apply（Applyer/OnApply.ts），旧容器的行可能还挂在
// 虚拟化器的 wrapper 缓存里，所以要在这里把模块级状态一并清掉。
Global.Event.listen("lyrics:not-apply", () => {
  resetLearning();
});

$learningHideWords.listen(() => {
  rebuildRow();
});

$learningMode.listen((enabled) => {
  if (!enabled) {
    const hadRow = currentRow !== null;
    resetLearning();
    if (hadRow) triggerRemeasureLV();
    stopLearning();
    return;
  }
  startLearning();
});

// 设置是持久化的，启动时就可能是开启状态（listen 不会立刻回调）
startLearning();

// 容器出现时重启（learningTick 在容器消失时自停，见上）
$lyricsContainerExists.listen((exists) => {
  if (exists) startLearning();
});
