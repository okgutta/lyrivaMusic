import type { UpdateBridge, UpdateState } from "./contracts.ts";
import {
  createUpdateStorage,
  type CachedRuntime,
  type StoredUpdates,
  type UpdateStorage,
} from "./storage.ts";
import {
  LATEST_RELEASE_URL,
  MAX_RUNTIME_BYTES,
  compareVersions,
  manifestUrl,
  parseManifest,
  parseRelease,
  requestBytes,
  requestJson,
  stableVersion,
  verifiedRuntime,
  type Release,
  type UpdateManifest,
} from "./protocol.ts";

interface BootstrapOptions {
  fallbackCode: string;
  fallbackVersion: string;
  loaderVersion: number;
}
interface UpdaterHost {
  __LYRIVA_UPDATER__?: UpdateBridge;
}
export interface UpdaterEnvironment {
  storage: UpdateStorage;
  request: typeof fetch;
  execute: (code: string) => void | Promise<void>;
  reload: () => void;
  host: UpdaterHost;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "更新失败，请稍后重试";

async function usableRuntime(
  value: CachedRuntime | undefined,
  loaderVersion: number
): Promise<boolean> {
  if (
    !value ||
    !stableVersion(value.version) ||
    !Number.isSafeInteger(value.loaderVersion) ||
    value.loaderVersion < 1 ||
    value.loaderVersion > loaderVersion ||
    typeof value.code !== "string" ||
    value.code.length > MAX_RUNTIME_BYTES ||
    typeof value.sha256 !== "string" ||
    !/^[a-f\d]{64}$/i.test(value.sha256) ||
    !Number.isSafeInteger(value.size) ||
    value.size <= 0 ||
    value.size > MAX_RUNTIME_BYTES
  )
    return false;
  try {
    await verifiedRuntime(new TextEncoder().encode(value.code), value);
    return true;
  } catch {
    return false;
  }
}

/** Install the bridge before running exactly one runtime in this Spotify session. */
export async function startUpdater(
  options: BootstrapOptions,
  environment: Partial<UpdaterEnvironment> = {}
): Promise<UpdateBridge> {
  const host = environment.host ?? window;
  if (host.__LYRIVA_UPDATER__) return host.__LYRIVA_UPDATER__;
  if (!stableVersion(options.fallbackVersion)) throw new Error("内置版本号无效");
  const storage = environment.storage ?? createUpdateStorage();
  const request = environment.request ?? ((input, init) => fetch(input, init));
  const execute =
    environment.execute ??
    ((code: string) => {
      // The only remote code path is the fixed repository release channel after
      // byte-size and SHA-256 verification. No user-supplied URL reaches this call.
      new Function(`${code}\n//# sourceURL=lyrivamusic-runtime.js`)();
    });
  const reload = environment.reload ?? (() => location.reload());
  const listeners = new Set<(state: UpdateState) => void>();
  let state: UpdateState = { phase: "idle", currentVersion: options.fallbackVersion };
  let selected: CachedRuntime | undefined;
  let selectedKind: "current" | "pending" | undefined;
  let bootFailed = false;
  let healthy = false;
  let confirming = false;
  let badVersion: string | undefined;
  let release: Release | undefined;
  let manifest: UpdateManifest | undefined;
  let checkFlight: Promise<void> | undefined;
  let downloadFlight: Promise<void> | undefined;

  function publish(next: UpdateState): void {
    state = next;
    for (const listener of listeners) {
      try {
        listener({ ...state });
      } catch (error) {
        console.error("[lyrivaMusic updater] listener failed", error);
      }
    }
  }
  function failed(error: unknown): void {
    publish({ ...state, phase: "error", error: errorMessage(error), progress: undefined });
  }

  async function fetchUpdate(): Promise<void> {
    if (!release || !manifest) {
      await bridge.check();
      return;
    }
    if (manifest.loaderVersion > options.loaderVersion) {
      publish({ ...state, phase: "available", loaderUpdateRequired: true });
      return;
    }
    const candidate = manifest;
    publish({ ...state, phase: "downloading", error: undefined, progress: 0 });
    try {
      const bytes = await requestBytes(
        request,
        candidate.runtime.url,
        candidate.runtime.size,
        (progress) => publish({ ...state, phase: "downloading", progress })
      );
      if (!bytes) throw new Error("更新文件内容为空");
      const code = await verifiedRuntime(bytes, candidate.runtime);
      const pending: CachedRuntime = {
        version: candidate.version,
        loaderVersion: candidate.loaderVersion,
        code,
        sha256: candidate.runtime.sha256,
        size: candidate.runtime.size,
      };
      await storage.update((saved) => ({ ...saved, pending }));
      publish({ ...state, phase: "ready", progress: 100, error: undefined });
    } catch (error) {
      failed(error);
    }
  }

  async function checkLatest(): Promise<void> {
    if (downloadFlight) {
      await downloadFlight;
      return;
    }
    publish({ ...state, phase: "checking", error: undefined });
    try {
      const value = await requestJson(request, LATEST_RELEASE_URL, true);
      const found = value === null ? null : parseRelease(value);
      if (!found || compareVersions(found.version, state.currentVersion) <= 0) {
        release = undefined;
        manifest = undefined;
        publish({ phase: "idle", currentVersion: state.currentVersion });
        return;
      }
      if (found.version === badVersion)
        throw new Error("此版本上次启动未完成，已恢复原版本；请等待下一版本或重新安装扩展");
      const nextManifest = parseManifest(await requestJson(request, manifestUrl(found)), found);
      release = found;
      manifest = nextManifest;
      const available: UpdateState = {
        phase: "available",
        currentVersion: state.currentVersion,
        latestVersion: found.version,
        notes: found.notes,
        releaseUrl: found.url,
        loaderUpdateRequired: nextManifest.loaderVersion > options.loaderVersion,
      };
      publish(available);
      if (available.loaderUpdateRequired) return;
      const saved = await storage.read();
      if (
        saved.pending?.version === found.version &&
        saved.pending.sha256 === nextManifest.runtime.sha256 &&
        (await usableRuntime(saved.pending, options.loaderVersion))
      ) {
        publish({ ...available, phase: "ready", progress: 100 });
        return;
      }
      await bridge.download();
    } catch (error) {
      failed(error);
    }
  }

  const bridge: UpdateBridge = {
    getState: () => ({ ...state }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    check() {
      if (!checkFlight)
        checkFlight = Promise.resolve()
          .then(checkLatest)
          .finally(() => {
            checkFlight = undefined;
          });
      return checkFlight;
    },
    download() {
      if (!release || !manifest) return bridge.check();
      if (!downloadFlight)
        downloadFlight = Promise.resolve()
          .then(fetchUpdate)
          .finally(() => {
            downloadFlight = undefined;
          });
      return downloadFlight;
    },
    reload,
    markHealthy(version) {
      if (version !== state.currentVersion || healthy || confirming || bootFailed) return;
      confirming = true;
      void Promise.resolve()
        .then(async () => {
          if (bootFailed) return;
          if (selected) {
            const runtime = selected;
            await storage.update((saved) => {
              if (saved.trial?.version !== version || saved.trial.kind !== selectedKind)
                return saved;
              const next = { ...saved, current: runtime };
              if (next.pending?.version === version) delete next.pending;
              delete next.trial;
              if (next.badVersion === version) delete next.badVersion;
              return next;
            });
          }
          healthy = true;
        })
        .catch(failed)
        .finally(() => {
          confirming = false;
        });
    },
  };
  host.__LYRIVA_UPDATER__ = bridge;

  try {
    let saved = await storage.read();
    if (saved.trial) {
      const trial = saved.trial;
      await storage.update((existing) => {
        const next = { ...existing, badVersion: trial.version };
        if (next.pending?.version === trial.version) delete next.pending;
        if (trial.kind === "current" && next.current?.version === trial.version)
          delete next.current;
        delete next.trial;
        return next;
      });
      saved = await storage.read();
    }
    badVersion = saved.badVersion;
    const validCurrent = await usableRuntime(saved.current, options.loaderVersion);
    const validPending = await usableRuntime(saved.pending, options.loaderVersion);
    const current =
      validCurrent &&
      saved.current!.version !== badVersion &&
      compareVersions(saved.current!.version, options.fallbackVersion) >= 0
        ? saved.current
        : undefined;
    const pending =
      validPending &&
      saved.pending!.version !== badVersion &&
      compareVersions(saved.pending!.version, current?.version ?? options.fallbackVersion) > 0
        ? saved.pending
        : undefined;
    selected = pending ?? current;
    selectedKind = pending ? "pending" : current ? "current" : undefined;
    if (selected && selectedKind) {
      const trial: NonNullable<StoredUpdates["trial"]> = {
        version: selected.version,
        kind: selectedKind,
      };
      // A durable trial marker makes unacknowledged startup recoverable on the
      // next launch. Never attempt a second runtime in an already-running host.
      await storage.update((existing) => ({ ...existing, trial }));
      publish({ phase: "idle", currentVersion: selected.version });
    }
  } catch (error) {
    selected = undefined;
    selectedKind = undefined;
    failed(error);
  }
  try {
    await execute(selected?.code ?? options.fallbackCode);
  } catch (error) {
    bootFailed = true;
    badVersion = selected?.version;
    failed(new Error("新版本启动失败，将在下次启动时恢复可用版本"));
    console.error("[lyrivaMusic updater] runtime startup failed", error);
  }
  return bridge;
}
