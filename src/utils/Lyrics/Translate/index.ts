/**
 * 歌词翻译编排（MVP）：
 *  - afterLyricsApply：在 ApplyLyrics 渲染完成后调用；若翻译开启且当前歌词还没翻译过，则后台翻译。
 *  - 翻译结果以 `Translation` 字段挂到歌词模型的行对象上（Static 的 Lines / Line 与 Syllable 的 Content），
 *    复用现有的 `.line-translation` 渲染通道（网易云 tlyric 同款）。
 *  - 行级缓存命中零请求；「歌词已是目标语言」整体跳过；目标为中文时保留 provider 自带的中文译文。
 *  - $translationEnabled / $translationTargetLang 变化时自动重译/撤销，无需额外接线。
 */
import Logger from "../../Logger.ts";
import {
  $currentLyricsData,
  $customApiBaseUrl,
  $customApiKey,
  $customApiModel,
  $deepSeekApiKey,
  $deepSeekModel,
  $lyricsContainerExists,
  $openaiApiKey,
  $openaiModel,
  $translationEnabled,
  $translationProvider,
  $translationTargetLang,
} from "../../stores.ts";
import { SpotifyPlayer } from "../../../components/Global/SpotifyPlayer.ts";
import ApplyLyrics from "../Global/Applyer.ts";
import fetchLyrics from "../fetchLyrics.ts";
import { getCacheSnapshot, getCachedFromSnapshot, setCachedTranslations } from "./cache.ts";
import { translateLines, hasTranslationProviderConfig, type TranslateMetrics } from "./providers.ts";
import { getTrackCache, setTrackCache, fingerprintSource } from "./trackCache.ts";
import { isSameLanguage } from "./detect.ts";

const translateLogger = new Logger("Lyrics Translation");

type Model = Record<string, any>;

// ─── 模块状态 ────────────────────────────────────────────────────────────────
let inFlight = false; // 正在翻译（防止并发重复请求）
let activeUri: string | null = null; // 上次处理的曲目
let appliedKey = ""; // uri|目标语言|歌词文本 指纹：已附加译文的标记
let translatedIndexes = new Set<number>(); // 我们附加过 Translation 的数组下标（用于撤销）
let targetGen = 0; // 目标语言变更代数（使在途翻译结果失效）
let retranslateAfterFlight = false; // 在途翻译期间改了目标语言 → 结束后重译
let pendingApply: { uri: string; model: Model } | null = null; // 在途翻译期间来了新歌词 → 结束后接续
let notifiedNoKey = false; // 未配置 API Key 的提示只弹一次（会话内）
let suppressApplyUri: string | null = null; // 不完整翻译后，本次重渲染不再自触发重试（防死循环）
let currentAbort: AbortController | null = null; // 在途翻译请求：切歌/目标语言变更时取消，省 API

// ─── 歌词模型读取 ────────────────────────────────────────────────────────────

function getTargetLang(): string {
  return $translationTargetLang.get() || "zh-CN";
}

/** Syllable 类型 Vocal 组没有 Text 时，按 Lead 音节拼出行文本（与 Applyer 渲染一致） */
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

interface TranslationEntry {
  item: any;
  text: string;
  arrayIndex: number;
}

/** 提取可翻译的行（跳过 Instrumental / 空行） */
function extractEntries(model: Model): TranslationEntry[] {
  const entries: TranslationEntry[] = [];
  if (model.Type === "Static" && Array.isArray(model.Lines)) {
    model.Lines.forEach((line: any, i: number) => {
      const text = String(line?.Text ?? "").trim();
      if (text) entries.push({ item: line, text, arrayIndex: i });
    });
  } else if (model.Type === "Line" && Array.isArray(model.Content)) {
    model.Content.forEach((group: any, i: number) => {
      if (group?.Type !== "Vocal") return;
      const text = String(group.Text ?? "").trim();
      if (text) entries.push({ item: group, text, arrayIndex: i });
    });
  } else if (model.Type === "Syllable" && Array.isArray(model.Content)) {
    model.Content.forEach((group: any, i: number) => {
      if (group?.Type !== "Vocal") return;
      const text = String(group.Text ?? joinSyllables(group.Lead)).trim();
      if (text) entries.push({ item: group, text, arrayIndex: i });
    });
  }
  return entries;
}

