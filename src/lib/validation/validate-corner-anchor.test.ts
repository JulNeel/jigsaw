import { describe, expect, it } from "vitest";
import { findCornerAnchor, type AnchorCandidateMember } from "./validate-corner-anchor";
import { frameSlotCenter } from "./frame-geometry";

const geom = { gridRows: 5, gridCols: 5, tileWidth: 100, tileHeight: 100 };

function memberAt(
  gridRow: number,
  gridCol: number,
  overrides: Partial<AnchorCandidateMember> = {},
): AnchorCandidateMember {
  const { x, y } = frameSlotCenter(gridRow, gridCol, geom);
  return {
    pieceId: `piece-${gridRow}-${gridCol}`,
    gridRow,
    gridCol,
    rotation: 0,
    shapeType: "corner",
    screenX: x,
    screenY: y,
    ...overrides,
  };
}

describe("findCornerAnchor", () => {
  it("accepts a corner piece dropped at its own true corner — top-left", () => {
    const member = memberAt(0, 0);
    expect(findCornerAnchor([member], geom)).toEqual({ pieceId: member.pieceId, row: 0, col: 0 });
  });

  it("accepts a corner piece dropped at its own true corner — top-right", () => {
    const member = memberAt(0, 4);
    expect(findCornerAnchor([member], geom)).toEqual({ pieceId: member.pieceId, row: 0, col: 4 });
  });

  it("accepts a corner piece dropped at its own true corner — bottom-left", () => {
    const member = memberAt(4, 0);
    expect(findCornerAnchor([member], geom)).toEqual({ pieceId: member.pieceId, row: 4, col: 0 });
  });

  it("accepts a corner piece dropped at its own true corner — bottom-right", () => {
    const member = memberAt(4, 4);
    expect(findCornerAnchor([member], geom)).toEqual({ pieceId: member.pieceId, row: 4, col: 4 });
  });

  it("rejects the top-left corner piece dropped at the top-right corner slot (headline strictness)", () => {
    // The top-left piece's true grid position is (0,0); its screen position
    // here is placed exactly at the top-right slot's center instead. The
    // old `canBootstrapWithoutNeighbor` accepted any corner-shaped piece at
    // any corner-category slot — this is the exact case the new, stricter
    // check must reject.
    const topLeftPieceAtTopRightSlot = memberAt(0, 0, {
      screenX: frameSlotCenter(0, 4, geom).x,
      screenY: frameSlotCenter(0, 4, geom).y,
    });
    expect(findCornerAnchor([topLeftPieceAtTopRightSlot], geom)).toBeNull();
  });

  it("rejects a rotated corner piece even at its own true corner", () => {
    const member = memberAt(0, 0, { rotation: 90 });
    expect(findCornerAnchor([member], geom)).toBeNull();
  });

  it("rejects an edge piece", () => {
    const member = memberAt(0, 2, { shapeType: "edge" });
    expect(findCornerAnchor([member], geom)).toBeNull();
  });

  it("rejects an interior piece", () => {
    const member = memberAt(2, 2, { shapeType: "interior" });
    expect(findCornerAnchor([member], geom)).toBeNull();
  });

  it("accepts just inside the tolerance window and rejects just outside it", () => {
    const center = frameSlotCenter(0, 0, geom);
    const justInside = memberAt(0, 0, {
      screenX: center.x + geom.tileWidth * 0.7,
      screenY: center.y,
    });
    expect(findCornerAnchor([justInside], geom)).not.toBeNull();

    const justOutside = memberAt(0, 0, {
      screenX: center.x + geom.tileWidth * 0.8,
      screenY: center.y,
    });
    expect(findCornerAnchor([justOutside], geom)).toBeNull();
  });

  it("accepts a multi-member group whose corner member lands on its own corner", () => {
    const cornerMember = memberAt(0, 0);
    const edgeMember = memberAt(0, 1, { shapeType: "edge" });
    expect(findCornerAnchor([edgeMember, cornerMember], geom)).toEqual({
      pieceId: cornerMember.pieceId,
      row: 0,
      col: 0,
    });
  });

  it("rejects when the group's corner member is off by one slot", () => {
    const wrongSpot = memberAt(0, 0, {
      screenX: frameSlotCenter(0, 1, geom).x,
      screenY: frameSlotCenter(0, 1, geom).y,
    });
    expect(findCornerAnchor([wrongSpot], geom)).toBeNull();
  });
});
