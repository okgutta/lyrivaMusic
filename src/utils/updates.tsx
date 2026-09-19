import { useStore } from "@nanostores/react";
import { atom } from "nanostores";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectVersion } from "../../project/config.ts";
import { PopupModal } from "../components/Modal.ts";
import UpdatePanel from "../components/ReactComponents/UpdatePanel.tsx";
import type { UpdateBridge, UpdateState } from "../updater/contracts.ts";
import "../css/update-panel.css";

export const $updateState = atom<UpdateState>({ phase: "idle", currentVersion: ProjectVersion });

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MODAL_ID = "lyrivaUpdate";
const presentedVersions = new Set<string>();
let initialized = false;
let pendingVersion: string | undefined;
let waitingForModal: MutationObserver | undefined;

export function getUpdateBridge(): UpdateBridge | undefined {
  return window.__LYRIVA_UPDATER__;
}

function refreshState(): void {
  const bridge = getUpdateBridge();
  $updateState.set(bridge?.getState() ?? { phase: "idle", currentVersion: ProjectVersion });
}

async function runUpdateAction(action: "check" | "download"): Promise<void> {
  const bridge = getUpdateBridge();
  if (!bridge) return;
  try {
    await bridge[action]();
  } catch (error) {
    $updateState.set({
      ...bridge.getState(),
      phase: "error",
      error: error instanceof Error ? error.message : "暂时无法获取更新，请稍后重试。",
    });
  }
}

function ConnectedUpdatePanel() {
  const state = useStore($updateState);
  return (
    <UpdatePanel
      state={state}
      automaticUpdates={Boolean(getUpdateBridge())}
      onCheck={() => void runUpdateAction("check")}
      onRetry={() =>
        void runUpdateAction(
          state.latestVersion && state.latestVersion !== state.currentVersion ? "download" : "check"
        )
      }
      onReload={() => getUpdateBridge()?.reload()}
      onClose={() => PopupModal.hide()}
    />
  );
}

/** The manual entry is only on the settings overview, where no draft is being edited. */
export function openUpdatesPanel(): void {
  refreshState();
  if (PopupModal.querySelector(`.slmodal-${MODAL_ID}`) && PopupModal.isConnected) return;
  const version = $updateState.get().latestVersion;
  if (version) presentedVersions.add(version);
  pendingVersion = undefined;
  waitingForModal?.disconnect();
  waitingForModal = undefined;

  const container = document.createElement("div");
  container.className = "sl-sp-panel";
  const root = createRoot(container);
  flushSync(() => root.render(<ConnectedUpdatePanel />));
  PopupModal.display({
    title: "版本与更新",
    content: container,
    modalId: MODAL_ID,
    onClose: () => root.unmount(),
  });
  // The dialog we waited for restores its trigger's focus in a later task.
  // Keep keyboard focus inside this new dialog after that restoration runs.
  window.setTimeout(() => {
    if (container.isConnected && !PopupModal.contains(document.activeElement)) {
      PopupModal.querySelector<HTMLElement>(`.slmodal-${MODAL_ID}`)?.focus();
    }
  }, 0);
}

function presentPendingUpdate(): void {
  if (!pendingVersion) return;
  // Wait for settings (including unsaved credential drafts) and other dialogs.
  if (document.querySelector('sl-generic-modal, [role="dialog"][aria-modal="true"]')) return;
  const state = $updateState.get();
  if (state.latestVersion !== pendingVersion || state.latestVersion === state.currentVersion) {
    pendingVersion = undefined;
    waitingForModal?.disconnect();
    waitingForModal = undefined;
    return;
  }
  openUpdatesPanel();
}

function receiveState(state: UpdateState): void {
  $updateState.set(state);
  const version = state.latestVersion;
  if (!version || version === state.currentVersion || presentedVersions.has(version)) return;
  if (!["available", "downloading", "ready"].includes(state.phase)) return;
  if (PopupModal.isConnected && PopupModal.querySelector(`.slmodal-${MODAL_ID}`)) {
    presentedVersions.add(version);
    return;
  }
  pendingVersion = version;
  presentPendingUpdate();
  if (pendingVersion && !waitingForModal) {
    waitingForModal = new MutationObserver(presentPendingUpdate);
    waitingForModal.observe(document.body, { childList: true, subtree: true });
  }
}

/** Called once after the extension is ready; the loader owns all network work. */
export function initializeUpdates(): void {
  if (initialized) return;
  const bridge = getUpdateBridge();
  if (!bridge) return;
  initialized = true;
  bridge.subscribe(receiveState);
  receiveState(bridge.getState());
  void runUpdateAction("check");
  window.setInterval(() => void runUpdateAction("check"), CHECK_INTERVAL_MS);
}