function buildKey(uri: string, model: Model): string {
  const target = getTargetLang();
  const texts = extractEntries(model)
    .map((e) => e.text)
    .join("\u241E");
  return `${uri}|${target}|${texts}`;
}

function currentModel(): Model | null {
  const raw = $currentLyricsData.get();
  if (!raw || raw.startsWith("NO_LYRICS:")) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && typeof parsed.Type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** 我们附加过的译文在当前模型里是否都还在（pristine 模型会返回 false → 触发重译） */
function modelStillHasTranslations(model: Model): boolean {
  if (translatedIndexes.size === 0) return true;
  const arr =
    model.Type === "Static"
      ? model.Lines
      : model.Type === "Line" || model.Type === "Syllable"
        ? model.Content
        : null;
  if (!Array.isArray(arr)) return false;
  for (const i of translatedIndexes) {
    const item = arr[i];
    if (!item || !item.Translation || !String(item.Translation).trim()) return false;
  }
  return true;
}

// ─── 附加 / 撤销 ─────────────────────────────────────────────────────────────

function stripFromModel(model: Model): void {
  if (model.Type === "Static" && Array.isArray(model.Lines)) {
    model.Lines.forEach((line: any, i: number) => {
      if (translatedIndexes.has(i)) delete line.Translation;
    });
  } else if ((model.Type === "Line" || model.Type === "Syllable") && Array.isArray(model.Content)) {
    model.Content.forEach((group: any, i: number) => {
      if (translatedIndexes.has(i)) delete group.Translation;
    });
  }
}

/** 重新渲染（仅当歌词容器在屏且仍是同一首歌）；模型已写入 $currentLyricsData */
function reapply(uri: string, model: Model): void {
  if (SpotifyPlayer.GetUri() !== uri) return;
  if (!$lyricsContainerExists.get()) return; // 页面没开：只落内存，下次打开即带译文
  void ApplyLyrics([model, 200]);
}

// ─── 翻译主流程 ──────────────────────────────────────────────────────────────

async function run(uri: string, model: Model): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  suppressApplyUri = null; // 清掉上一轮未消费的抑制标记（仅存在于一次 run→reapply 周期内）
  const controller = new AbortController();
  currentAbort = controller;
  try {
    const target = getTargetLang();
    const gen = targetGen;

    // 歌词已在目标语言 → 整体跳过（并记住，避免反复检查）
    if (isSameLanguage(model.LanguageISO2, target) || isSameLanguage(model.Language, target)) {
      appliedKey = buildKey(uri, model);
      activeUri = uri;
      translatedIndexes = new Set();
      return;
    }

    const entries = extractEntries(model);
    if (entries.length === 0) {
      appliedKey = buildKey(uri, model);
      activeUri = uri;
      return;
    }

    // 目标为中文时保留 provider 自带的中文译文（如网易云 tlyric）
    const targetIsZh = target.startsWith("zh");
    const entriesTexts = entries.map((e) => e.text);
    const fingerprint = fingerprintSource(entriesTexts);

    // ── 曲目级缓存快路径：同一首歌同一版歌词 → 整首直接命中，零请求 ──
    const trackCached = getTrackCache(uri, target);
    if (
      trackCached &&
      trackCached.sourceFingerprint === fingerprint &&
      trackCached.lines.length === entries.length
    ) {
      const newTranslatedIndexes = new Set<number>();
      entries.forEach((entry, localIdx) => {
        if (entry.item.Translation && targetIsZh) return; // 保留 provider 译文
        const cached = trackCached.lines[localIdx];
        if (cached && cached !== entry.text) {
          entry.item.Translation = cached;
          newTranslatedIndexes.add(entry.arrayIndex);
        }
      });
      appliedKey = buildKey(uri, model);
      activeUri = uri;
      translatedIndexes = newTranslatedIndexes;
      $currentLyricsData.set(JSON.stringify(model));
      reapply(uri, model);
      return;
    }

    const resolved = new Map<number, string>(); // localIdx -> translated
    const newTranslatedIndexes = new Set<number>();
    const toTranslate: Array<{ entry: TranslationEntry; localIdx: number }> = [];

    // 整表快照读一次，避免逐行 JSON.parse（行级缓存命中场景的性能优化）
    const cacheSnapshot = getCacheSnapshot();

    entries.forEach((entry, localIdx) => {
      if (entry.item.Translation && targetIsZh) return; // 保留 provider 译文
      const cached = getCachedFromSnapshot(cacheSnapshot, entry.text, target);
      if (cached) {
        resolved.set(localIdx, cached);
        newTranslatedIndexes.add(entry.arrayIndex);
      } else {
        toTranslate.push({ entry, localIdx });
      }
    });

    if (toTranslate.length > 0 && !hasTranslationProviderConfig()) {
      // 未配置 API Key：提示一次并标记本曲已处理（配好 Key 后由监听器触发重译）
      if (!notifiedNoKey) {
        notifiedNoKey = true;
        translateLogger.warn("当前翻译服务未配置完成，跳过翻译");
        try {
          Spicetify.showNotification("歌词翻译：请先在设置中配置当前翻译服务", true);
        } catch {
          /* ignore */
        }
      }
      appliedKey = buildKey(uri, model);
      activeUri = uri;
      return;
    }

    let translateMetrics: TranslateMetrics | undefined;
    let translateStartedAt = 0;

    const translateBatch = async (
      items: Array<{ entry: TranslationEntry; localIdx: number }>
    ): Promise<void> => {
      if (items.length === 0) return;
      const result = await translateLines(
        items.map((t) => t.entry.text),
        target,
        controller.signal
      );
      // 批量期间目标语言被改或请求被取消（切歌）→ 丢弃本次结果
      if (controller.signal.aborted || targetGen !== gen) return;
      if (translateMetrics) {
        translateMetrics.apiCalls += result.metrics.apiCalls;
        translateMetrics.inputTokens += result.metrics.inputTokens;
        translateMetrics.outputTokens += result.metrics.outputTokens;
        translateMetrics.totalTokens += result.metrics.totalTokens;
        translateMetrics.failedChunks += result.metrics.failedChunks;
      } else {
        translateMetrics = result.metrics;
      }
      const cacheEntries: Array<{ sourceLine: string; targetLang: string; translated: string }> = [];
      result.lines.forEach((translated, i) => {
        const { entry, localIdx } = items[i];
        if (translated && translated !== entry.text) {
          cacheEntries.push({ sourceLine: entry.text, targetLang: target, translated });
          resolved.set(localIdx, translated);
          newTranslatedIndexes.add(entry.arrayIndex);
        }
      });
      setCachedTranslations(cacheEntries);
    };

    if (toTranslate.length > 0) {
      translateStartedAt = Date.now();
      await translateBatch(toTranslate);
      if (controller.signal.aborted || targetGen !== gen) return;
      // 有 chunk 失败 → 对仍未译出的行再给一次机会（成功 chunk 的行已进 resolved，只重发失败的）
      if (translateMetrics && translateMetrics.failedChunks > 0) {
        const stillMissing = toTranslate.filter(({ localIdx }) => !resolved.has(localIdx));
        if (stillMissing.length > 0) {
          translateLogger.warn(
            `有 ${translateMetrics.failedChunks} 组首次失败，二次重试 ${stillMissing.length} 行`
          );
          try {
            await translateBatch(stillMissing);
          } catch (err) {
            translateLogger.warn("失败行二次重试也失败", err);
          }
        }
      }
    }

    // 所有批量完成后再次校验（防止被取消/目标语言变更后继续写入）
    if (controller.signal.aborted || targetGen !== gen) return;

    // 是否完整：没有任何 chunk 失败（模型返回原文的身份行不算失败，视为无需翻译）
    const complete = !translateMetrics || translateMetrics.failedChunks === 0;

    if (!$translationEnabled.get()) return; // 翻译期间被关闭
    if (SpotifyPlayer.GetUri() !== uri) return; // 切歌：丢弃本次结果（pendingApply 会接续新歌）

    resolved.forEach((translated, localIdx) => {
      const entry = entries[localIdx];
      if (translated && translated !== entry.text) entry.item.Translation = translated;
    });

    // ── 写入曲目级缓存（仅完整时：避免把失败行固化成空串导致永不重试）──
    if (complete && newTranslatedIndexes.size > 0) {
      try {
        const artists = SpotifyPlayer.GetArtists?.() ?? [];
        const providerId = $translationProvider.get();
        const providerApi =
          providerId === "google"
            ? "google"
            : providerId === "openai"
              ? "openai"
              : providerId === "custom"
                ? "custom"
                : "deepseek";
        const providerModel =
          providerId === "deepseek"
            ? $deepSeekModel.get() || "deepseek-chat"
            : providerId === "openai"
              ? $openaiModel.get() || "gpt-4o-mini"
              : providerId === "custom"
                ? $customApiModel.get() || undefined
                : undefined;
        setTrackCache(
          uri,
          target,
          typeof model.LanguageISO2 === "string" ? model.LanguageISO2 : "auto",
          entries.map((entry, localIdx) =>
            newTranslatedIndexes.has(entry.arrayIndex) && resolved.has(localIdx)
              ? String(entries[localIdx].item.Translation ?? "")
              : ""
          ),
          entriesTexts,
          fingerprint,
          SpotifyPlayer.GetName?.() ?? undefined,
          Array.isArray(artists)
            ? artists
                .map((a: any) => a?.name)
                .filter(Boolean)
                .join(", ")
            : undefined,
          providerApi,
          translateMetrics
            ? {
                model: providerModel,
                durationMs: Date.now() - translateStartedAt,
                ...translateMetrics,
              }
            : undefined
        );
      } catch (err) {
        translateLogger.warn("写入曲目缓存失败", err);
      }
    }

    const key = buildKey(uri, model);
    appliedKey = complete ? key : `${key}\u2424`; // 不完整 → 加标记，下次 apply 自动重试
    activeUri = uri;
    translatedIndexes = newTranslatedIndexes;
    $currentLyricsData.set(JSON.stringify(model));

    // 不完整时：本次重渲染不再自触发重试（否则 afterLyricsApply→run 死循环），下次 apply 再重试
    if (!complete && SpotifyPlayer.GetUri() === uri && $lyricsContainerExists.get()) {
      suppressApplyUri = uri;
    }
    reapply(uri, model);
  } catch (err) {
    translateLogger.error("歌词翻译失败", err);
  } finally {
    inFlight = false;
    if (pendingApply) {
      // 在途期间来了新歌词：优先接续最新的（其模型已含最新目标语言）
      const p = pendingApply;
      pendingApply = null;
      retranslateAfterFlight = false;
      if ($translationEnabled.get()) void run(p.uri, p.model);
    } else if (retranslateAfterFlight) {
      retranslateAfterFlight = false;
      const uri = SpotifyPlayer.GetUri();
      const model = currentModel();
      if (uri && model && $translationEnabled.get()) void run(uri, model);
    }
  }
}

