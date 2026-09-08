/**
 * 行级翻译缓存（localStorage）。
 * key = `${provider}|${targetLang}|${sourceLine}`（含服务维度：各翻译服务的译文独立缓存），7 天有效，最多 500 条。
 *
 * 命中/写入时做「坏译文失效」检查（借鉴 SLT 的思路，原创实现）：
 *  - marker 残留（`[[SPICY_TR_...]]` / `]]`+数字）：LLM 把标记漏进译文 → 删
 *  - 混合语言行"未翻译直译"：源行含拉丁+非拉丁，译文等于源的拉丁骨架 → 删
 *  - 直译且明显非目标语言（源非拉丁而目标是拉丁系）→ 删
 */

import { $translationProvider } from "../../stores.ts";

const CACHE_KEY = "SL:translationCache";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天
const CACHE_MAX = 500;

function lineKey(targetLang: string, sourceLine: string): string {
  // 服务维度前缀：切换翻译服务后同源行不会串用其他服务的译文
  return `${$translationProvider.get()}|${targetLang}|${sourceLine}`;
}

interface CacheEntry {
  t: string; // translated text
  ts: number; // timestamp
}

type TranslationCache = Record<string, CacheEntry>;

export interface KVStorage {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem?: (k: string) => void;
  readonly length?: number;
  key?: (i: number) => string | null;
}

export function getKVStorage(): KVStorage | null {
  try {
    const sp = (globalThis as any).Spicetify?.LocalStorage;
    if (sp?.get && sp?.set) {
      // 必须映射 removeItem：Spicetify.LocalStorage 的 API 是 get/set/remove，
      // 没有 removeItem —— 缺了这个映射，trackCache 的 TTL 清理/上限淘汰/
      // 配额回收/清空按钮会全部静默失效（safeRemove 恒为空操作）
      return {
        getItem: (k: string) => sp.get(k),
        setItem: (k: string, v: string) => sp.set(k, v),
        removeItem: (k: string) => sp.remove?.(k),
      };
    }
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function readCache(): TranslationCache {
  const storage = getKVStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as TranslationCache)
      : {};
  } catch {
    return {};
  }
}

function saveCache(cache: TranslationCache): void {
  const storage = getKVStorage();
  if (!storage) return;
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 配额超限：删最旧的一半再重试，而不是清空
    const keys = Object.keys(cache).sort((a, b) => (cache[a].ts ?? 0) - (cache[b].ts ?? 0));
    const removeCount = Math.min(keys.length, Math.max(50, Math.floor(keys.length / 2)));
    keys.slice(0, removeCount).forEach((k) => delete cache[k]);
    try {
      storage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* give up */
    }
  }
}

function pruneCache(cache: TranslationCache): boolean {
  const now = Date.now();
  let changed = false;
  for (const key of Object.keys(cache)) {
    const entry = cache[key];
    if (!entry || typeof entry.ts !== "number" || now - entry.ts > CACHE_TTL) {
      delete cache[key];
      changed = true;
    }
  }
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX) {
    keys
      .map((key) => ({ key, ts: cache[key].ts }))
      .sort((a, b) => a.ts - b.ts)
      .slice(0, keys.length - CACHE_MAX)
      .forEach((item) => {
        delete cache[item.key];
      });
    changed = true;
  }
  return changed;
}

// ─── 坏译文失效启发式 ─────────────────────────────────────────────────────────

const NON_LATIN_SCRIPT_RE =
  /[\u3040-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uAC00-\uD7AF\u0600-\u06FF\u0590-\u05FF\u0400-\u04FF\u0E00-\u0E7F\u0900-\u097F\u0370-\u03FF]/;

function sourceHasNonLatinScript(text: string): boolean {
  return NON_LATIN_SCRIPT_RE.test(text || "");
}

function targetIsLatinScript(targetLang: string): boolean {
  const base = targetLang.trim().toLowerCase().split(/[-_]/)[0];
  return !["ja", "zh", "ko", "ar", "he", "ru", "th", "hi", "el"].includes(base);
}

