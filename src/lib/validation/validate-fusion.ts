export type Direction = "up" | "down" | "left" | "right";

export type FusionPieceInfo = {
  pieceId: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
};

export type ScreenPositioned = FusionPieceInfo & { screenX: number; screenY: number };

const DIRECTION_DELTA: Record<Direction, { row: number; col: number }> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

/**
 * A genuine contact between piece `a` (in the dragged group) and piece `b`
 * (in a stationary group), with `b` sitting in `direction` relative to `a`
 * on screen. True only if they're really adjacent in the puzzle's hidden
 * true grid (AD-3's precomputed graph) in that exact direction, and neither
 * has been rotated off its as-cut orientation — the same two conditions
 * Story 3.5 already validates for Frame integration, just applied wherever
 * the contact happens instead of only at a Frame slot.
 */
export function isGenuineContact(
  a: FusionPieceInfo,
  b: FusionPieceInfo,
  direction: Direction,
  trueNeighborIdsOfA: ReadonlySet<string>,
): boolean {
  if (a.rotation !== 0 || b.rotation !== 0) {
    return false;
  }
  if (!trueNeighborIdsOfA.has(b.pieceId)) {
    return false;
  }
  const delta = DIRECTION_DELTA[direction];
  return b.gridRow === a.gridRow + delta.row && b.gridCol === a.gridCol + delta.col;
}

export type ContactCandidate = {
  a: FusionPieceInfo;
  b: FusionPieceInfo;
  direction: Direction;
};

/**
 * Every pair of members (one from the dragged group's proposed new screen
 * positions, one from a stationary piece/Cluster elsewhere in the Room)
 * sitting exactly one tile-width/height apart in a cardinal direction,
 * within `tolerance` px. "Genuinely brought into contact" — Story 3.8's AC
 * that sorting pieces near each other must have zero effect unless they
 * actually touch is what `tolerance` (a snapping window, not a loose
 * "nearby" radius) enforces.
 */
export function findContactCandidates(
  draggedMembers: ScreenPositioned[],
  stationaryMembers: ScreenPositioned[],
  tileWidth: number,
  tileHeight: number,
  tolerance: number,
): ContactCandidate[] {
  const candidates: ContactCandidate[] = [];
  for (const a of draggedMembers) {
    for (const b of stationaryMembers) {
      const dx = b.screenX - a.screenX;
      const dy = b.screenY - a.screenY;
      if (Math.abs(dy) <= tolerance && Math.abs(dx - tileWidth) <= tolerance) {
        candidates.push({ a, b, direction: "right" });
      } else if (Math.abs(dy) <= tolerance && Math.abs(dx + tileWidth) <= tolerance) {
        candidates.push({ a, b, direction: "left" });
      } else if (Math.abs(dx) <= tolerance && Math.abs(dy - tileHeight) <= tolerance) {
        candidates.push({ a, b, direction: "down" });
      } else if (Math.abs(dx) <= tolerance && Math.abs(dy + tileHeight) <= tolerance) {
        candidates.push({ a, b, direction: "up" });
      }
    }
  }
  return candidates;
}

/**
 * Zero tolerance (AD-3): a set of proposed contacts fuses only if every
 * single one is genuine. One false contact anywhere rejects the whole
 * fusion attempt — never a partial fuse, and never a fusion out of mere
 * proximity with nothing actually touching.
 */
export function validateFusion(
  contacts: ContactCandidate[],
  trueNeighborsByPieceId: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (contacts.length === 0) {
    return false;
  }
  return contacts.every((contact) => {
    const trueNeighborIds = trueNeighborsByPieceId.get(contact.a.pieceId);
    return (
      trueNeighborIds !== undefined &&
      isGenuineContact(contact.a, contact.b, contact.direction, trueNeighborIds)
    );
  });
}
