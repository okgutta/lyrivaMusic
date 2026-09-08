export type ExpirationSettings = {
  Duration: number;
  Unit: "Weeks" | "Months" | "Days" | "Hours" | "Minutes" | "Seconds";
};

export type ExpireStoreInterface<ItemType> = {
  GetItem: (itemName: string) => Promise<ItemType | undefined>;
  SetItem: (itemName: string, content: ItemType) => Promise<ItemType>;
  RemoveItem: (itemName: string) => Promise<void>;
  Destroy: () => Promise<void>;
};

type ExpireItem<C> = {
  ExpiresAt: number;
  CacheVersion: number;
  Content: C;
};

const expireStoreRegistry = new Set<string>();

const computeExpiresAt = (settings: ExpirationSettings): number => {
  const date = new Date();
  const { Duration, Unit } = settings;

  switch (Unit) {
    case "Seconds":
      return date.getTime() + Duration * 1_000;
    case "Minutes":
      return date.getTime() + Duration * 60_000;
    case "Hours":
      return date.getTime() + Duration * 3_600_000;
    case "Days":
      return date.getTime() + Duration * 86_400_000;
    case "Weeks":
      return date.getTime() + Duration * 7 * 86_400_000;
    case "Months":
      date.setMonth(date.getMonth() + Duration);
      return date.getTime();
  }
};

/**
 * Reads a Dynamic Store entry. The generic `I` is unchecked at runtime —
 * the value is always a raw string and is cast directly. Callers are
 * responsible for knowing the expected format.
 */
export function GetExpireStore<ItemType>(
  storeName: string,
  version: number,
  itemExpirationSettings: ExpirationSettings,
  forceNewData?: true
): Readonly<ExpireStoreInterface<ItemType>> {
  if (expireStoreRegistry.has(storeName)) {
    throw new Error(`ExpireStore "${storeName}" has already been retrieved`);
  }
  expireStoreRegistry.add(storeName);

  const requestUrl = (itemName: string): string => `/${itemName}`;
  let pruneScheduled = false;
  let cacheGeneration = 0;

  const pruneExpiredItems = async (generation: number): Promise<void> => {
    if (generation !== cacheGeneration) return;
    const cache = await caches.open(storeName);
    const requests = await cache.keys();
    const now = Date.now();
    await Promise.all(
      requests.map(async (request) => {
        if (generation !== cacheGeneration) return;
        const response = await cache.match(request);
        if (!response) return;
        try {
          const wrapped = (await response.json()) as Partial<ExpireItem<ItemType>>;
          if (
            wrapped.CacheVersion !== version ||
            typeof wrapped.ExpiresAt !== "number" ||
            wrapped.ExpiresAt < now
          ) {
            await cache.delete(request);
          }
        } catch {
          await cache.delete(request);
        }
      })
    );
  };

  const schedulePrune = (): void => {
    if (pruneScheduled) return;
    pruneScheduled = true;
    const generation = cacheGeneration;
    const run = () => {
      void pruneExpiredItems(generation).catch((error) => {
        console.warn(`ExpireStore "${storeName}" failed to prune expired entries`, error);
      });
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 2_000 });
    } else {
      setTimeout(run, 0);
    }
  };

  const GetItem = async (itemName: string): Promise<ItemType | undefined> => {
    if (forceNewData) return undefined;

    const cache = await caches.open(storeName);
    const response = await cache.match(requestUrl(itemName));
    if (!response) {
      schedulePrune();
      return undefined;
    }

    let wrapped: ExpireItem<ItemType>;
    try {
      wrapped = (await response.json()) as ExpireItem<ItemType>;
    } catch (error) {
      await cache.delete(requestUrl(itemName));
      console.warn(`ExpireStore "${storeName}" discarded invalid cache entry`, error);
      schedulePrune();
      return undefined;
    }
    if (wrapped.CacheVersion !== version) {
      await cache.delete(requestUrl(itemName));
      schedulePrune();
      return undefined;
    }
    if (wrapped.ExpiresAt < Date.now()) {
      await cache.delete(requestUrl(itemName));
      schedulePrune();
      return undefined;
    }

    schedulePrune();
    return wrapped.Content;
  };

  const SetItem = async (itemName: string, content: ItemType): Promise<ItemType> => {
    const wrapped: ExpireItem<ItemType> = {
      ExpiresAt: computeExpiresAt(itemExpirationSettings),
      CacheVersion: version,
      Content: content,
    };

    try {
      const cache = await caches.open(storeName);
      await cache.put(
        requestUrl(itemName),
        new Response(JSON.stringify(wrapped), {
          headers: { "Content-Type": "application/json" },
        })
      );
      schedulePrune();
    } catch (err) {
      console.warn(`ExpireStore "${storeName}": failed to write item "${itemName}"`, err);
      // 写入失败：抛错让调用方知道"保存未持久化"，而不是假装成功
      throw err;
    }

    return content;
  };

  const RemoveItem = async (itemName: string): Promise<void> => {
    try {
      const cache = await caches.open(storeName);
      const ok = await cache.delete(requestUrl(itemName));
      if (!ok) {
        console.warn(`ExpireStore "${storeName}": item "${itemName}" not found on remove`);
      }
    } catch (err) {
      console.warn(`ExpireStore "${storeName}": error removing item "${itemName}"`, err);
      throw err;
    }
  };

  const Destroy = async (): Promise<void> => {
    try {
      cacheGeneration++;
      pruneScheduled = false;
      const ok = await caches.delete(storeName);
      if (!ok) {
        console.warn(`ExpireStore "${storeName}": cache not found on destroy`);
      }
      expireStoreRegistry.delete(storeName);
    } catch (err) {
      console.warn(`ExpireStore "${storeName}": error destroying`, err);
      throw err;
    }
  };

  return Object.freeze({ GetItem, SetItem, RemoveItem, Destroy });
}
