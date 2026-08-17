import { describe, expect, it } from "vitest";
import { computeAdjacency } from "./compute-adjacency";

describe("computeAdjacency", () => {
  it("produces the exact 4 pairs for a 2x2 grid", () => {
    const pairs = computeAdjacency(2, 2);
    expect(pairs).toHaveLength(4);
    expect(pairs).toEqual(
      expect.arrayContaining([
        { row: 0, col: 0, neighborRow: 1, neighborCol: 0 },
        { row: 0, col: 0, neighborRow: 0, neighborCol: 1 },
        { row: 0, col: 1, neighborRow: 1, neighborCol: 1 },
        { row: 1, col: 0, neighborRow: 1, neighborCol: 1 },
      ]),
    );
  });

  it("produces 12 pairs for a 3x3 grid (2 per cell direction, no duplicates)", () => {
    const pairs = computeAdjacency(3, 3);
    // 3x3: 6 horizontal pairs (2 per row * 3 rows) + 6 vertical pairs (2 per col * 3 cols)
    expect(pairs).toHaveLength(12);
  });

  it("never pairs a piece with itself", () => {
    const pairs = computeAdjacency(3, 3);
    for (const pair of pairs) {
      expect(pair.row === pair.neighborRow && pair.col === pair.neighborCol).toBe(false);
    }
  });

  it("never pairs diagonal neighbors", () => {
    const pairs = computeAdjacency(3, 3);
    for (const pair of pairs) {
      const rowDelta = Math.abs(pair.row - pair.neighborRow);
      const colDelta = Math.abs(pair.col - pair.neighborCol);
      expect(rowDelta + colDelta).toBe(1);
    }
  });

  it("returns no pairs for a single-cell grid", () => {
    expect(computeAdjacency(1, 1)).toEqual([]);
  });
});
