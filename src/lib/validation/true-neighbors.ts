// The single canonical source for the up/down/left/right ↔ row/col-delta
// convention — reused by `validate-fusion.ts` (the sole contact/fusion
// check, since Story 3.19 unified placement and free-space fusion into one
// mechanic) and `validate-contagion.ts`. Both ultimately ask the same
// question ("is the piece touching me in direction X really my true
// neighbor in that exact direction?"), just in different coordinate spaces.
export type OrthogonalDirection = "up" | "down" | "left" | "right";

export const DIRECTION_OFFSETS: Record<OrthogonalDirection, { row: number; col: number }> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

// Deliberately independent of Postgres/`piece_adjacency` — pure enough to
// run identically server-side (if ever wired there) and client-side (Story
// 3.11), fed only by each piece's true grid position, now included in the
// Room's client payload.
export type GridPositioned = { id: string; gridRow: number; gridCol: number };

// Mirrors `compute-adjacency.ts`'s own rule exactly (orthogonal grid deltas,
// nothing else) — this app's cutting algorithm never produces a "true
// neighbor" that isn't a plain grid neighbor, so there is no need to also
// ship the `piece_adjacency` table itself to the client. See
// `true-neighbors.test.ts` for the regression test that keeps this
// equivalence honest against future changes to the cutting algorithm.
export function computeTrueNeighborsByDirection(
  piece: GridPositioned,
  allPieces: readonly GridPositioned[],
): Partial<Record<OrthogonalDirection, string>> {
  const result: Partial<Record<OrthogonalDirection, string>> = {};
  for (const direction of Object.keys(DIRECTION_OFFSETS) as OrthogonalDirection[]) {
    const { row: rowOffset, col: colOffset } = DIRECTION_OFFSETS[direction];
    const targetRow = piece.gridRow + rowOffset;
    const targetCol = piece.gridCol + colOffset;
    const neighbor = allPieces.find(
      (p) => p.gridRow === targetRow && p.gridCol === targetCol,
    );
    if (neighbor) {
      result[direction] = neighbor.id;
    }
  }
  return result;
}

export function computeTrueNeighborIds(
  pieceId: string,
  allPieces: readonly GridPositioned[],
): ReadonlySet<string> {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) {
    return new Set();
  }
  return new Set(Object.values(computeTrueNeighborsByDirection(piece, allPieces)));
}
