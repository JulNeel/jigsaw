import type { ScreenPoint } from "./validate-overlap";

// The Frame-slot-to-screen-coordinate formula, previously duplicated three
// times (`placePiece`'s `slotCenters`, `predictFrameLock`'s `slotCenters`,
// `pieceRenderPosition` in `room-canvas.tsx`) — centered-on-origin
// convention established in Story 3.1. Extracted so the server can also
// compute an already-placed piece's screen position (needed once placed
// pieces become valid fusion/contagion targets), never risking the three
// copies drifting apart.
export type FrameGeometry = {
  gridRows: number;
  gridCols: number;
  tileWidth: number;
  tileHeight: number;
};

export function frameSlotCenter(row: number, col: number, geom: FrameGeometry): ScreenPoint {
  const frameWidth = geom.gridCols * geom.tileWidth;
  const frameHeight = geom.gridRows * geom.tileHeight;
  return {
    x: -frameWidth / 2 + col * geom.tileWidth + geom.tileWidth / 2,
    y: -frameHeight / 2 + row * geom.tileHeight + geom.tileHeight / 2,
  };
}

export function isSlotInBounds(row: number, col: number, geom: FrameGeometry): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < geom.gridRows &&
    col >= 0 &&
    col < geom.gridCols
  );
}
