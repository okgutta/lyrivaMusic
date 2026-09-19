export interface BlurLineGeometry {
  readonly top: number;
  readonly height: number;
}

const MAX_BLUR = 6.8;

function hasValidGeometry(line: BlurLineGeometry): boolean {
  return Number.isFinite(line.top) && Number.isFinite(line.height) && line.height >= 0;
}

/**
 * Blur follows physical distance, so wrapped lines and translations occupy their
 * actual share of the focus area. Coordinates may use any common origin.
 * activeViewportCenter is the active line's intended center inside the viewport;
 * pass it for top-aligned lyrics, or leave it centered during ordinary following.
 */
export function computeDistanceBlur(
  line: BlurLineGeometry,
  active: BlurLineGeometry,
  viewportHeight: number,
  activeViewportCenter = viewportHeight / 2
): number {
  if (
    !hasValidGeometry(line) ||
    !hasValidGeometry(active) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !Number.isFinite(activeViewportCenter)
  ) {
    return 0;
  }

  const center = line.top + line.height / 2;
  const activeCenter = active.top + active.height / 2;
  if (!Number.isFinite(center) || !Number.isFinite(activeCenter)) return 0;
  const delta = center - activeCenter;
  if (delta === 0) return 0;

  const viewportCenter = Math.min(viewportHeight, Math.max(0, activeViewportCenter));
  const availableHeight = delta < 0 ? viewportCenter : viewportHeight - viewportCenter;
  // Keep the active line's own footprint clear, including nearby backing vocals.
  // A one-pixel minimum avoids division by zero in collapsed/edge-aligned layouts.
  const clearDistance = active.height / 2;
  const distance = Math.max(0, Math.abs(delta) - clearDistance);
  const progress = Math.min(1, distance / Math.max(1, availableHeight - clearDistance));
  const smoothProgress = progress * progress * (3 - 2 * progress);
  return MAX_BLUR * smoothProgress;
}