// ─── 对外接口 ────────────────────────────────────────────────────────────────

/** ApplyLyrics 渲染完成后调用（Global/Applyer.ts 钩子） */
export function afterLyricsApply(uri: string, model: Model): void {
  if (!uri || !model?.Type) return;
  // 不完整翻译后的自我重渲染：消费抑制标记，避免死循环（下次 apply 会正常重试）
  if (suppressApplyUri === uri) {
    suppressApplyUri = null;
    return;
  }
  if (!$translationEnabled.get()) return;
  if (activeUri !== uri) {
    // 切歌：取消上一首在途的翻译请求（省 API），接续交给 pendingApply
    currentAbort?.abort();
    activeUri = uri;
    translatedIndexes = new Set();
    appliedKey = "";
  }
  // 指纹一致且译文还在 → 本次渲染已带译文（含我们自己的 reapply 回调），无需再译
  const key = buildKey(uri, model);
  if (appliedKey === key && modelStillHasTranslations(model)) return;
  if (inFlight) {
    // 上一首还在翻译：记住最新的，翻译完成后接续
    pendingApply = { uri, model };
    return;
  }
  void run(uri, model);
}

/** 缓存查看器编辑后：清空已应用状态，重新从缓存挂载当前歌曲译文（命中曲目缓存，即时生效） */
export function refreshCurrentTranslation(): void {
  const uri = SpotifyPlayer.GetUri();
  const model = currentModel();
  if (!$translationEnabled.get() || !uri || !model) return;
  appliedKey = "";
  translatedIndexes = new Set();
  if (inFlight) {
    retranslateAfterFlight = true;
  } else {
    void run(uri, model);
  }
}

