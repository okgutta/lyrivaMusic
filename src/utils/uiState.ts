import { atom } from "nanostores";
import { makePersistAtom, migrateKeys } from "./persist.ts";

export const UI_STATE_KEY = "SL:uiState";

function readUiStateBlob(): Record<string, any> {
  const raw = Spicetify.LocalStorage.get(UI_STATE_KEY);
  if (raw === null || raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveUiStateBlob(obj: Record<string, any>) {
  Spicetify.LocalStorage.set(UI_STATE_KEY, JSON.stringify(obj));
}

const _uiState: Record<string, any> = migrateKeys(
  readUiStateBlob(),
  {
    IsNowBarOpen: "isNowBarOpen",
    NowBarSide: "nowBarSide",
    ForceCompactMode: "forceCompactMode",
    "previous-version": "previousVersion",
  },
  saveUiStateBlob
);

const persistAtom = makePersistAtom(() => _uiState, saveUiStateBlob);

// UI state atoms (persisted, not settings-panel entries)
export const $isNowBarOpen = persistAtom<boolean>("isNowBarOpen", false);
export const $nowBarSide = persistAtom<"left" | "right">("nowBarSide", "left");
export const $forceCompactMode = persistAtom<boolean>("forceCompactMode", false);
export const $romanization = persistAtom<boolean>("romanization", false);
export const $fromVersion = persistAtom<string>("fromVersion", "");
export const $previousVersion = persistAtom<string>("previousVersion", "");
export const $npvLyricsOpen = persistAtom<boolean>("npvLyricsOpen", true);
export const $npvLyricsExpanded = persistAtom<boolean>("npvLyricsExpanded", false);

// Runtime (ephemeral) atoms
export const $isGlobalNav = atom<boolean>(true);

(function watchGlobalNav() {
  function observe(root: Element) {
    $isGlobalNav.set(root.classList.contains("global-nav"));
    new MutationObserver(() => {
      $isGlobalNav.set(root.classList.contains("global-nav"));
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
  }

  const existing = document.querySelector(".Root");
  if (existing) {
    observe(existing);
    return;
  }

  const mo = new MutationObserver((_, observer) => {
    const el = document.querySelector(".Root");
    if (el) {
      observer.disconnect();
      observe(el);
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
