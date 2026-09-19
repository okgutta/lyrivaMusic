export interface CachedRuntime {
  version: string;
  loaderVersion: number;
  code: string;
  sha256: string;
  size: number;
}

export interface StoredUpdates {
  current?: CachedRuntime;
  pending?: CachedRuntime;
  trial?: { version: string; kind: "current" | "pending" };
  badVersion?: string;
}

export interface UpdateStorage {
  read(): Promise<StoredUpdates>;
  update(change: (state: StoredUpdates) => StoredUpdates): Promise<void>;
}

const DATABASE_NAME = "lyriva-runtime-updates";
const STORE_NAME = "updates";
const RECORD_KEY = "runtime";
const TIMEOUT_MS = 8_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function sanitizeRuntime(value: unknown): CachedRuntime | undefined {
  if (
    !isRecord(value) ||
    !isVersion(value.version) ||
    !Number.isSafeInteger(value.loaderVersion) ||
    (value.loaderVersion as number) < 1 ||
    typeof value.code !== "string" ||
    value.code.length === 0 ||
    typeof value.sha256 !== "string" ||
    !/^[a-f\d]{64}$/i.test(value.sha256) ||
    !Number.isSafeInteger(value.size) ||
    (value.size as number) < 1
  ) {
    return undefined;
  }
  // This is only structural validation. The loader must check the actual byte
  // length, digest and compatibility before executing cached code.
  return {
    version: value.version,
    loaderVersion: value.loaderVersion as number,
    code: value.code,
    sha256: value.sha256,
    size: value.size as number,
  };
}

function sanitizeState(value: unknown): StoredUpdates {
  if (!isRecord(value)) return {};
  const state: StoredUpdates = {};
  const current = sanitizeRuntime(value.current);
  const pending = sanitizeRuntime(value.pending);
  if (current) state.current = current;
  if (pending) state.pending = pending;
  if (
    isRecord(value.trial) &&
    isVersion(value.trial.version) &&
    (value.trial.kind === "current" || value.trial.kind === "pending")
  ) {
    state.trial = { version: value.trial.version, kind: value.trial.kind };
  }
  if (isVersion(value.badVersion)) state.badVersion = value.badVersion;
  return state;
}

export function createUpdateStorage(
  indexedDB: IDBFactory | undefined = globalThis.indexedDB
): UpdateStorage {
  function transact(
    mode: IDBTransactionMode,
    change?: (state: StoredUpdates) => StoredUpdates
  ): Promise<StoredUpdates> {
    return new Promise((resolve, reject) => {
      let database: IDBDatabase | undefined;
      let transaction: IDBTransaction | undefined;
      let result: StoredUpdates = {};
      let settled = false;

      function finish(error?: unknown): void {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error !== undefined) {
          try {
            transaction?.abort();
          } catch {
            // An already completed or aborted transaction cannot be aborted.
          }
        }
        database?.close();
        if (error !== undefined) reject(error);
        else resolve(result);
      }

      const timeout = setTimeout(
        () => finish(new Error("Runtime update storage timed out")),
        TIMEOUT_MS
      );
      try {
        if (!indexedDB) throw new Error("IndexedDB is unavailable for runtime updates");
        const open = indexedDB.open(DATABASE_NAME, 1);
        open.onerror = () => finish(open.error ?? new Error("Cannot open runtime update storage"));
        open.onblocked = () => finish(new Error("Runtime update storage upgrade is blocked"));
        open.onupgradeneeded = () => {
          if (settled) {
            open.transaction?.abort();
            return;
          }
          try {
            database = open.result;
            transaction = open.transaction ?? undefined;
            database.onversionchange = () => database?.close();
            if (!open.result.objectStoreNames.contains(STORE_NAME)) {
              open.result.createObjectStore(STORE_NAME);
            }
          } catch (error) {
            finish(error ?? new Error("Cannot initialize runtime update storage"));
          }
        };
        open.onsuccess = () => {
          database = open.result;
          // A blocked or timed out open may still finish later. Never retain its
          // connection or run a write after the caller has received a rejection.
          if (settled) {
            database.close();
            return;
          }
          database.onversionchange = () => database?.close();
          try {
            transaction = database.transaction(STORE_NAME, mode);
            transaction.oncomplete = () => finish();
            transaction.onerror = () =>
              finish(transaction?.error ?? new Error("Runtime update storage transaction failed"));
            transaction.onabort = () =>
              finish(transaction?.error ?? new Error("Runtime update storage transaction aborted"));
            const store = transaction.objectStore(STORE_NAME);
            const get = store.get(RECORD_KEY);
            get.onerror = () =>
              finish(get.error ?? new Error("Cannot read runtime update storage"));
            get.onsuccess = () => {
              if (settled) return;
              try {
                result = sanitizeState(get.result);
                if (change) {
                  // Keep read, synchronous mutation and write inside this one
                  // readwrite transaction so concurrent updates cannot be lost.
                  result = sanitizeState(change(result));
                  const put = store.put(result, RECORD_KEY);
                  put.onerror = () =>
                    finish(put.error ?? new Error("Cannot write runtime update storage"));
                }
              } catch (error) {
                finish(error ?? new Error("Runtime update storage mutation failed"));
              }
            };
          } catch (error) {
            finish(error ?? new Error("Cannot start runtime update storage transaction"));
          }
        };
      } catch (error) {
        finish(error ?? new Error("Cannot open runtime update storage"));
      }
    });
  }

  return {
    read: () => transact("readonly"),
    update: async (change) => {
      await transact("readwrite", change);
    },
  };
}
