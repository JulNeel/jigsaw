export type PieceShapeType = "corner" | "edge" | "interior";

/**
 * Grid-position classification (not a visual tab/blank curve — see Story
 * 2.4 Dev Notes: V1 cuts plain rectangular pieces).
 */
export function classifyPieceShape(
  row: number,
  col: number,
  rows: number,
  cols: number,
): PieceShapeType {
  const isRowBoundary = row === 0 || row === rows - 1;
  const isColBoundary = col === 0 || col === cols - 1;

  if (isRowBoundary && isColBoundary) {
    return "corner";
  }
  if (isRowBoundary || isColBoundary) {
    return "edge";
  }
  return "interior";
}
