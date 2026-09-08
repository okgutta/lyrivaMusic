import { atom } from "nanostores";

export type TranslationState = "none" | "partial" | "translating" | "complete" | "hidden" | "error";

export const $translationState = atom<TranslationState>("none");

let toggleHandler: (() => void | Promise<void>) | null = null;

export function registerTranslationToggleHandler(handler: () => void | Promise<void>): void {
  toggleHandler = handler;
}

export async function requestTranslationToggle(): Promise<void> {
  await toggleHandler?.();
}
