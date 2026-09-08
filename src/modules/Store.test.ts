import { GetExpireStore } from "./Store.ts";

class MemoryCache {
  private readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(String(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(String(request), response.clone());
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(String(request));
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((key) => key as unknown as Request);
  }
}

const stores = new Map<string, MemoryCache>();
globalThis.caches = {
  async open(name: string) {
    let cache = stores.get(name);
    if (!cache) {
      cache = new MemoryCache();
      stores.set(name, cache);
    }
    return cache as unknown as Cache;
  },
  async delete(name: string) {
    return stores.delete(name);
  },
} as CacheStorage;

const storeName = `ExpireStoreTest-${Date.now()}`;
const store = GetExpireStore<{ value: number }>(storeName, 3, { Duration: 1, Unit: "Days" });

await store.SetItem("current", { value: 42 });
const cache = stores.get(storeName)!;
await cache.put(
  "/expired",
  new Response(
    JSON.stringify({ ExpiresAt: Date.now() - 1, CacheVersion: 3, Content: { value: 1 } })
  )
);
await cache.put("/invalid", new Response("not-json"));

const current = await store.GetItem("current");
if (current?.value !== 42) throw new Error("valid cache entry was not returned");

await new Promise((resolve) => setTimeout(resolve, 30));
if (await cache.match("/expired")) throw new Error("expired entries were not pruned");
if (await cache.match("/invalid")) throw new Error("invalid entries were not pruned");
if (!(await cache.match("/current"))) throw new Error("valid entries must survive pruning");

await store.Destroy();
console.log("Store tests passed");
