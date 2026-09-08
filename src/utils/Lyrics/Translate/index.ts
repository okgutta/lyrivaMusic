/**
 * 歌词翻译编排：
 *  - 后端译文、整首缓存和行级缓存会在首次渲染前同步挂载，不产生网络请求；
 *  - 只有用户点击歌词页翻译按钮时才请求翻译服务，并且只补齐缺失行；
 *  - 目标语言变化只读取对应缓存，不自动消耗翻译额度。
 */
import Logger from "../../Logger.ts";
import {
  $currentLyricsData,
  $customApiModel,
  $deepSeekModel,
  $lyricsContainerExists,
  $openaiModel,
  $translationProvider,
  $translationTargetLang,
} from "../../stores.ts";
import { SpotifyPlayer } from "../../../components/Global/SpotifyPlayer.ts";
import Global from "../../../components/Global/Global.ts";
import ApplyLyrics from "../Global/Applyer.ts";
import { getCacheSnapshot, getCachedFromSnapshot, setCachedTranslations } from "./cache.ts";
import {
  hasTranslationProviderConfig,
  translateLines,
  type TranslateMetrics,
} from "./providers.ts";
import { fingerprintSource, getReusableTrackCache, setTrackCache } from "./trackCache.ts";
import { isSameLanguage } from "./detect.ts";
import {
  $translationState,
  registerTranslationToggleHandler,
  type TranslationState,
} from "./state.ts";

const translateLogger = new Logger("Lyrics Translation");

type Model = Record<string, any>;

interface TranslationEntry {
  item: any;
  text: string;
  arrayIndex: number;
}

let activeUri: string | null = null;
let activeSourceKey = "";
let ownedIndexes = new Set<number>();
let lastModel: Model | null = null;
let inFlight = false;
let inFlightKey = "";
let currentAbort: AbortController | null = null;
let requestGeneration = 0;
let observedTargetLang = getTargetLang();

function getTargetLang(): string {
  return $translationTargetLang.get() || "zh-CN";
}

function translationText(item: any): string {
  return typeof item?.Translation === "string" ? item.Translation.trim() : "";
}

/** Syllable Vocal 没有 Text 时，按 Lead 音节拼出与渲染器一致的文本。 */
function joinSyllables(lead: any): string {
  if (!lead?.Syllables?.length) return "";
  let text = "";
  const syllables = lead.Syllables;
  for (let i = 0; i < syllables.length; i++) {
    text += syllables[i]?.Text ?? "";
    if (i < syllables.length - 1 && !syllables[i]?.IsPartOfWord) text += " ";
  }
  return text;
}

function extractEntries(model: Model): TranslationEntry[] {
  const entries: TranslationEntry[] = [];
  if (model.Type === "Static" && Array.isArray(model.Lines)) {
    model.Lines.forEach((line: any, index: number) => {
      const text = String(line?.Text ?? "").trim();
      if (text) entries.push({ item: line, text, arrayIndex: index });
    });
  } else if (model.Type === "Line" && Array.isArray(model.Content)) {
    model.Content.forEach((group: any, index: number) => {
      if (group?.Type !== "Vocal") return;
      const text = String(group.Text ?? "").trim();
      if (text) entries.push({ item: group, text, arrayIndex: index });
    });
  } else if (model.Type === "Syllable" && Array.isArray(model.Content)) {
    model.Content.forEach((group: any, index: number) => {
      if (group?.Type !== "Vocal") return;
      const text = String(group.Text ?? joinSyllables(group.Lead)).trim();
      if (text) entries.push({ item: group, text, arrayIndex: index });
    });
  }
  return entries;
}

/** 只复制会写 Translation 的那一层，避免整份歌词 JSON 深拷贝阻塞首帧。 */
function cloneTranslationLayer(model: Model): Model {
  if (model.Type === "Static" && Array.isArray(model.Lines)) {
    return { ...model, Lines: model.Lines.map((line: any) => ({ ...line })) };
  }
  if ((model.Type === "Line" || model.Type === "Syllable") && Array.isArray(model.Content)) {
    return { ...model, Content: model.Content.map((group: any) => ({ ...group })) };
  }
  return { ...model };
}

function applyTranslationValues(model: Model, values: string[]): Model {
  const entries = extractEntries(model);
  const changed = entries.some(
    (entry, index) => translationText(entry.item) !== (values[index] ?? "")
  );
  if (!changed) return model;

  const result = cloneTranslationLayer(model);
  extractEntries(result).forEach((entry, index) => {
    const value = values[index]?.trim();
    if (value) entry.item.Translation = value;
    else delete entry.item.Translation;
  });
  return result;
}

