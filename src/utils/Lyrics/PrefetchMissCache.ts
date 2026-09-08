const DEFAULT_TTL_MS = 2 * 60_000;
const DEFAULT_MAX_ENTRIES = 32;

/**
 * Short-lived record of authoritative LYRIVA misses discovered by prefetching.
 * It prevents the current-track pipeline from immediately repeating the same
 * request while still allowing the normal Genius fallback to run.
 */
export class PrefetchMissCache {
  private readonly misses = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    ttlMs = DEFAULT_TTL_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
    now: () => number = Date.now
  ) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
  }

  remember(uri: string): void {
    if (!uri) return;
    this.prune();
    this.misses.delete(uri);
    this.misses.set(uri, this.now() + this.ttlMs);
    while (this.misses.size > this.maxEntries) {
      const oldest = this.misses.keys().next().value;
      if (typeof oldest !== "string") break;
      this.misses.delete(oldest);
    }
  }

  has(uri: string): boolean {
    const expiresAt = this.misses.get(uri);
    if (expiresAt === undefined) return false;
    if (expiresAt <= this.now()) {
      this.misses.delete(uri);
      return false;
    }
    return true;
  }

  clear(uri: string): void {
    this.misses.delete(uri);
  }

  private prune(): void {
    const now = this.now();
    for (const [uri, expiresAt] of this.misses) {
      if (expiresAt <= now) this.misses.delete(uri);
    }
  }
}