// ─── 设置联动（开关 / 目标语言） ────────────────────────────────────────────

$translationEnabled.listen((enabled) => {
  const uri = SpotifyPlayer.GetUri();
  const model = currentModel();
  if (!uri || !model) return;
  if (!enabled) {
    // 关闭翻译：取消在途请求，并重取一遍原始（无译文）歌词重新渲染。
    // 关键：先清空 $currentLyricsData —— fetchLyricsInner 的内存缓存路径
    // 会命中这里存的「已带 Translation 的译文模型」并直接返回，导致译文
    // 关不掉。清空后走持久缓存（存的是翻译前的原版）或 Provider 重取原文。
    // 持久缓存/行级翻译缓存都不受影响，再开启时译文会从缓存直接恢复。
    currentAbort?.abort();
    activeUri = uri;
    translatedIndexes = new Set();
    appliedKey = "";
    $currentLyricsData.set("");
    void fetchLyrics(uri)
      .then(ApplyLyrics)
      .catch((error) =>
        translateLogger.error("Failed to refresh lyrics after disabling translation", error)
      );
  } else if (inFlight) {
    // 极速「关→开」：旧 run 还没结束（finally 未跑，pendingApply 未设置），
    // 标记结束后重译，否则要等下一次渲染事件才补译
    retranslateAfterFlight = true;
  } else {
    void run(uri, model);
  }
});

