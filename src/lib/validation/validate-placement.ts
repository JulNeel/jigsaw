import { classifyPieceShape, type PieceShapeType } from "@/lib/piece-cutting/classify-piece-shape";

export type PlacementRejectionReason = "ROTATION_INVALID" | "SHAPE_MISMATCH" | "NEIGHBOR_MISMATCH";

export type PlacementValidationResult =
  | { valid: true }
  | { valid: false; reason: PlacementRejectionReason };

// Orientation + shape-category check only — no position/adjacency data
// needed. Never checks a piece's *position* (FR-6: never against the source
// image) — only whether it looks right (rotation === 0, its as-cut
// orientation) and whether its shape category fits the target slot.
export function validatePieceOrientationAndShape(
  pieceShapeType: PieceShapeType,
  rotation: number,
  targetRow: number,
  targetCol: number,
  gridRows: number,
  gridCols: number,
): PlacementValidationResult {
  if (rotation !== 0) {
    return { valid: false, reason: "ROTATION_INVALID" };
  }
  const targetShapeType = classifyPieceShape(targetRow, targetCol, gridRows, gridCols);
  if (targetShapeType !== pieceShapeType) {
    return { valid: false, reason: "SHAPE_MISMATCH" };
  }
  return { valid: true };
}

export type OrthogonalDirection = "up" | "down" | "left" | "right";

const DIRECTION_OFFSETS: Record<OrthogonalDirection, readonly [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

// Given, for each orthogonal direction, which piece (if any) is *truly* the
// piece's neighbor in that specific direction (from PieceAdjacency's graph
// combined with each neighbor's own true grid position — never just "is it
// a true neighbor at all"), and a map of "row,col" -> placed piece ID for
// the piece's 4 target-slot neighbors, checks every occupied neighboring
// slot holds *that direction's* true neighbor, not merely any true
// neighbor of the piece from a different direction. `piece_adjacency` is
// undirected — without this per-direction check, a piece whose true left-
// neighbor and true top-neighbor exist could be accepted with those two
// swapped (the left-neighbor sitting to its right, say), since both are
// still members of its true-neighbor set; only checking the *specific*
// direction each occupied slot represents catches that. An unoccupied
// neighboring slot is not a failure — FR-6's "a Corner piece can sit in
// the wrong corner until tested" only becomes a rejection once a real
// (non-matching, or wrongly-directed) piece is actually adjacent to it.
export function validatePlacementNeighbors(
  trueNeighborsByDirection: Partial<Record<OrthogonalDirection, string>>,
  occupiedAdjacentSlots: ReadonlyMap<string, string>,
  targetRow: number,
  targetCol: number,
): PlacementValidationResult {
  for (const direction of Object.keys(DIRECTION_OFFSETS) as OrthogonalDirection[]) {
    const [rowOffset, colOffset] = DIRECTION_OFFSETS[direction];
    const key = `${targetRow + rowOffset},${targetCol + colOffset}`;
    const occupyingPieceId = occupiedAdjacentSlots.get(key);
    if (occupyingPieceId === undefined) {
      continue;
    }
    if (occupyingPieceId !== trueNeighborsByDirection[direction]) {
      return { valid: false, reason: "NEIGHBOR_MISMATCH" };
    }
  }
  return { valid: true };
}

// AD-3's 2026-08-30 amendment: bootstrap leniency (locking a piece/Cluster
// into the Frame with *zero* already-validated neighbor anywhere in the
// group to test against) is reserved for a genuine corner — one of exactly
// four unambiguous anchors in the whole Frame. This function only decides
// *that* zero-neighbor case; `placePiece` (its only caller) reserves it for
// exactly that — once *any* member of the group touches an already-placed
// Frame neighbor, validation instead runs per-member via
// `validatePlacementNeighbors` below, which — by the same transitive
// reasoning as the corner case — lets the rest of an internally-consistent
// group (already zero-tolerance-fused per Story 3.8) pass without each one
// individually touching a placed neighbor too: once one member's absolute
// position is confirmed (whether via a corner or a genuine Frame-neighbor
// match), every other member's follows from its own already-validated
// relative offset. Position is never directly verifiable anyway, only
// inferred through validated adjacency — requiring redundant direct
// confirmation from every member would add nothing.
//
// Safety here also depends on `placePiece` having already run
// `validatePieceOrientationAndShape` for every member *before* reaching
// this check — that's what guarantees a `true` result here corresponds to
// a real corner slot, not just a piece whose shape category happens to be
// `"corner"` in the abstract. That ordering is enforced by `placePiece`'s
// own sequence, not by this function; if the two are ever decoupled (a
// different call site, a reordered validation loop), this contract would
// need to be re-verified rather than assumed.
export function canBootstrapWithoutNeighbor(memberShapeTypes: readonly PieceShapeType[]): boolean {
  return memberShapeTypes.some((shapeType) => shapeType === "corner");
}
