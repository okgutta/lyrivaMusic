const stationaryStyles = { scale: "1", transform: "none", transition: "none" };

/** Keep timing/color feedback while suppressing lyric movement, including CSS states. */
export class ReducedMotionStyles {
  private saved = new WeakMap<HTMLElement, Array<[string, string, string]>>();

  apply(element: HTMLElement, reduced: boolean): boolean {
    const previous = this.saved.get(element);
    if (reduced === !!previous) return false;
    if (reduced) {
      this.saved.set(
        element,
        Object.keys(stationaryStyles).map((property) => [
          property,
          element.style.getPropertyValue(property),
          element.style.getPropertyPriority(property),
        ])
      );
      for (const [property, value] of Object.entries(stationaryStyles)) {
        element.style.setProperty(property, value, "important");
      }
    } else {
      for (const [property, value, priority] of previous!) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
      this.saved.delete(element);
    }
    return true;
  }

  protects(element: HTMLElement, property: string): boolean {
    return this.saved.has(element) && Object.hasOwn(stationaryStyles, property);
  }
}
