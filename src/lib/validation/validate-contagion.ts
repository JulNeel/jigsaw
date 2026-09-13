import { isSlotInBounds, type FrameGeometry } from "./frame-geometry";

// Replaces `validatePlacementNeighbors` — placement no longer validates a
// discrete target slot against occupied-adjacent-slot direction matches at
// all. Instead, a genuinely-fused group (see `validate-fusion.ts`, unchanged)
// inherits placement from any already-placed member it now contains: the
// group's absolute grid->slot translation, read straight off that member's
// own true grid position vs. its confirmed slot. Every other member's own
// target then follows purely from its own true-grid delta to that anchor —
// the exact generalization of `placePiece`'s old `anchorTargetRow +
// m.offsetRow` math, restated in true-grid terms so it holds regardless of
// how the merged set was assembled (dragged group, touched solos, touched
// Clusters, any mix).
export type ContagionMember = {
  pieceId: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
  placedRow: number | null;
  placedCol: number | null;
};

export type ContagionAnchor = { rowDelta: number; colDelta: number };

export type ContagionResolution =
  | { kind: "no-anchor" }
  | { kind: "conflict" }
  | { kind: "anchored"; anchor: ContagionAnchor };

// Every already-placed member of the merged group must agree on the same
// grid->slot translation — a disagreement means the geometry brought two
// mutually-inconsistent already-placed regions into contact, which
// contradicts AD-3's zero-tolerance fusion rule just as much as a false
// contact would. The only safe response is to abort the whole drop (handled
// by the caller), never a partial contagion — a placed piece can't become a
// "partial" Cluster member (there is no modeled state for it).
export function resolvePlacementAnchor(
  members: readonly ContagionMember[],
): ContagionResolution {
  let anchor: ContagionAnchor | null = null;
  for (const member of members) {
    if (member.placedRow == null || member.placedCol == null) {
      continue;
    }
    const candidate: ContagionAnchor = {
      rowDelta: member.placedRow - member.gridRow,
      colDelta: member.placedCol - member.gridCol,
    };
    if (anchor == null) {
      anchor = candidate;
    } else if (anchor.rowDelta !== candidate.rowDelta || anchor.colDelta !== candidate.colDelta) {
      return { kind: "conflict" };
    }
  }
  return anchor == null ? { kind: "no-anchor" } : { kind: "anchored", anchor };
}

export type ContagionTargets =
  | { valid: true; targets: ReadonlyMap<string, { row: number; col: number }> }
  | { valid: false; reason: "ROTATED_MEMBER" | "OUT_OF_BOUNDS" };

export function computeContagionTargets(
  anchor: ContagionAnchor,
  members: readonly ContagionMember[],
  geom: FrameGeometry,
): ContagionTargets {
  const targets = new Map<string, { row: number; col: number }>();
  for (const member of members) {
    if (member.rotation !== 0) {
      return { valid: false, reason: "ROTATED_MEMBER" };
    }
    const row = member.gridRow + anchor.rowDelta;
    const col = member.gridCol + anchor.colDelta;
    if (!isSlotInBounds(row, col, geom)) {
      return { valid: false, reason: "OUT_OF_BOUNDS" };
    }
    targets.set(member.pieceId, { row, col });
  }
  return { valid: true, targets };
}
