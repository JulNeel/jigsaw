import type { PieceShapeType } from "@/lib/piece-cutting/classify-piece-shape";
import { frameSlotCenter, isSlotInBounds, type FrameGeometry } from "./frame-geometry";

// The sole remaining absolute-position check in the unified placement
// mechanic (replaces `canBootstrapWithoutNeighbor`, which only verified "a
// corner-shaped piece at a corner-category slot," never *which* of the 4
// real corners it actually was). Corner is the only anchor a group can ever
// place without touching something already placed, and — since placement
// now propagates transitively through fusion with zero further position
// checks (contagion, see `validate-contagion.ts`) — a wrong-corner anchor
// would silently poison an entire quadrant. User-confirmed decision
// (2026-09-12): stricter than the old bootstrap, deliberately at odds with
// FR-6's general "never check the real picture" leniency for this one case.
//
// Deliberately never rounds to "the nearest slot" the way the old
// `nearestFrameSlot` did — it only ever asks "is this member close to *the
// one slot it truly belongs to*," which is what makes wrong-corner rejection
// fall out for free instead of needing a separate identity check.
export const CORNER_SNAP_TOLERANCE_FACTOR = 0.75;

export type AnchorCandidateMember = {
  pieceId: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
  shapeType: PieceShapeType;
  screenX: number;
  screenY: number;
};

export function findCornerAnchor(
  members: readonly AnchorCandidateMember[],
  geom: FrameGeometry,
): { pieceId: string; row: number; col: number } | null {
  for (const member of members) {
    if (member.shapeType !== "corner" || member.rotation !== 0) {
      continue;
    }
    if (!isSlotInBounds(member.gridRow, member.gridCol, geom)) {
      continue;
    }
    const ownCorner = frameSlotCenter(member.gridRow, member.gridCol, geom);
    const dx = member.screenX - ownCorner.x;
    const dy = member.screenY - ownCorner.y;
    if (
      Math.abs(dx) <= geom.tileWidth * CORNER_SNAP_TOLERANCE_FACTOR &&
      Math.abs(dy) <= geom.tileHeight * CORNER_SNAP_TOLERANCE_FACTOR
    ) {
      return { pieceId: member.pieceId, row: member.gridRow, col: member.gridCol };
    }
  }
  return null;
}
