import { DIRECTION_OFFSETS, type OrthogonalDirection } from "./true-neighbors";

// A drop counts as "genuinely touching" a neighbor within this fraction of a
// tile's own size — a snapping window, not a loose "nearby" radius (Story
// 3.8's AC: sorting pieces near each other must have zero effect unless
// they actually touch). Deliberately tuned during manual verification, not
// spec-mandated. Widened 0.3 → 0.45 (user feedback, 2026-09-06: the fusion
// contact window felt too tight). Single source of truth — both
// `piece-actions.ts` (server) and `predict-fusion.ts` (client mirror) used
// to keep their own separately-duplicated copy of this exact number, which
// only worked as long as no one ever edited one without the other.
export const CONTACT_TOLERANCE_FACTOR = 0.45;

export type FusionPieceInfo = {
  pieceId: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
};

export type ScreenPositioned = FusionPieceInfo & { screenX: number; screenY: number };

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
  direction: OrthogonalDirection,
  trueNeighborIdsOfA: ReadonlySet<string>,
): boolean {
  if (a.rotation !== 0 || b.rotation !== 0) {
    return false;
  }
  if (!trueNeighborIdsOfA.has(b.pieceId)) {
    return false;
  }
  const delta = DIRECTION_OFFSETS[direction];
  return b.gridRow === a.gridRow + delta.row && b.gridCol === a.gridCol + delta.col;
}

export type ContactCandidate = {
  a: FusionPieceInfo;
  b: FusionPieceInfo;
  direction: OrthogonalDirection;
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
 * The subset of proposed contacts that are genuine — real true-grid
 * neighbours, in the right direction, both unrotated. The others are
 * incidental: `findContactCandidates`' window is 45% of a tile in each
 * cardinal direction, so a piece dropped into a scattered pile very often
 * lands roughly one tile from something it has nothing to do with.
 *
 * Callers must merge *these* counterparts only, never the full candidate
 * list — a false contact's piece has no business joining the Îlot.
 */
export function genuineContacts(
  contacts: ContactCandidate[],
  trueNeighborsByPieceId: ReadonlyMap<string, ReadonlySet<string>>,
): ContactCandidate[] {
  return contacts.filter((contact) => {
    const trueNeighborIds = trueNeighborsByPieceId.get(contact.a.pieceId);
    return (
      trueNeighborIds !== undefined &&
      isGenuineContact(contact.a, contact.b, contact.direction, trueNeighborIds)
    );
  });
}

/**
 * A drop fuses as soon as *one* contact is genuine (AD-3's real requirement:
 * never a fusion out of mere proximity with nothing actually touching).
 *
 * This used to demand that *every* detected contact be genuine — one false
 * contact anywhere vetoed the whole attempt. That made fusion asymmetric,
 * which it must never be: whether an unrelated piece happens to be parked
 * within the contact window depends entirely on which of the two pieces the
 * user picks up, so "A onto B" could refuse what "B onto A" accepted, with
 * the same two pieces ending up in the same place (user report, 2026-09-18 —
 * see this module's own `fusion symmetry` regression tests). The original
 * intent — never a *partially false* fuse — is preserved by `genuineContacts`
 * instead, which is what callers merge on: a false contact no longer vetoes
 * anything, it simply doesn't bring its own piece along.
 */
export function validateFusion(
  contacts: ContactCandidate[],
  trueNeighborsByPieceId: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  return genuineContacts(contacts, trueNeighborsByPieceId).length > 0;
}
