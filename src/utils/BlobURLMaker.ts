const BlobURLCache = new Map<string, { blobUrl: string; expiresAt: number }>();
// 并发去重：同一 url 的多个调用共享一次 fetch，避免互相 revoke 对方刚返回的 URL
const inflightFetches = new Map<string, Promise<string | null>>();
const CACHE_TTL_MS = 1000 * 60 * 60;
// 撤销被替换的旧 URL 前的缓冲期：调用方可能刚把它交给 <img>/background-image，
// 立即 revoke 会让在途加载失败留白
const REVOCATION_GRACE_MS = 5 * 60 * 1000;
// 容量上限：连续播放大量不同歌曲时旧条目不再长期占用（超过上限淘汰最旧）
const CACHE_MAX_ENTRIES = 50;

function evictIfNeeded(): void {
  while (BlobURLCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = BlobURLCache.keys().next().value;
    if (oldestKey === undefined) break;
    const old = BlobURLCache.get(oldestKey);
    BlobURLCache.delete(oldestKey);
    if (old) URL.revokeObjectURL(old.blobUrl);
  }
}

export default async function BlobURLMaker(url: string): Promise<string | null> {
  if (!url) throw new Error("SpicyLyrics: BlobURLMaker: url Missing");
  const existingBlobURL = BlobURLCache.get(url);
  if (existingBlobURL) {
    if (existingBlobURL.expiresAt >= Date.now()) {
      return existingBlobURL.blobUrl;
    }
    // 过期：释放旧 URL（否则每小时周期泄漏一个 blob），重新拉取
    BlobURLCache.delete(url);
    URL.revokeObjectURL(existingBlobURL.blobUrl);
  }

  const inflight = inflightFetches.get(url);
  if (inflight) return inflight;

  const promise = (async (): Promise<string | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const prev = BlobURLCache.get(url);
      BlobURLCache.set(url, {
        blobUrl,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      evictIfNeeded(); // 超容量淘汰最旧，防长会话持续增长
      // 延迟撤销被替换的旧 URL，给已拿到旧 URL 的消费者留出加载窗口
      if (prev && prev.blobUrl !== blobUrl) {
        setTimeout(() => URL.revokeObjectURL(prev.blobUrl), REVOCATION_GRACE_MS);
      }
      return blobUrl;
    } catch (error) {
      console.error("Error fetching and converting to blob URL:", error);
      throw error;
    } finally {
      inflightFetches.delete(url);
    }
  })();

  inflightFetches.set(url, promise);
  return promise;
}
