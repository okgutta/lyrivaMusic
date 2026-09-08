/**
 * A simpler version of ScrollIntoCenterView that uses CSS for smooth scrolling
 * This function relies on the CSS scroll-behavior: smooth property
 * @param container The container element to scroll
 * @param element The element to scroll to
 * @param offset Vertical offset in pixels (negative values move the element up)
 * @param instantScroll Whether to use instant scrolling (no animation)
 */
export function ScrollIntoCenterViewCSS(
  container: HTMLElement,
  element: HTMLElement,
  offset: number = 0,
  instantScroll: boolean = false
) {
  // Calculate the target position (centered) using container-relative metrics
  const elementOffsetTop = element.offsetTop;
  const targetScrollTop =
    elementOffsetTop - (container.clientHeight / 2 - element.clientHeight / 2) - offset;

  // Toggle instant scroll mode if needed
  if (instantScroll) {
    container.classList.add("InstantScroll");
  }

  // Let CSS handle the smooth scrolling
  container.scrollTop = targetScrollTop;

  // Remove the instant scroll class after a short delay
  if (instantScroll) {
    setTimeout(() => {
      container.classList.remove("InstantScroll");
    }, 50);
  }
}