function visibilityKey(uri: string, target = getTargetLang()): string {
  return `${uri}|${target}`;
}

function sourceKey(uri: string, target: string, entries: TranslationEntry[]): string {
  return `${uri}|${target}|${fingerprintSource(entries.map((entry) => entry.text))}`;
}

function stateForCount(count: number, total: number): TranslationState {
  if (count <= 0 || total <= 0) return "none";
  return count >= total ? "complete" : "partial";
}

function updateState(state: TranslationState): void {
  if ($translationState.get() !== state) $translationState.set(state);
}

function currentModel(): Model | null {
  if (activeUri === SpotifyPlayer.GetUri() && lastModel) return lastModel;
  const raw = $currentLyricsData.get();
  if (raw?.startsWith("NO_LYRICS:")) return null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && typeof parsed.Type === "string") return parsed;
    } catch {
      // 最后一次已应用模型仍可作为瞬时兜底。
    }
  }
  return activeUri === SpotifyPlayer.GetUri() ? lastModel : null;
}

function publishModel(uri: string, model: Model, render: boolean): void {
  activeUri = uri;
  lastModel = model;
  if (render && SpotifyPlayer.GetUri() === uri && $lyricsContainerExists.get()) {
    void ApplyLyrics([model, 200]);
  }
}

/**
 * 首次 DOM 创建前调用。只做同步缓存读取和模型拼装，绝不会请求翻译 API。
 * 返回值只在需要增删 Translation 时做浅层复制，不污染原始歌词缓存模型。
 */
export function prepareLyricsForDisplay(uri: string, model: Model): Model {
  if (!uri || !model?.Type) return model;

  if (activeUri && activeUri !== uri) {
    currentAbort?.abort();
    requestGeneration++;
    activeSourceKey = "";
    ownedIndexes = new Set();
  }
  activeUri = uri;

  const entries = extractEntries(model);
  if (entries.length === 0) {
    activeSourceKey = "";
    ownedIndexes = new Set();
    lastModel = model;
    if (!inFlight || inFlightKey !== visibilityKey(uri)) updateState("none");
    return model;
  }

  const target = getTargetLang();
  const nextSourceKey = sourceKey(uri, target, entries);
  const sameSource = nextSourceKey === activeSourceKey;
  const inheritedOwned = sameSource ? ownedIndexes : new Set<number>();
  // 后端自带译文永远优先自动显示；目标语言只约束用户主动发起的翻译。
  const values = entries.map((entry) => translationText(entry.item));
  const valueOwned = entries.map(
    (entry, index) => Boolean(values[index]) && inheritedOwned.has(entry.arrayIndex)
  );
  const hasNativeTranslation = values.some((value, index) => Boolean(value) && !valueOwned[index]);

  if (values.some((value) => !value)) {
    const fingerprint = fingerprintSource(entries.map((entry) => entry.text));
    const trackCache = getReusableTrackCache(uri, target, fingerprint, entries.length);
    entries.forEach((entry, index) => {
      if (values[index]) return;
      const cached = trackCache?.lines[index]?.trim();
      if (!cached || cached === entry.text) return;
      values[index] = cached;
      valueOwned[index] = true;
    });
  }

  if (values.some((value) => !value)) {
    // 整首缓存未命中的部分再查一次行级快照，整个过程只 JSON.parse 一次。
    const lineCache = getCacheSnapshot();
    entries.forEach((entry, index) => {
      if (values[index]) return;
      const cached = getCachedFromSnapshot(lineCache, entry.text, target);
      if (!cached || cached === entry.text) return;
      values[index] = cached;
      valueOwned[index] = true;
    });
  }

  const availableCount = values.filter(Boolean).length;
  const result = applyTranslationValues(model, values);
  activeSourceKey = nextSourceKey;
  ownedIndexes = new Set(
    entries
      .filter((_, index) => Boolean(values[index]) && valueOwned[index])
      .map((entry) => entry.arrayIndex)
  );
  lastModel = result;

  if (!inFlight || inFlightKey !== visibilityKey(uri, target)) {
    // LYRIVA 的译文会有意省略制作人员等非歌词行；只要后端带有有效译文，
    // 就直接视为“已有翻译”，不要求用户再点击按钮补全这些署名信息。
    updateState(hasNativeTranslation ? "complete" : stateForCount(availableCount, entries.length));
  }
  return result;
}

