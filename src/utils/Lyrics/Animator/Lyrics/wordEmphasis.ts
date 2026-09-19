export interface WordMotion {
  scale: number;
  yOffset: number;
  glow: number;
}

/** Visual strength only: lyric timestamps and highlight progress stay untouched. */
export function softenWordMotion(durationMs: number, motion: WordMotion): WordMotion {
  // Short syllables stay quiet. Smoothstep has zero slope at both ends, so
  // crossing 700 ms never introduces an abrupt change in visual emphasis.
  const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const progress = Math.min(1, Math.max(0, (duration - 700) / 900));
  const blend = progress * progress * (3 - 2 * progress);
  return {
    scale: 1 + (motion.scale - 1) * (0.2 + 0.55 * blend),
    yOffset: motion.yOffset * (0.25 + 0.5 * blend),
    glow: motion.glow * (0.18 + 0.52 * blend),
  };
}