/** LLM 把批量标记 / 编号残留进译文的常见形态 */
function looksLikeMarkerDebris(text: string): boolean {
  if (/\[\[\s*SPICY_TR/i.test(text)) return true;
  if (/\]\]/.test(text) && /\b\d+\b/.test(text) && text.length < 60) return true;
  if (/^\s*[A-Za-z]{2,}_\d+\s*\]?\]?/.test(text)) return true;
  return false;
}

/** 源行混合拉丁+非拉丁，译文等于源的拉丁骨架 → 说明没真翻译 */
function isSuspiciousMixedLineTranslation(source: string, translated: string): boolean {
  if (!source || !translated) return false;
  if (!/[A-Za-z]/.test(source) || !sourceHasNonLatinScript(source)) return false;
  const latinSkeleton = source.toLowerCase().replace(/[^\p{Script=Latin}\p{N}]/gu, "");
  if (!latinSkeleton) return false;
  return translated.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") === latinSkeleton;
}

function shouldInvalidateIdentityTranslation(
  source: string,
  translated: string,
  targetLang: string
): boolean {
  if (source.trim() !== translated.trim()) return false;
  // 源与目标的文字体系不同但译文=原文 → 说明没译（中→英 / 英→中 都算；
  // 同体系保留，如英→德可能是专有名词无需翻译）
  const sourceIsLatin = !sourceHasNonLatinScript(source);
  const targetLatin = targetIsLatinScript(targetLang);
  return sourceIsLatin !== targetLatin;
}

function isBadTranslation(source: string, translated: string, targetLang: string): boolean {
  if (looksLikeMarkerDebris(translated)) return true;
  if (isSuspiciousMixedLineTranslation(source, translated)) return true;
  if (shouldInvalidateIdentityTranslation(source, translated, targetLang)) return true;
  return false;
}

// ─── 读写 ─────────────────────────────────────────────────────────────────────

export function setCachedTranslation(
  sourceLine: string,
  targetLang: string,
  translated: string
): void {
  setCachedTranslations([{ sourceLine, targetLang, translated }]);
}

export function setCachedTranslations(
  entries: Array<{ sourceLine: string; targetLang: string; translated: string }>
): void {
  const validEntries = entries.filter(
    (entry) =>
      entry.sourceLine &&
      entry.translated &&
      !isBadTranslation(entry.sourceLine, entry.translated, entry.targetLang)
  );
  if (validEntries.length === 0) return;
  const cache = readCache();
  const timestamp = Date.now();
  for (const entry of validEntries) {
    cache[lineKey(entry.targetLang, entry.sourceLine)] = {
      t: entry.translated.trim(),
      ts: timestamp,
    };
  }
  pruneCache(cache);
  saveCache(cache);
}

export function clearTranslationCache(): void {
  const storage = getKVStorage();
  if (!storage) return;
  try {
    storage.setItem(CACHE_KEY, JSON.stringify({}));
  } catch {
    /* ignore */
  }
}

/** 删除单行译文缓存（用户在缓存查看器里清空某行时调用，防止旧行缓存继续命中） */
export function removeCachedTranslation(sourceLine: string, targetLang: string): void {
  if (!sourceLine) return;
  const storage = getKVStorage();
  if (!storage) return;
  try {
    const cache = readCache();
    const key = lineKey(targetLang, sourceLine);
    if (key in cache) {
      delete cache[key];
      saveCache(cache);
    }
  } catch {
    /* ignore */
  }
}

/** 一次读取整表缓存快照，供批量查找（避免逐行 JSON.parse 整表） */
export function getCacheSnapshot(): Record<string, { t: string; ts: number }> {
  return readCache();
}

/** 在快照上查找单行译文（含坏译文检查；无效条目只忽略不落盘删除） */
export function getCachedFromSnapshot(
  snapshot: Record<string, { t: string; ts: number }>,
  sourceLine: string,
  targetLang: string
): string | null {
  if (!sourceLine) return null;
  const entry = snapshot[lineKey(targetLang, sourceLine)];
  if (!entry || typeof entry.t !== "string" || !entry.t) return null;
  if (typeof entry.ts !== "number" || Date.now() - entry.ts > CACHE_TTL) return null;
  if (isBadTranslation(sourceLine, entry.t, targetLang)) return null;
  return entry.t;
}
