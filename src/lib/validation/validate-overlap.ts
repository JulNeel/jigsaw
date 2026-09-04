export type ScreenPoint = { x: number; y: number };

/**
 * Whether locking a piece/Cluster into a Frame slot centered at
 * `slotCenter` would visually overlap any other, not-yet-Frame-anchored
 * piece currently resting nearby (its free scatter position, or its
 * Cluster's anchor + offset). This is a real risk, not a cosmetic one: a
 * locked piece never moves again (no "un-place" mechanic exists anywhere
 * in this app) — a piece buried underneath one at lock time would become
 * permanently unreachable, silently hidden forever. Checked against every
 * loose piece regardless of grid alignment (unlike the exact-slot
 * `SLOT_OCCUPIED` check against already-*locked* pieces), since a
 * free-floating piece's current position is never grid-aligned.
 */
export function overlapsAnyFreePiece(
  slotCenter: ScreenPoint,
  otherFreePieces: ReadonlyArray<ScreenPoint>,
  tileWidth: number,
  tileHeight: number,
): boolean {
  return otherFreePieces.some(
    (p) => Math.abs(p.x - slotCenter.x) < tileWidth && Math.abs(p.y - slotCenter.y) < tileHeight,
  );
}