$translationTargetLang.listen(() => {
  targetGen++;
  currentAbort?.abort(); // 目标语言变更：取消在途请求
  const uri = SpotifyPlayer.GetUri();
  const model = currentModel();
  if (!uri || !model) return;
  stripFromModel(model); // 撤掉按旧目标语言附加的译文
  translatedIndexes = new Set();
  appliedKey = "";
  $currentLyricsData.set(JSON.stringify(model));
  if ($translationEnabled.get()) {
    if (inFlight) {
      retranslateAfterFlight = true; // 在途翻译结束后用新目标重译
    } else {
      void run(uri, model);
    }
  } else {
    reapply(uri, model);
  }
});

// Key/服务配置变化后自动重译当前歌曲（之前因缺配置跳过的）
const retranslateIfReady = () => {
  const uri = SpotifyPlayer.GetUri();
  const model = currentModel();
  if (!$translationEnabled.get() || !uri || !model || !hasTranslationProviderConfig()) return;
  notifiedNoKey = false;
  appliedKey = "";
  translatedIndexes = new Set();
  if (inFlight) {
    currentAbort?.abort();
    retranslateAfterFlight = true;
  } else {
    void run(uri, model);
  }
};

$deepSeekApiKey.listen(retranslateIfReady);
$openaiApiKey.listen(retranslateIfReady);
$customApiBaseUrl.listen(retranslateIfReady);
$customApiKey.listen(retranslateIfReady);
$customApiModel.listen(retranslateIfReady);
$translationProvider.listen(() => {
  notifiedNoKey = false;
  retranslateIfReady();
});

export default { afterLyricsApply };
