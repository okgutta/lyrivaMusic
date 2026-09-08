/**
 * 曲目级翻译缓存（localStorage）。
 * key = `SL:translationTrack:{翻译服务}:{归一化uri}:{目标语言}`，14 天有效，最多 100 首。
 *
 * 核心价值：
 *  - 同一首歌再次播放时整首直接命中（含源指纹校验：同一首歌、同一版歌词才复用），零请求；
 *  - 支持逐行编辑后落盘（设置里的缓存查看器），下次播放立即生效；
 *  - Quota 超限时先删最旧 10 条再重试，而不是清空。
 */
import { getKVStorage, type KVStorage } from "./cache.ts";
import { $translationProvider } from "../../stores.ts";

const CACHE_KEY_PREFIX = "SL:translationTrack:";
const CACHE_INDEX_KEY = "SL:translationTrackIndex";
const CACHE_SCHEMA_KEY = "SL:translationTrackSchema";
const CACHE_SCHEMA_VERSION = 1;
const CACHE_MAX_TRACKS = 100;
const CACHE_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

export interface TrackCacheMetrics {
  model?: string;
  durationMs?: number;
  apiCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface TrackCacheEntry {
  lang: string; // 源语言（LanguageISO2 或 auto）
  targetLang: string;
  lines: string[]; // 与 entries 对齐的译文（未译为 ""）
  sourceLines: string[]; // 与 entries 对齐的源歌词行
  sourceFingerprint: string; // 源歌词指纹（FNV-1a）
  timestamp: number;
  trackName?: string;
  artistName?: string;
  api?: string; // 使用的翻译服务（deepseek）
  metrics?: TrackCacheMetrics;
  edited?: boolean; // 用户手动改过译文
}

export interface CachedTrackSummary {
  trackUri: string;
  targetLang: string;
  lang: string;
  lineCount: number;
  timestamp: number;
  trackName?: string;
  artistName?: string;
  api?: string;
  metrics?: TrackCacheMetrics;
}

interface CacheIndex {
  trackUris: string[];
}

let schemaMigrationRun = false;

function safeRemove(storage: KVStorage, key: string): void {
  if (typeof storage.removeItem === "function") {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function runSchemaMigration(): void {
  if (schemaMigrationRun) return;
  const storage = getKVStorage();
  if (!storage) return;
  try {
    const stored = storage.getItem(CACHE_SCHEMA_KEY);
    const storedVersion = stored ? parseInt(stored, 10) : 0;
    if (storedVersion >= CACHE_SCHEMA_VERSION) return;
    // 先收集再删除：遍历中删除会让 storage 索引移动、跳过部分 key
    const keysToRemove: string[] = [];
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const key = typeof storage.key === "function" ? storage.key(i) : null;
      if (key && key.startsWith(CACHE_KEY_PREFIX)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) safeRemove(storage, key);
    safeRemove(storage, CACHE_INDEX_KEY);
    storage.setItem(CACHE_SCHEMA_KEY, String(CACHE_SCHEMA_VERSION));
  } catch {
    /* ignore */
  } finally {
    schemaMigrationRun = true;
  }
}

export function normalizeTrackUri(uri: string): string {
  return uri.replace(/[^a-zA-Z0-9:]/g, "_");
}

/** 已知翻译服务（用于缓存 key 的服务维度与解析） */
const KNOWN_PROVIDERS = new Set(["google", "deepseek", "openai", "custom"]);

/** 当前翻译服务的 id（google / deepseek / openai / custom） */
function currentProviderId(): string {
  return $translationProvider.get();
}

function getCacheKey(uri: string, targetLang: string): string {
  // key 含服务维度：切换翻译服务后同一首歌会用新服务重新翻译（各服务译文独立缓存）
  return `${CACHE_KEY_PREFIX}${currentProviderId()}:${normalizeTrackUri(uri)}:${targetLang}`;
}

export function parseCacheKey(cacheKey: string): {
  provider: string;
  trackUri: string;
  targetLang: string;
} | null {
  if (!cacheKey.startsWith(CACHE_KEY_PREFIX)) return null;
  const rest = cacheKey.slice(CACHE_KEY_PREFIX.length);
  const firstColonIdx = rest.indexOf(":");
  if (firstColonIdx <= 0) return null;
  // 新格式：provider:uri:lang；旧格式（无服务维度）：uri:lang → 标记为 legacy
  const maybeProvider = rest.slice(0, firstColonIdx);
  const hasProvider = KNOWN_PROVIDERS.has(maybeProvider);
  const provider = hasProvider ? maybeProvider : "(legacy)";
  const body = hasProvider ? rest.slice(firstColonIdx + 1) : rest;
  const lastColonIdx = body.lastIndexOf(":");
  if (lastColonIdx <= 0 || lastColonIdx === body.length - 1) return null;
  return {
    provider,
    trackUri: body.slice(0, lastColonIdx),
    targetLang: body.slice(lastColonIdx + 1),
  };
}

function getIndex(): CacheIndex {
  const storage = getKVStorage();
  if (!storage) return { trackUris: [] };
  try {
    const raw = storage.getItem(CACHE_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trackUris)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { trackUris: [] };
}

function saveIndex(index: CacheIndex): void {
  const storage = getKVStorage();
  if (!storage) return;
  try {
    storage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {
    /* ignore */
  }
}

function parseEntry(raw: string | null): TrackCacheEntry | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.timestamp !== "number" || !Array.isArray(entry.lines)) return null;
    return entry as TrackCacheEntry;
  } catch {
    return null;
  }
}

function collectNativeKeys(storage: KVStorage): string[] {
  const keys: string[] = [];
  try {
    if (!storage) return keys;
    // Spicetify.LocalStorage 是自定义封装，可能没有 length/key —— 扫不到就返回空
    for (let i = 0; i < (storage as any).length; i++) {
      const key = (storage as any).key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) keys.push(key);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

/** 全部缓存 key：索引（写入时维护，权威）+ 原生扫描（兜底旧数据），去重 */
function collectAllCacheKeys(storage: KVStorage): string[] {
  const seen = new Set<string>();
  for (const cacheKey of getIndex().trackUris) {
    if (cacheKey.startsWith(CACHE_KEY_PREFIX)) seen.add(cacheKey);
  }
  for (const cacheKey of collectNativeKeys(storage)) seen.add(cacheKey);
  return [...seen];
}

function pruneTrackCache(maxTracks = CACHE_MAX_TRACKS): void {
  const storage = getKVStorage();
  if (!storage) return;

  const now = Date.now();
  const seen = new Set<string>();
  const entries: Array<{ cacheKey: string; timestamp: number }> = [];

  const consider = (cacheKey: string): void => {
    if (seen.has(cacheKey)) return;
    seen.add(cacheKey);
    const entry = parseEntry(storage.getItem(cacheKey));
    if (!entry || now - entry.timestamp > CACHE_EXPIRY_MS) {
      storage.removeItem?.(cacheKey);
      return;
    }
    entries.push({ cacheKey, timestamp: entry.timestamp });
  };

  collectAllCacheKeys(storage).forEach((cacheKey) => consider(cacheKey));

  entries.sort((a, b) => a.timestamp - b.timestamp);
  const removeCount = Math.max(0, entries.length - maxTracks);
  entries.slice(0, removeCount).forEach((entry) => safeRemove(storage, entry.cacheKey));

  saveIndex({ trackUris: entries.slice(removeCount).map((entry) => entry.cacheKey) });
}

function pruneOldest(count: number): void {
  const storage = getKVStorage();
  if (!storage) return;
  const index = getIndex();
  index.trackUris.slice(0, count).forEach((cacheKey) => safeRemove(storage, cacheKey));
  saveIndex({ trackUris: index.trackUris.slice(count) });
}

export function getTrackCache(uri: string, targetLang: string): TrackCacheEntry | null {
  runSchemaMigration();
  const storage = getKVStorage();
  if (!storage || !uri) return null;
  const cacheKey = getCacheKey(uri, targetLang);
  const entry = parseEntry(storage.getItem(cacheKey));
  if (!entry) {
    pruneTrackCache();
    return null;
  }
  if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
    safeRemove(storage, cacheKey);
    pruneTrackCache();
    return null;
  }
  return entry;
}

/**
 * 查找可复用的整首缓存。读取不受当前服务限制：同一首歌、目标语言和
 * 歌词指纹一致时，优先使用所有服务中最新的一份，避免切换服务后译文消失。
 */
export function getReusableTrackCache(
  uri: string,
  targetLang: string,
  sourceFingerprint: string,
  lineCount: number
): TrackCacheEntry | null {
  runSchemaMigration();
  const storage = getKVStorage();
  if (!storage || !uri) return null;

  const normalizedUri = normalizeTrackUri(uri);
  let newest: TrackCacheEntry | null = null;
  for (const cacheKey of collectAllCacheKeys(storage)) {
    const parsed = parseCacheKey(cacheKey);
    if (!parsed || parsed.trackUri !== normalizedUri || parsed.targetLang !== targetLang) {
      continue;
    }
    const entry = parseEntry(storage.getItem(cacheKey));
    if (entry && Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
      safeRemove(storage, cacheKey);
      continue;
    }
    if (
      !entry ||
      entry.sourceFingerprint !== sourceFingerprint ||
      entry.lines.length !== lineCount
    ) {
      continue;
    }
    if (!newest || entry.timestamp > newest.timestamp) newest = entry;
  }
  return newest;
}

export function setTrackCache(
  uri: string,
  targetLang: string,
  lang: string,
  lines: string[],
  sourceLines: string[],
  sourceFingerprint: string,
  trackName?: string,
  artistName?: string,
  api?: string,
  metrics?: TrackCacheMetrics
): void {
  runSchemaMigration();
  const storage = getKVStorage();
  if (!storage || !uri || lines.length === 0) return;

  const cacheKey = getCacheKey(uri, targetLang);
  const entry: TrackCacheEntry = {
    lang,
    targetLang,
    lines,
    sourceLines,
    sourceFingerprint,
    timestamp: Date.now(),
    trackName,
    artistName,
    api,
    metrics:
      metrics && (metrics.durationMs || metrics.apiCalls || metrics.totalTokens || metrics.model)
        ? metrics
        : undefined,
  };

  const write = (): void => {
    storage.setItem(cacheKey, JSON.stringify(entry));
    const index = getIndex();
    index.trackUris = index.trackUris.filter((k) => k !== cacheKey);
    index.trackUris.push(cacheKey);
    saveIndex(index);
    pruneTrackCache();
  };

  try {
    write();
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      pruneOldest(10);
      try {
        write();
      } catch {
        /* give up */
      }
    }
  }
}

/** 用户编辑缓存译文后落盘 */
export function updateTrackCacheLines(uri: string, targetLang: string, lines: string[]): boolean {
  runSchemaMigration();
  const storage = getKVStorage();
  if (!storage || !uri || lines.length === 0) return false;
  const cacheKey = getCacheKey(uri, targetLang);
  const entry = parseEntry(storage.getItem(cacheKey));
  if (!entry) return false;
  entry.lines = lines;
  entry.timestamp = Date.now();
  entry.edited = true;
  try {
    storage.setItem(cacheKey, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

export function deleteTrackCache(uri: string, targetLang?: string): void {
  const storage = getKVStorage();
  if (!storage || !uri) return;
  const index = getIndex();
  if (targetLang) {
    // 仅删当前服务维度下的该语言条目
    const cacheKey = getCacheKey(uri, targetLang);
    safeRemove(storage, cacheKey);
    index.trackUris = index.trackUris.filter((k) => k !== cacheKey);
  } else {
    // 跨服务删除该歌曲的所有条目（各服务维度都要清）
    const matches = collectAllCacheKeys(storage)
      .map((k) => ({ k, parsed: parseCacheKey(k) }))
      .filter(({ parsed }) => parsed?.trackUri === uri);
    matches.forEach(({ k }) => safeRemove(storage, k));
    const matchedKeys = new Set(matches.map(({ k }) => k));
    index.trackUris = index.trackUris.filter((k) => !matchedKeys.has(k));
  }
  saveIndex(index);
}

export function clearAllTrackCache(): void {
  const storage = getKVStorage();
  if (!storage) return;
  collectAllCacheKeys(storage).forEach((k) => safeRemove(storage, k));
  safeRemove(storage, CACHE_INDEX_KEY);
  // 兜底：无论物理删除是否成功，索引先清空——保证 UI 上"已清空"与后续
  // collectAllCacheKeys 不再返回这些条目（旧封装 removeItem 缺失时也能生效）
  saveIndex({ trackUris: [] });
}

export function getTrackCacheStats(): {
  trackCount: number;
  totalLines: number;
  sizeBytes: number;
  oldestTimestamp: number | null;
} {
  const storage = getKVStorage();
  if (!storage) return { trackCount: 0, totalLines: 0, sizeBytes: 0, oldestTimestamp: null };
  pruneTrackCache();

  let trackCount = 0;
  let totalLines = 0;
  let sizeBytes = 0;
  let oldestTimestamp: number | null = null;

  for (const cacheKey of collectAllCacheKeys(storage)) {
    const raw = storage.getItem(cacheKey);
    if (!raw) continue;
    const entry = parseEntry(raw);
    trackCount++;
    sizeBytes += cacheKey.length * 2 + raw.length * 2;
    if (entry) {
      totalLines += entry.lines.length;
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp)
        oldestTimestamp = entry.timestamp;
    }
  }
  return { trackCount, totalLines, sizeBytes, oldestTimestamp };
}

export function getAllCachedTracks(): CachedTrackSummary[] {
  const storage = getKVStorage();
  if (!storage) return [];
  pruneTrackCache();

  const tracks: CachedTrackSummary[] = [];
  for (const cacheKey of collectAllCacheKeys(storage)) {
    const entry = parseEntry(storage.getItem(cacheKey));
    const parsed = parseCacheKey(cacheKey);
    if (!entry || !parsed) continue;
    tracks.push({
      trackUri: parsed.trackUri,
      targetLang: entry.targetLang || parsed.targetLang,
      lang: entry.lang || "auto",
      lineCount: entry.lines.length,
      timestamp: entry.timestamp,
      trackName: entry.trackName,
      artistName: entry.artistName,
      api: entry.api,
      metrics: entry.metrics,
    });
  }
  return tracks.sort((a, b) => b.timestamp - a.timestamp);
}

/** 整首源歌词指纹（FNV-1a），用于判断"同一首歌同一版歌词" */
export function fingerprintSource(lines: string[]): string {
  let hash = 2166136261;
  for (const rawLine of lines) {
    const line = (rawLine || "").replace(/\s+/g, " ").trim().toLowerCase();
    const value = `${line}\u241E`;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
  }
  return `${lines.length}:${(hash >>> 0).toString(36)}`;
}
