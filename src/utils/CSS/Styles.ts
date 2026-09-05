// Define a type for CSS style properties
export interface StyleProperties {
  [key: string]: string;
}

export function applyStyles(element: HTMLElement, styles: StyleProperties): void {
  if (element) {
    Object.entries(styles).forEach(([key, value]) => {
      element.style[key as any] = value;
    });
  } else {
    console.warn("Element not found");
  }
}

export function removeAllStyles(element: HTMLElement): void {
  if (element) {
    // Reset all inline styles
    element.removeAttribute("style");
  } else {
    console.warn("Element not found");
  }
}