/** ApplyLyrics 完成后的轻量发布钩子；不会联网，也不会二次重绘。 */
export function afterLyricsApply(uri: string, model: Model): void {
  if (!uri || !model?.Type) return;
  publishModel(uri, model, false);
}

export function resetTranslationForTrack(uri: string): void {
  currentAbort?.abort();
  requestGeneration++;
  activeUri = uri || null;
  activeSourceKey = "";
  ownedIndexes = new Set();
  lastModel = null;
  updateState("none");
}

function notify(message: string, isError = false): void {
  try {
    Spicetify.showNotification(message, isError);
  } catch {
    // Spotify 页面卸载期间通知 API 可能不可用。
  }
}

function mergeMetrics(
  current: TranslateMetrics | undefined,
  next: TranslateMetrics
): TranslateMetrics {
  if (!current) return { ...next };
  return {
    apiCalls: current.apiCalls + next.apiCalls,
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    totalTokens: current.totalTokens + next.totalTokens,
    failedChunks: current.failedChunks + next.failedChunks,
  };
}

function providerMetadata(): { api: string; model?: string } {
  const provider = $translationProvider.get();
  if (provider === "google") return { api: "google" };
  if (provider === "openai") {
    return { api: "openai", model: $openaiModel.get() || "gpt-4o-mini" };
  }
  if (provider === "custom") {
    return { api: "custom", model: $customApiModel.get() || undefined };
  }
  return { api: "deepseek", model: $deepSeekModel.get() || "deepseek-chat" };
}

function saveTrackCache(
  uri: string,
  model: Model,
  entries: TranslationEntry[],
  metrics: TranslateMetrics | undefined,
  startedAt: number
): void {
  const values = entries.map((entry) => translationText(entry.item));
  if (values.every((value) => !value)) return;
  try {
    const artists = SpotifyPlayer.GetArtists?.() ?? [];
    const metadata = providerMetadata();
    setTrackCache(
      uri,
      getTargetLang(),
      typeof model.LanguageISO2 === "string" ? model.LanguageISO2 : "auto",
      values,
      entries.map((entry) => entry.text),
      fingerprintSource(entries.map((entry) => entry.text)),
      SpotifyPlayer.GetName?.() ?? undefined,
      Array.isArray(artists)
        ? artists
            .map((artist: any) => artist?.name)
            .filter(Boolean)
            .join(", ")
        : undefined,
      metadata.api,
      metrics
        ? {
            model: metadata.model,
            durationMs: Date.now() - startedAt,
            ...metrics,
          }
        : undefined
    );
  } catch (error) {
    translateLogger.warn("写入曲目缓存失败", error);
  }
}

