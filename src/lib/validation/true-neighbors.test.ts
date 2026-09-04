import { describe, expect, it } from "vitest";
import { computeAdjacency } from "@/lib/piece-cutting/compute-adjacency";
import { computeTrueNeighborIds, computeTrueNeighborsByDirection, type GridPositioned } from "./true-neighbors";

function makeGrid(rows: number, cols: number): GridPositioned[] {
  const pieces: GridPositioned[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      pieces.push({ id: `${row},${col}`, gridRow: row, gridCol: col });
    }
  }
  return pieces;
}

describe("computeTrueNeighborIds vs. compute-adjacency's server-side pairs", () => {
  it("agrees exactly with computeAdjacency for a representative grid", () => {
    const rows = 4;
    const cols = 5;
    const pieces = makeGrid(rows, cols);

    // Reconstruct the same undirected pair set computeAdjacency produces
    // server-side (the source of truth `piece_adjacency` is populated
    // from), then compare it against this module's independently-derived
    // neighbor sets — this is the regression test Story 3.11's Dev Notes
    // promise, guarding the "true neighbor ⟺ grid-adjacent" assumption the
    // whole client-side prediction feature depends on.
    const expectedPairs = new Set<string>();
    for (const pair of computeAdjacency(rows, cols)) {
      const a = `${pair.row},${pair.col}`;
      const b = `${pair.neighborRow},${pair.neighborCol}`;
      expectedPairs.add([a, b].sort().join("|"));
    }

    const actualPairs = new Set<string>();
    for (const piece of pieces) {
      const neighborIds = computeTrueNeighborIds(piece.id, pieces);
      for (const neighborId of neighborIds) {
        actualPairs.add([piece.id, neighborId].sort().join("|"));
      }
    }

    expect(actualPairs).toEqual(expectedPairs);
  });

  it("finds no neighbors for a 1x1 grid", () => {
    const pieces = makeGrid(1, 1);
    expect(computeTrueNeighborIds("0,0", pieces)).toEqual(new Set());
  });

  it("returns an empty set for an unknown piece id", () => {
    const pieces = makeGrid(2, 2);
    expect(computeTrueNeighborIds("does-not-exist", pieces)).toEqual(new Set());
  });
});

describe("computeTrueNeighborsByDirection", () => {
  it("assigns each neighbor to the correct cardinal direction", () => {
    const pieces = makeGrid(3, 3);
    const center = pieces.find((p) => p.id === "1,1")!;
    expect(computeTrueNeighborsByDirection(center, pieces)).toEqual({
      up: "0,1",
      down: "2,1",
      left: "1,0",
      right: "1,2",
    });
  });

  it("omits a direction with no neighbor (grid edge/corner)", () => {
    const pieces = makeGrid(3, 3);
    const corner = pieces.find((p) => p.id === "0,0")!;
    expect(computeTrueNeighborsByDirection(corner, pieces)).toEqual({
      down: "1,0",
      right: "0,1",
    });
  });
});
