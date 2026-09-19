/** Move the existing translation without replacing timed words. */
export function positionLineTranslation(
  line: HTMLElement,
  translation: HTMLElement,
  position: "below" | "above"
): void {
  if (position === "above") {
    if (line.firstChild !== translation) line.insertBefore(translation, line.firstChild);
    return;
  }
  if (line.lastChild !== translation) line.appendChild(translation);
}