async function translateMissingLines(uri: string, initialModel: Model): Promise<void> {
  if (inFlight) return;

  let model = prepareLyricsForDisplay(uri, initialModel);
  let entries = extractEntries(model);
  const currentState = $translationState.get();
  if (currentState === "complete" || entries.length === 0) {
    publishModel(uri, model, true);
    return;
  }

  const target = getTargetLang();
  if (isSameLanguage(model.LanguageISO2, target) || isSameLanguage(model.Language, target)) {
    notify("原歌词已经是目标语言");
    return;
  }
  if (!model.Language && !model.LanguageISO2 && model._spicyLyricsProcessed !== true) {
    notify("歌词正在准备，请稍后再试");
    return;
  }

  const missing = entries
    .map((entry, localIndex) => ({ entry, localIndex }))
    .filter(({ entry }) => !translationText(entry.item));
  if (missing.length === 0) {
    updateState("complete");
    return;
  }
  if (!hasTranslationProviderConfig()) {
    updateState(missing.length < entries.length ? "partial" : "error");
    notify("歌词翻译：请先在设置中配置当前翻译服务", true);
    return;
  }

  inFlight = true;
  inFlightKey = visibilityKey(uri, target);
  updateState("translating");
  const controller = new AbortController();
  currentAbort = controller;
  const generation = ++requestGeneration;
  const startedAt = Date.now();
  let metrics: TranslateMetrics | undefined;
  const resolved = new Map<number, string>();

  const translateBatch = async (
    items: Array<{ entry: TranslationEntry; localIndex: number }>
  ): Promise<void> => {
    if (items.length === 0) return;
    const result = await translateLines(
      items.map(({ entry }) => entry.text),
      target,
      controller.signal
    );
    if (controller.signal.aborted || generation !== requestGeneration) return;
    metrics = mergeMetrics(metrics, result.metrics);
    const cacheEntries: Array<{ sourceLine: string; targetLang: string; translated: string }> = [];
    result.lines.forEach((translated, index) => {
      const item = items[index];
      const value = translated?.trim();
      if (!item || !value || value === item.entry.text) return;
      resolved.set(item.localIndex, value);
      cacheEntries.push({ sourceLine: item.entry.text, targetLang: target, translated: value });
    });
    setCachedTranslations(cacheEntries);
  };

  try {
    await translateBatch(missing);
    if (controller.signal.aborted || generation !== requestGeneration) return;

    const stillMissing = missing.filter(({ localIndex }) => !resolved.has(localIndex));
    if (metrics?.failedChunks && stillMissing.length > 0) {
      translateLogger.warn(`首次翻译有失败，重试 ${stillMissing.length} 行`);
      await translateBatch(stillMissing);
    }
    if (
      controller.signal.aborted ||
      generation !== requestGeneration ||
      SpotifyPlayer.GetUri() !== uri
    ) {
      return;
    }

    const values = entries.map((entry) => translationText(entry.item));
    resolved.forEach((value, localIndex) => {
      values[localIndex] = value;
      ownedIndexes.add(entries[localIndex].arrayIndex);
    });
    model = applyTranslationValues(model, values);
    entries = extractEntries(model);
    activeSourceKey = sourceKey(uri, target, entries);
    publishModel(uri, model, true);

    const translatedCount = entries.filter((entry) => Boolean(translationText(entry.item))).length;
    if (resolved.size > 0) saveTrackCache(uri, model, entries, metrics, startedAt);
    if (translatedCount === entries.length) {
      updateState("complete");
    } else if (translatedCount > 0) {
      updateState("partial");
    } else {
      updateState("error");
      notify("歌词翻译失败，请稍后重试", true);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      translateLogger.error("歌词翻译失败", error);
      const translatedCount = extractEntries(model).filter((entry) =>
        translationText(entry.item)
      ).length;
      updateState(translatedCount > 0 ? "partial" : "error");
      notify("歌词翻译失败，请稍后重试", true);
    }
  } finally {
    inFlight = false;
    inFlightKey = "";
    if (currentAbort === controller) currentAbort = null;
  }
}

async function handleTranslationToggle(): Promise<void> {
  const uri = SpotifyPlayer.GetUri();
  const model = currentModel();
  if (!uri || !model || inFlight) return;

  if ($translationState.get() === "complete") return;
  await translateMissingLines(uri, model);
}

registerTranslationToggleHandler(handleTranslationToggle);

Global.Event.listen("lyrics:analyzed", ({ uri, lyrics }: { uri: string; lyrics: Model }) => {
  if (!uri || SpotifyPlayer.GetUri() !== uri) return;
  // 初次渲染已经挂载过缓存；这里更新后台语言分析后的模型，不联网、不强制重绘。
  const prepared = prepareLyricsForDisplay(uri, lyrics);
  publishModel(uri, prepared, false);
});

function withoutOwnedTranslations(model: Model): Model {
  const entries = extractEntries(model);
  const values = entries.map((entry) => translationText(entry.item));
  entries.forEach((entry, index) => {
    if (ownedIndexes.has(entry.arrayIndex)) values[index] = "";
  });
  return applyTranslationValues(model, values);
}

/** 缓存查看器编辑后，重新同步挂载当前歌曲缓存。 */
export function refreshCurrentTranslation(): void {
  const uri = SpotifyPlayer.GetUri();
  const model = currentModel();
  if (!uri || !model) return;
  const base = withoutOwnedTranslations(model);
  activeSourceKey = "";
  ownedIndexes = new Set();
  const prepared = prepareLyricsForDisplay(uri, base);
  publishModel(uri, prepared, true);
}

// 目标语言变化只撤掉我们挂载的旧目标译文，并同步查找新目标缓存。
$translationTargetLang.listen((value) => {
  const nextTarget = value || "zh-CN";
  if (nextTarget === observedTargetLang) return;
  observedTargetLang = nextTarget;
  currentAbort?.abort();
  requestGeneration++;

  const uri = SpotifyPlayer.GetUri();
  const model = currentModel();
  if (!uri || !model) return;
  const base = withoutOwnedTranslations(model);
  activeSourceKey = "";
  ownedIndexes = new Set();
  const prepared = prepareLyricsForDisplay(uri, base);
  publishModel(uri, prepared, true);
});

export default { afterLyricsApply, prepareLyricsForDisplay, resetTranslationForTrack };
