/**
 * 逐词对照（Learning Mode）的启发式对齐 —— 扩展端与独立 Web 端共用。
 *
 * 翻译管线返回的是整行译文，没有词级对齐信息，所以这里做的是"推断"：
 *   1. 分词：拉丁文字按空白切；中日文没有词边界可依，按字符类别聚合成块
 *      （汉字串按固定步长切、假名黏到前一个词，贴近日文送假名的书写习惯）。
 *   2. 对齐：归一化后的 bigram Dice 相似度找出候选锚点，再用最长单调子序列
 *      挑出顺序一致的一条链；锚点之间的跨度按两侧字符长度比例分配。
 *
 * 推断必然有误差，因此每个 token 都带 confidence：锚点是 high，跨度内两侧
 * 块数恰好相等是 medium，按长度硬分的是 low。UI 据此降低低置信度对照的
 * 视觉权重，让用户分得清哪些对照可靠、哪些只是参考。
 */

export type BreakdownConfidence = "high" | "medium" | "low";

export interface BreakdownToken {
  /** 原文一侧的片段；译文侧多出内容且原文已用尽时为空串 */
  source: string;
  /** 译文一侧的片段；原文侧多出内容且译文已用尽时为空串 */
  target: string;
  confidence: BreakdownConfidence;
}

export interface LineBreakdown {
  tokens: BreakdownToken[];
  /** 目前只有启发式推断；将来若接入模型对齐，在这里返回 model */
  origin: "heuristic";
}

/** 汉字（基本区、扩展 A、兼容区） */
const HAN_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
/** 平假名与片假名（含片假名音扩展） */
const KANA_PATTERN = /[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff]/;
/** 谚文音节与字母 */
const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
/** 字母或数字（拉丁、西里尔、希腊、阿拉伯数字…） */
const ALNUM_PATTERN = /[\p{L}\p{N}]/u;
/** 词首尾的标点与空白：分词后统一剥掉，"词，"与"词"才算同一个词 */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
/** NFD 拆出来的组合附加符（声调符号、变音符号） */
const COMBINING_MARKS = /\p{M}+/gu;
const NON_ALNUM = /[^\p{L}\p{N}]+/gu;

/** 连续汉字不超过这个长度就整体当成一个词 */
const HAN_RUN_MAX = 2;
/** 汉字串的切分步长 */
const HAN_RUN_STEP = 2;
/** 低于这个相似度不认作锚点 */
const ANCHOR_THRESHOLD = 0.6;

type CharKind = "han" | "kana" | "hangul" | "word" | "break";

function classifyChar(char: string): CharKind {
  if (HAN_PATTERN.test(char)) return "han";
  if (KANA_PATTERN.test(char)) return "kana";
  if (HANGUL_PATTERN.test(char)) return "hangul";
  if (ALNUM_PATTERN.test(char)) return "word";
  return "break";
}

/** 这段文字里有没有"不靠空格分词"的书写系统（中日文） */
function needsCharacterSegmentation(text: string): boolean {
  return HAN_PATTERN.test(text) || KANA_PATTERN.test(text);
}

function stripEdgePunctuation(value: string): string {
  return value.replace(EDGE_PUNCTUATION, "");
}

/** 去掉所有空白，只用于估算长度权重 */
function compact(value: string): string {
  return value.replace(/\s+/gu, "");
}

function splitOnWhitespace(text: string): string[] {
  return text
    .split(/\s+/u)
    .map(stripEdgePunctuation)
    .filter((token) => token.length > 0);
}

/**
 * 汉字串内部没有词边界，只能按固定步长粗切。
 * 末尾不足一块的字数并入前一块，避免留下单字孤块。
 */
function splitHanRun(run: string): string[] {
  if (run.length <= HAN_RUN_MAX) return [run];
  const pieces: string[] = [];
  for (let index = 0; index < run.length; index += HAN_RUN_STEP) {
    pieces.push(run.slice(index, index + HAN_RUN_STEP));
  }
  // 末尾只切出单字时并入前一块，避免留下"孤字"这种不像词的块
  const tailIndex = pieces.length - 1;
  if (pieces.length > 1 && pieces[tailIndex].length < HAN_RUN_STEP) {
    pieces[tailIndex - 1] += pieces[tailIndex];
    pieces.pop();
  }
  return pieces;
}

