import { atom } from "nanostores";

// localStorage 全量写入节流：拖动滑块等高频变更会连续触发 saveBlob，
// 每次都 JSON.stringify 整个 blob 同步写会卡顿。按 blob 合并到 200ms
// 窗口末尾写一次（同一 blob 多次变化只写最后一次；不同 blob 各写一次）。
const SAVE_DEBOUNCE_MS = 200;
// key = blob 对象引用（settings / uiState 是两个不同 blob），
// value = 该 blob 的保存函数（闭包读的是同一个 blob 引用，最新状态）
const pendingSaves = new Map<Record<string, any>, () => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(blob: Record<string, any>, save: () => void): void {
  pendingSaves.set(blob, save);
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const saves = [...pendingSaves.values()];
    pendingSaves.clear();
    for (const s of saves) {
      try {
        s();
      } catch {
        // 写入失败不应中断其它保存
      }
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Build a `persistAtom(key, defaultValue)` bound to a specific storage blob.
 * Sharing this avoids duplicating the same atom/backing-store wiring in every
 * module that keeps a persisted settings blob.
 *
 * @param getBlob - returns the live settings/UI-state blob (object reference).
 * @param saveBlob - persists the (mutated) blob to localStorage.
 */
export function makePersistAtom(
  getBlob: () => Record<string, any>,
  saveBlob: (obj: Record<string, any>) => void
) {
  return function persistAtom<V>(key: string, defaultValue: V) {
    const store = atom<V>(
      getBlob()[key] !== undefined ? getBlob()[key] : defaultValue
    );
    store.listen((v) => {
      const blob = getBlob();
      blob[key] = v;
      scheduleSave(blob, () => saveBlob(blob));
    });
    return store;
  };
}

/**
 * Rename stored keys in place (legacy -> current), then persist if anything
 * changed. Shared by the settings blob and the UI-state blob.
 */
export function migrateKeys(
  blob: Record<string, any>,
  renames: Record<string, string>,
  save: (obj: Record<string, any>) => void
): Record<string, any> {
  let changed = false;
  for (const [oldKey, newKey] of Object.entries(renames)) {
    if (oldKey in blob) {
      blob[newKey] = blob[oldKey];
      delete blob[oldKey];
      changed = true;
    }
  }
  if (changed) save(blob);
  return blob;
}
