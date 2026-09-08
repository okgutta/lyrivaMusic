import { atom } from "nanostores";

export type TranslationState = "unavailable" | "ready" | "loading" | "complete" | "error";

export const $translationState = atom<TranslationState>("unavailable");

export interface TranslationSummary {
  entryCount: number;
  translatedCount: number;
  hasNativeTranslation: boolean;
  hasTrackCache: boolean;
  sourceMatchesTarget: boolean;
}

/** Derive the stable button state after lyrics/cache preparation. */
export function settledTranslationState(summary: TranslationSummary): TranslationState {
  if (summary.entryCount <= 0) return "unavailable";
  if (
    summary.hasNativeTranslation ||
    summary.hasTrackCache ||
    summary.translatedCount >= summary.entryCount
  ) {
    return "complete";
  }
  if (summary.sourceMatchesTarget) return "unavailable";
  return "ready";
}

let toggleHandler: (() => void | Promise<void>) | null = null;

export function registerTranslationToggleHandler(handler: () => void | Promise<void>): void {
  toggleHandler = handler;
}

export async function requestTranslationToggle(): Promise<void> {
  await toggleHandler?.();
}
