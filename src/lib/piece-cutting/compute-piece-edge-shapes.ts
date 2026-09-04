import { hashSeed, mulberry32 } from "./seeded-random";

export type EdgeShapeType = "flat" | "tab" | "blank";

export type EdgeSpec = {
  type: EdgeShapeType;
  // Deterministic per shared edge, in `[0, 1)` — lets the rendering layer
  // (`build-piece-outline-path.ts`) pick one of several bump "profiles"
  // (depth/neck-width/offset) from its own table, purely for visual
  // variety (user request, 2026-09-03: "donner l'impression de diversité").
  // Kept as a raw float rather than an index so this module never needs to
  // know how many profiles exist, or change if that table's size does.
  // Meaningless for a `"flat"` edge.
  profileSeed: number;
};

export type PieceEdgeShapes = {
  top: EdgeSpec;
  right: EdgeSpec;
  bottom: EdgeSpec;
  left: EdgeSpec;
};

const FLAT: EdgeSpec = { type: "flat", profileSeed: 0 };

// Two draws from one freshly-seeded stream (tab-vs-blank, then the profile
// seed) for a given shared edge — both pieces sharing that edge re-derive
// this exact same stream independently (same `roomId`+edge key), so both
// draws agree without either one needing to coordinate with or look up the
// other, exactly like the tab/blank decision alone did before profiles
// existed.
function computeSharedEdge(roomId: string, edgeKey: string): { ownerGetsTab: boolean; profileSeed: number } {
  const random = mulberry32(hashSeed(`${roomId}:edge:${edgeKey}`));
  return { ownerGetsTab: random() < 0.5, profileSeed: random() };
}

// Whichever piece is scanned first in row-major order (smaller row, or same
// row and smaller col) "owns" the coin flip for a shared edge — mirrors
// `computeAdjacency`'s own down/right-only convention. `typeIfOwner`/
// `typeIfNotOwner` let each of the two calling edges (e.g. a piece's own
// "right" vs. its right-neighbor's "left") map the same boolean onto their
// own complementary outcome.
function edgeSpecFor(
  roomId: string,
  edgeKey: string,
  typeIfOwner: EdgeShapeType,
  typeIfNotOwner: EdgeShapeType,
): EdgeSpec {
  const { ownerGetsTab, profileSeed } = computeSharedEdge(roomId, edgeKey);
  return { type: ownerGetsTab ? typeIfOwner : typeIfNotOwner, profileSeed };
}

/**
 * Deterministic, purely visual tab/blank silhouette for one piece's four
 * edges — independent of, and never consulted by, FR6's placement/fusion
 * validation (`classifyPieceShape`/`PieceAdjacency`). A grid-boundary edge
 * (no neighbor on that side) is always `"flat"`. An interior edge is
 * `"tab"` or `"blank"`, computed so every pair of true orthogonal
 * neighbors always gets complementary shapes — and the same `profileSeed`
 * — at their shared edge.
 */
export function computePieceEdgeShapes(
  roomId: string,
  gridRow: number,
  gridCol: number,
  gridRows: number,
  gridCols: number,
): PieceEdgeShapes {
  const top = gridRow === 0 ? FLAT : edgeSpecFor(roomId, `v:${gridRow - 1}:${gridCol}`, "blank", "tab");
  const bottom =
    gridRow === gridRows - 1 ? FLAT : edgeSpecFor(roomId, `v:${gridRow}:${gridCol}`, "tab", "blank");
  const left = gridCol === 0 ? FLAT : edgeSpecFor(roomId, `h:${gridRow}:${gridCol - 1}`, "blank", "tab");
  const right =
    gridCol === gridCols - 1 ? FLAT : edgeSpecFor(roomId, `h:${gridRow}:${gridCol}`, "tab", "blank");

  return { top, right, bottom, left };
}
