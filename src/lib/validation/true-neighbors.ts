import type { OrthogonalDirection } from "./validate-placement";

// Deliberately independent of Postgres/`piece_adjacency` — pure enough to
// run identically server-side (if ever wired there) and client-side (Story
// 3.11), fed only by each piece's true grid position, now included in the
// Room's client payload.
export type GridPositioned = { id: string; gridRow: number; gridCol: number };

const DIRECTION_OFFSETS: Record<OrthogonalDirection, readonly [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

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
    const [rowOffset, colOffset] = DIRECTION_OFFSETS[direction];
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
