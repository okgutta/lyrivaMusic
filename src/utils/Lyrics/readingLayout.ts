import type { NormalizedReadingPreferences } from "./readingPreferences.ts";
import { positionLineTranslation } from "./Applyer/Utils/TranslationPosition.ts";

export function applyReadingLayout(
  page: HTMLElement,
  preferences: NormalizedReadingPreferences,
  lines: Iterable<HTMLElement>
): void {
  page.style.setProperty("--sl-lyrics-font-scale", String(preferences.fontScale));
  page.style.setProperty("--sl-lyrics-translation-size", `${preferences.translationSize}em`);
  page.classList.toggle("TranslationAbove", preferences.translationPosition === "above");
  // Include unmounted virtual rows and preserve their timed word elements.
  for (const line of lines) {
    const translation = Array.from(line.children).find((child) =>
      child.classList.contains("line-translation")
    );
    if (translation) {
      positionLineTranslation(line, translation as HTMLElement, preferences.translationPosition);
    }
  }
}
