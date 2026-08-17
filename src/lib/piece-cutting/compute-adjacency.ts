export type GridAdjacencyPair = {
  row: number;
  col: number;
  neighborRow: number;
  neighborCol: number;
};

/**
 * Orthogonal grid neighbors only (up/down/left/right, no diagonals) —
 * true neighbors for a plain rectangular cut. Each pair is emitted once
 * (row-major scan, only considering "down" and "right" neighbors avoids
 * duplicates).
 */
export function computeAdjacency(rows: number, cols: number): GridAdjacencyPair[] {
  const pairs: GridAdjacencyPair[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row + 1 < rows) {
        pairs.push({ row, col, neighborRow: row + 1, neighborCol: col });
      }
      if (col + 1 < cols) {
        pairs.push({ row, col, neighborRow: row, neighborCol: col + 1 });
      }
    }
  }

  return pairs;
}
