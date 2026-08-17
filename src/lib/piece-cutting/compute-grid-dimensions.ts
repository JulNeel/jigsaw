/**
 * Derives a clean rows×cols grid matching the image's aspect ratio from a
 * nominal piece-count target. The actual piece count (rows*cols) may differ
 * slightly from `nominalPieceCount` — that's expected, not a bug (see Story
 * 2.4 Dev Notes).
 */
export function computeGridDimensions(
  nominalPieceCount: number,
  aspectRatio: number,
): { rows: number; cols: number } {
  if (
    !Number.isFinite(nominalPieceCount) ||
    nominalPieceCount <= 0 ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    throw new Error(
      `computeGridDimensions: invalid inputs (nominalPieceCount=${nominalPieceCount}, aspectRatio=${aspectRatio})`,
    );
  }
  const cols = Math.max(1, Math.round(Math.sqrt(nominalPieceCount * aspectRatio)));
  const rows = Math.max(1, Math.round(nominalPieceCount / cols));
  return { rows, cols };
}
