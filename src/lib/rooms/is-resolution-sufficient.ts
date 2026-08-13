/**
 * Arbitrary, provisional heuristic — no real piece-cutting service exists
 * yet (`src/lib/piece-cutting/` is still empty; Epic 3 builds it). The PRD
 * explicitly leaves image-resolution/piece-count coherence unresolved
 * (§11 Open Question #3). Once Epic 3's deterministic piece-cutting
 * algorithm exists, replace this with an actual geometry-aware check.
 */
const MIN_PIXELS_PER_PIECE = 3000;

export function isResolutionSufficient(
  width: number,
  height: number,
  pieceCount: number,
): boolean {
  return width * height >= pieceCount * MIN_PIXELS_PER_PIECE;
}

/**
 * Largest option in `pieceCountOptions` that `isResolutionSufficient` would
 * accept for the given dimensions — used to suggest a concrete remediation
 * in the resolution-warning message, rather than a generic "reduce it".
 */
export function getLargestSufficientPieceCount(
  width: number,
  height: number,
  pieceCountOptions: number[],
): number | null {
  const passing = pieceCountOptions.filter((count) =>
    isResolutionSufficient(width, height, count),
  );
  return passing.length > 0 ? Math.max(...passing) : null;
}
