import { createUpdateStorage, type CachedRuntime } from "./storage.ts";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Script the IndexedDB lifecycle so failures can be injected after a successful
// request but before commit, without installing a browser or an IDB polyfill.
function harness(value?: unknown) {
  const request = () => ({
    result: undefined as unknown,
    error: null as Error | null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
  });
  const get = { ...request(), result: value };
  const put = request();
  const writes: { value: unknown; key: unknown }[] = [];
  const reads: unknown[] = [];
  const modes: unknown[] = [];
  let closes = 0;
  let aborts = 0;
  let creates = 0;
  const store = {
    get(key: unknown) {
      reads.push(key);
      return get;
    },
    put(value: unknown, key: unknown) {
      writes.push({ value, key });
      return put;
    },
  };
  const transaction = {
    error: null as Error | null,
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    objectStore: () => store,
    abort() {
      aborts++;
      this.onabort?.();
    },
  };
  const database = {
    objectStoreNames: { contains: () => false },
    onversionchange: null as (() => void) | null,
    createObjectStore: () => creates++,
    transaction(_store: string, mode: string) {
      modes.push(mode);
      return transaction;
    },
    close: () => closes++,
  };
  const open = {
    ...request(),
    result: database,
    transaction,
    onblocked: null as (() => void) | null,
    onupgradeneeded: null as (() => void) | null,
  };
  return {
    factory: { open: () => open } as unknown as IDBFactory,
    open,
    get,
    put,
    database,
    transaction,
    writes,
    reads,
    modes,
    stats: () => ({ closes, aborts, creates }),
  };
}

const runtime: CachedRuntime = {
  version: "1.2.3",
  loaderVersion: 1,
  code: "console.log('runtime')",
  sha256: "a".repeat(64),
  size: 22,
};

{
  const idb = harness({
    current: runtime,
    pending: { ...runtime, size: NaN },
    trial: { version: "1.2.3", kind: "invalid" },
    badVersion: "1.2.2",
    unwanted: "discard",
  });
  const operation = createUpdateStorage(idb.factory).read();
  idb.open.onupgradeneeded?.();
  idb.open.onsuccess?.();
  idb.get.onsuccess?.();
  idb.transaction.oncomplete?.();
  const state = await operation;
  check(state.current?.code === runtime.code, "valid cached runtime must survive reading");
  check(state.current !== runtime, "cached values must be copied to a sanitized object");
  check(!state.pending && !state.trial, "invalid runtime and trial records must be dropped");
  check(state.badVersion === "1.2.2", "valid bad-version marker must survive reading");
  check(!("unwanted" in state), "unrecognized state fields must be discarded");
  check(idb.modes[0] === "readonly" && idb.writes.length === 0, "read must not write");
  check(idb.stats().creates === 1 && idb.stats().closes === 1, "create store and close connection");
}

{
  const idb = harness({ current: runtime });
  let resolved = false;
  const operation = createUpdateStorage(idb.factory)
    .update((state) => ({ ...state, pending: { ...runtime, version: "1.2.4" } }))
    .then(() => {
      resolved = true;
    });
  idb.open.onsuccess?.();
  idb.get.onsuccess?.();
  idb.put.onsuccess?.();
  await Promise.resolve();
  check(!resolved, "a successful write request must not resolve before transaction commit");
  check(idb.modes.length === 1 && idb.modes[0] === "readwrite", "use one readwrite transaction");
  check(idb.reads[0] === idb.writes[0]?.key, "read and write must use the same fixed record");
  const written = idb.writes[0].value as { current: CachedRuntime; pending: CachedRuntime };
  check(written.current.version === "1.2.3", "mutation must preserve existing state");
  check(written.pending.version === "1.2.4", "mutation must persist the new state");
  idb.transaction.oncomplete?.();
  await operation;
  check(resolved && idb.stats().closes === 1, "resolve and close only after commit");
}

{
  const idb = harness({ current: runtime });
  const failure = new Error("disk full at commit");
  const operation = createUpdateStorage(idb.factory)
    .update((state) => ({ ...state, pending: runtime }))
    .then(
      () => null,
      (error: unknown) => error
    );
  idb.open.onsuccess?.();
  idb.get.onsuccess?.();
  idb.transaction.error = failure;
  idb.transaction.onabort?.();
  check((await operation) === failure, "an abort after writing must reject with its error");
  check(idb.stats().closes === 1, "aborted transactions must close their connection");
}

{
  const idb = harness({ current: runtime });
  const failure = new Error("mutation failed");
  const operation = createUpdateStorage(idb.factory)
    .update(() => {
      throw failure;
    })
    .then(
      () => null,
      (error: unknown) => error
    );
  idb.open.onsuccess?.();
  idb.get.onsuccess?.();
  check((await operation) === failure, "mutation failure must reject");
  check(
    idb.stats().aborts === 1 && idb.writes.length === 0,
    "failed mutation must abort unwritten"
  );
}

{
  const idb = harness();
  const operation = createUpdateStorage(idb.factory)
    .update(() => ({ pending: runtime }))
    .catch((error: unknown) => error);
  idb.open.onblocked?.();
  check((await operation) instanceof Error, "a blocked open must reject");
  idb.open.onsuccess?.();
  check(idb.stats().closes === 1 && idb.modes.length === 0, "late open must close without writing");
}

{
  const idb = harness();
  const operation = createUpdateStorage(idb.factory).read();
  idb.open.onsuccess?.();
  idb.database.onversionchange?.();
  check(idb.stats().closes === 1, "versionchange must release the database connection");
  idb.get.onsuccess?.();
  idb.transaction.oncomplete?.();
  check(Object.keys(await operation).length === 0, "missing record must read as empty state");
}

{
  const idb = harness();
  const originalSetTimeout = globalThis.setTimeout;
  let fireTimeout: (() => void) | undefined;
  let operation: Promise<unknown>;
  try {
    globalThis.setTimeout = ((handler: TimerHandler, delay?: number) => {
      check(typeof handler === "function", "storage timeout must be a callback");
      check(
        typeof delay === "number" && delay > 0 && delay <= 8_000,
        "storage wait must be bounded"
      );
      fireTimeout = handler as () => void;
      return 0;
    }) as typeof globalThis.setTimeout;
    operation = createUpdateStorage(idb.factory)
      .update(() => ({ pending: runtime }))
      .catch((error: unknown) => error);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
  fireTimeout?.();
  check((await operation) instanceof Error, "an unresponsive database must reject on timeout");
  idb.open.onupgradeneeded?.();
  idb.open.onsuccess?.();
  check(idb.stats().aborts === 1, "a late upgrade must be aborted after timeout");
  check(
    idb.modes.length === 0 && idb.stats().closes === 1,
    "timed out open must never start a write"
  );
}

console.log("Runtime update storage lifecycle tests passed");