function segmentCjkText(text: string): string[] {
  const runs: { kind: CharKind; text: string }[] = [];
  for (const char of text) {
    const kind = classifyChar(char);
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.text += char;
    else runs.push({ kind, text: char });
  }

  const tokens: string[] = [];
  // 文本开头、以及任何标点/空白之后，都是一个词边界。
  let atBoundary = true;
  for (const run of runs) {
    if (run.kind === "break") {
      atBoundary = true;
      continue;
    }
    if (run.kind === "kana" && !atBoundary && tokens.length > 0) {
      // 假名多是送假名或助词，跟在前一个词后比独立成词更接近真实切分。
      tokens[tokens.length - 1] += run.text;
    } else if (run.kind === "han") {
      tokens.push(...splitHanRun(run.text));
    } else {
      tokens.push(run.text);
    }
    atBoundary = false;
  }
  return tokens.map(stripEdgePunctuation).filter((token) => token.length > 0);
}

/**
 * 把一句歌词切成词。
 *
 * 拉丁文字有空格可依，切得准；中日文没有，只能按字符类别粗切——
 * 英文原文的逐词对照会明显比中文原文可靠。
 */
export function segmentText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (!needsCharacterSegmentation(trimmed)) return splitOnWhitespace(trimmed);
  return segmentCjkText(trimmed);
}

/** 归一化：NFD 分解 → 去组合附加符 → 小写 → 只留字母数字 */
export function normalizeToken(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replace(NON_ALNUM, "");
}

function bigramCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index++) {
    const gram = value.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/**
 * bigram Dice 系数（带重数），取值 [0, 1]。
 * 单字符词不参与打分：只有一个 bigram 时系数非 0 即 1，没有区分度，
 * 判断"相似"和判断"相同"没有区别，所以直接判为不相似。
 */
export function similarity(left: string, right: string): number {
  const a = normalizeToken(left);
  const b = normalizeToken(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const leftGrams = bigramCounts(a);
  const rightGrams = bigramCounts(b);
  let overlap = 0;
  let leftTotal = 0;
  let rightTotal = 0;
  for (const count of leftGrams.values()) leftTotal += count;
  for (const count of rightGrams.values()) rightTotal += count;
  for (const [gram, count] of leftGrams) {
    const other = rightGrams.get(gram);
    if (other !== undefined) overlap += Math.min(count, other);
  }
  return (2 * overlap) / (leftTotal + rightTotal);
}

interface Anchor {
  sourceIndex: number;
  targetIndex: number;
}

/** 每个源词挑一个最像的目标词；同一目标词被多个源词竞争时交给单调链裁决 */
function anchorCandidates(sources: string[], targets: string[]): Anchor[] {
  const candidates: Anchor[] = [];
  sources.forEach((source, sourceIndex) => {
    let bestIndex = -1;
    let bestScore = ANCHOR_THRESHOLD;
    targets.forEach((target, targetIndex) => {
      const score = similarity(source, target);
      // 用严格大于：同分时保留更靠前的目标词，单调链更容易成立
      if (score > bestScore) {
        bestScore = score;
        bestIndex = targetIndex;
      }
    });
    if (bestIndex >= 0) candidates.push({ sourceIndex, targetIndex: bestIndex });
  });
  return candidates;
}

/**
 * 最长严格单调链（两侧下标都递增）。
 * 词序在翻译里基本保持，顺序一致的锚点才可信；交叉的候选只会把对照带偏。
 * 候选数量就是"源词数"，规模很小，O(n²) 足够。
 */
function longestMonotonicAnchors(candidates: Anchor[]): Anchor[] {
  if (candidates.length === 0) return [];
  const sorted = [...candidates].sort(
    (left, right) => left.sourceIndex - right.sourceIndex || left.targetIndex - right.targetIndex
  );

  const best: number[] = [];
  const previous: number[] = [];
  for (let index = 0; index < sorted.length; index++) {
    best[index] = 1;
    previous[index] = -1;
    for (let earlier = 0; earlier < index; earlier++) {
      if (
        sorted[earlier].sourceIndex < sorted[index].sourceIndex &&
        sorted[earlier].targetIndex < sorted[index].targetIndex &&
        best[earlier] + 1 > best[index]
      ) {
        best[index] = best[earlier] + 1;
        previous[index] = earlier;
      }
    }
  }

  let end = 0;
  for (let index = 1; index < sorted.length; index++) {
    if (best[index] > best[end]) end = index;
  }
  const chain: Anchor[] = [];
  for (let index = end; index !== -1; index = previous[index]) chain.push(sorted[index]);
  return chain.reverse();
}

/** 把数值序列转成累计占比边界，末项恒为 1 */
function cumulativeEdges(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const edges: number[] = [];
  let sum = 0;
  for (const value of values) {
    sum += value;
    edges.push(sum / total);
  }
  return edges;
}

/**
 * 块数不等的跨度按字符长度比例分配。
 * 字符长度只是权重的粗略代理：英文词长于中文词，比例会有系统性偏差，
 * 这也是这类分配结果统一标 low 的原因。
 */
function distributeProportional(sources: string[], targets: string[]): string[] {
  const sourceEdges = cumulativeEdges(sources.map((source) => Math.max(1, compact(source).length)));
  const targetEdges = cumulativeEdges(targets.map((target) => Math.max(1, compact(target).length)));

  const assigned: string[] = sources.map(() => "");
  let sourceCursor = 0;
  targets.forEach((target, index) => {
    const edge = targetEdges[index];
    while (sourceCursor < sources.length - 1 && edge > sourceEdges[sourceCursor] + 1e-9) {
      sourceCursor++;
    }
    assigned[sourceCursor] = assigned[sourceCursor]
      ? `${assigned[sourceCursor]} ${target}`
      : target;
  });
  return assigned;
}

/** 没分到译文的源词粘回前一项，避免孤立空对照把清单切碎 */
function mergeEmptyTargets(
  sources: string[],
  assigned: string[]
): { source: string; target: string }[] {
  const merged: { source: string; target: string }[] = [];
  sources.forEach((source, index) => {
    const target = assigned[index];
    if (!target && merged.length > 0) {
      merged[merged.length - 1].source += source;
      return;
    }
    merged.push({ source, target });
  });
  return merged.length > 0 ? merged : sources.map((source) => ({ source, target: "" }));
}

/** 锚点之间的一段：两侧块数相等才敢一一对应，否则按长度比例分 */
function buildSpan(sources: string[], targets: string[]): BreakdownToken[] {
  if (sources.length === 0 && targets.length === 0) return [];
  if (targets.length === 0) {
    return sources.map((source) => ({ source, target: "", confidence: "low" as const }));
  }
  if (sources.length === 0) {
    return [{ source: "", target: targets.join(" "), confidence: "low" as const }];
  }
  if (sources.length === targets.length) {
    return sources.map((source, index) => ({
      source,
      target: targets[index],
      confidence: "medium" as const,
    }));
  }
  return mergeEmptyTargets(sources, distributeProportional(sources, targets)).map(
    ({ source, target }) => ({ source, target, confidence: "low" as const })
  );
}

/**
 * 推断一行原文与它整行译文之间的逐词对照。
 * 任一侧无法分词时返回空 tokens，交给调用方决定是否展示。
 */
export function buildHeuristicBreakdown(sourceText: string, targetText: string): LineBreakdown {
  const sources = segmentText(sourceText);
  const targets = segmentText(targetText);
  if (sources.length === 0 || targets.length === 0) return { tokens: [], origin: "heuristic" };

  const tokens: BreakdownToken[] = [];
  let sourceCursor = 0;
  let targetCursor = 0;

  for (const anchor of longestMonotonicAnchors(anchorCandidates(sources, targets))) {
    tokens.push(
      ...buildSpan(
        sources.slice(sourceCursor, anchor.sourceIndex),
        targets.slice(targetCursor, anchor.targetIndex)
      )
    );
    tokens.push({
      source: sources[anchor.sourceIndex],
      target: targets[anchor.targetIndex],
      confidence: "high",
    });
    sourceCursor = anchor.sourceIndex + 1;
    targetCursor = anchor.targetIndex + 1;
  }

  tokens.push(...buildSpan(sources.slice(sourceCursor), targets.slice(targetCursor)));
  return { tokens, origin: "heuristic" };
}

/** 对照结果的缓存键：目标语言 + 原文（折叠空白与大小写差异） */
export function breakdownCacheKey(sourceText: string, targetLang: string): string {
  return `${targetLang}:${sourceText.trim().toLowerCase().replace(/\s+/gu, " ")}`;
}
