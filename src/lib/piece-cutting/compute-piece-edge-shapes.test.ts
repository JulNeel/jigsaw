import { describe, expect, it } from "vitest";
import { computePieceEdgeShapes } from "./compute-piece-edge-shapes";

describe("computePieceEdgeShapes", () => {
  it("is deterministic: same room/grid/position always produces the same output", () => {
    const a = computePieceEdgeShapes("room-1", 2, 2, 5, 5);
    const b = computePieceEdgeShapes("room-1", 2, 2, 5, 5);
    expect(a).toEqual(b);
  });

  it("gives a different silhouette for a different seed", () => {
    const a = computePieceEdgeShapes("room-1", 2, 2, 5, 5);
    const b = computePieceEdgeShapes("room-2", 2, 2, 5, 5);
    expect(a).not.toEqual(b);
  });

  it("marks every grid-boundary edge as flat, never tab/blank", () => {
    const rows = 4;
    const cols = 5;
    // Corner piece: top and left are both boundary edges.
    const topLeft = computePieceEdgeShapes("room-1", 0, 0, rows, cols);
    expect(topLeft.top.type).toBe("flat");
    expect(topLeft.left.type).toBe("flat");
    expect(topLeft.right.type).not.toBe("flat");
    expect(topLeft.bottom.type).not.toBe("flat");

    // Bottom-right corner: bottom and right are boundary edges.
    const bottomRight = computePieceEdgeShapes("room-1", rows - 1, cols - 1, rows, cols);
    expect(bottomRight.bottom.type).toBe("flat");
    expect(bottomRight.right.type).toBe("flat");
  });

  it("gives every interior edge a complementary shape AND the same profile between true neighbors", () => {
    const rows = 6;
    const cols = 6;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const piece = computePieceEdgeShapes("room-complementary", row, col, rows, cols);

        if (col + 1 < cols) {
          const rightNeighbor = computePieceEdgeShapes("room-complementary", row, col + 1, rows, cols);
          expect(piece.right.type).not.toBe("flat");
          expect(rightNeighbor.left.type).not.toBe("flat");
          expect(piece.right.type).not.toBe(rightNeighbor.left.type);
          // Same shared edge must pick the same visual profile on both
          // sides, or the tab and its complementary blank wouldn't
          // actually match in size/position.
          expect(piece.right.profileSeed).toBe(rightNeighbor.left.profileSeed);
        }
        if (row + 1 < rows) {
          const belowNeighbor = computePieceEdgeShapes("room-complementary", row + 1, col, rows, cols);
          expect(piece.bottom.type).not.toBe("flat");
          expect(belowNeighbor.top.type).not.toBe("flat");
          expect(piece.bottom.type).not.toBe(belowNeighbor.top.type);
          expect(piece.bottom.profileSeed).toBe(belowNeighbor.top.profileSeed);
        }
      }
    }
  });

  it("only ever produces the three known edge shapes, with a profileSeed in [0, 1)", () => {
    const shapes = computePieceEdgeShapes("room-1", 1, 1, 4, 4);
    for (const spec of Object.values(shapes)) {
      expect(["flat", "tab", "blank"]).toContain(spec.type);
      expect(spec.profileSeed).toBeGreaterThanOrEqual(0);
      expect(spec.profileSeed).toBeLessThan(1);
    }
  });

  it("varies the profile seed across different edges (not the same bump everywhere)", () => {
    const rows = 6;
    const cols = 6;
    const seeds = new Set<number>();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const piece = computePieceEdgeShapes("room-variety", row, col, rows, cols);
        for (const spec of Object.values(piece)) {
          if (spec.type !== "flat") {
            seeds.add(spec.profileSeed);
          }
        }
      }
    }
    expect(seeds.size).toBeGreaterThan(1);
  });

  it("handles a 1-row or 1-column grid (every edge is a boundary edge)", () => {
    const singleRow = computePieceEdgeShapes("room-1", 0, 2, 1, 5);
    expect(singleRow.top.type).toBe("flat");
    expect(singleRow.bottom.type).toBe("flat");

    const singleCol = computePieceEdgeShapes("room-1", 2, 0, 5, 1);
    expect(singleCol.left.type).toBe("flat");
    expect(singleCol.right.type).toBe("flat");
  });
});
