import { describe, expect, it } from "vitest";
import { predictDropOutcome, type DraggedMember, type PredictablePiece } from "./predict-drop";
import { frameSlotCenter } from "./frame-geometry";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 40;
const geom = { gridRows: 10, gridCols: 10, tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT };
const noClusters = new Map<string, { anchorX: number; anchorY: number }>();

function piece(
  overrides: Partial<PredictablePiece> & { id: string; gridRow: number; gridCol: number },
): PredictablePiece {
  return {
    rotation: 0,
    shapeType: "interior",
    placedRow: null,
    placedCol: null,
    clusterId: null,
    clusterOffsetRow: null,
    clusterOffsetCol: null,
    scatterX: 0,
    scatterY: 0,
    ...overrides,
  };
}

function dragged(
  overrides: Partial<DraggedMember> & { pieceId: string; gridRow: number; gridCol: number },
): DraggedMember {
  return { rotation: 0, shapeType: "interior", screenX: 0, screenY: 0, ...overrides };
}

// `pieces` must include every dragged member too, not just stationary ones
// — `computeTrueNeighborIds` looks a piece up by id in the full list to
// find its own grid position, exactly as `room-canvas.tsx` always passes
// its full, unfiltered live `pieces` snapshot as `knownPieces`.
function draggedAsPiece(m: DraggedMember): PredictablePiece {
  return piece({ id: m.pieceId, gridRow: m.gridRow, gridCol: m.gridCol, rotation: m.rotation, shapeType: m.shapeType });
}

describe("predictDropOutcome — ported free-space fusion cases", () => {
  it("returns 'none' when nothing is brought into contact", () => {
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: 0, screenY: 0 });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [draggedAsPiece(a), piece({ id: "b", gridRow: 0, gridCol: 1, scatterX: 500, scatterY: 500 })],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("none");
    expect(result.candidates).toHaveLength(0);
  });

  it("returns 'fused' when a true right-neighbor is brought into genuine contact", () => {
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: 0, screenY: 0 });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [draggedAsPiece(a), piece({ id: "b", gridRow: 0, gridCol: 1, scatterX: TILE_WIDTH, scatterY: 0 })],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("fused");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].a.pieceId).toBe("a");
    expect(result.candidates[0].b.pieceId).toBe("b");
  });

  it("returns 'false-contact' when two non-true-neighbors are brought into visual contact", () => {
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: 0, screenY: 0 });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [draggedAsPiece(a), piece({ id: "b", gridRow: 5, gridCol: 5, scatterX: TILE_WIDTH, scatterY: 0 })],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("false-contact");
  });

  it("returns 'false-contact' when the dragged piece is rotated off its as-cut orientation", () => {
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, rotation: 90, screenX: 0, screenY: 0 });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [draggedAsPiece(a), piece({ id: "b", gridRow: 0, gridCol: 1, scatterX: TILE_WIDTH, scatterY: 0 })],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("false-contact");
  });

  it("returns 'false-contact' when the stationary piece is rotated off its as-cut orientation", () => {
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: 0, screenY: 0 });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [
        draggedAsPiece(a),
        piece({ id: "b", gridRow: 0, gridCol: 1, rotation: 90, scatterX: TILE_WIDTH, scatterY: 0 }),
      ],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("false-contact");
  });
});

describe("predictDropOutcome — placement contagion", () => {
  it("places an interior piece touching an already-placed true neighbor", () => {
    const bSlot = frameSlotCenter(0, 1, geom);
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: bSlot.x - TILE_WIDTH, screenY: bSlot.y });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [draggedAsPiece(a), piece({ id: "b", gridRow: 0, gridCol: 1, placedRow: 0, placedCol: 1 })],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("placed");
    expect(result.placedSlotByPieceId?.get("a")).toEqual({ row: 0, col: 0 });
  });

  it("never places on a wrong-side contact with an already-placed piece", () => {
    const bSlot = frameSlotCenter(0, 5, geom);
    // "b" is a's true RIGHT neighbor in grid terms, but is made to touch on
    // a's LEFT here — a false contact, must never place regardless of "b"
    // being placed.
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: bSlot.x + TILE_WIDTH, screenY: bSlot.y });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [draggedAsPiece(a), piece({ id: "b", gridRow: 0, gridCol: 1, placedRow: 0, placedCol: 5 })],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("false-contact");
  });

  it("places every member of a dragged multi-piece group touching an already-placed piece", () => {
    const bSlot = frameSlotCenter(0, 2, geom);
    const a2 = dragged({ pieceId: "a2", gridRow: 0, gridCol: 1, screenX: bSlot.x - TILE_WIDTH, screenY: bSlot.y });
    const a1 = dragged({ pieceId: "a1", gridRow: 0, gridCol: 0, screenX: a2.screenX - TILE_WIDTH, screenY: a2.screenY });
    const result = predictDropOutcome({
      draggedMembers: [a1, a2],
      pieces: [draggedAsPiece(a1), draggedAsPiece(a2), piece({ id: "b", gridRow: 0, gridCol: 2, placedRow: 0, placedCol: 2 })],
      excludePieceIds: new Set(["a1", "a2"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("placed");
    expect(result.placedSlotByPieceId?.get("a1")).toEqual({ row: 0, col: 0 });
    expect(result.placedSlotByPieceId?.get("a2")).toEqual({ row: 0, col: 1 });
    expect(result.mergedMemberIds).toEqual(expect.arrayContaining(["a1", "a2", "b"]));
  });

  it("stays 'false-contact' when one of several simultaneous contacts is false (zero tolerance)", () => {
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: 0, screenY: 0 });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [
        draggedAsPiece(a),
        // Genuine true right-neighbor.
        piece({ id: "b", gridRow: 0, gridCol: 1, scatterX: TILE_WIDTH, scatterY: 0 }),
        // Not a true neighbor, touching below.
        piece({ id: "c", gridRow: 9, gridCol: 9, scatterX: 0, scatterY: TILE_HEIGHT }),
      ],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("false-contact");
  });

  it("blocks contagion when the target slot is already occupied by an unrelated piece", () => {
    const bSlot = frameSlotCenter(0, 1, geom);
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: bSlot.x - TILE_WIDTH, screenY: bSlot.y });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [
        draggedAsPiece(a),
        piece({ id: "b", gridRow: 0, gridCol: 1, placedRow: 0, placedCol: 1 }),
        piece({ id: "d", gridRow: 3, gridCol: 3, placedRow: 0, placedCol: 0 }),
      ],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("placement-blocked");
    expect(result.blockedReason).toBe("occupied");
  });

  it("blocks contagion when it would bury a still-loose piece", () => {
    const bSlot = frameSlotCenter(0, 1, geom);
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, screenX: bSlot.x - TILE_WIDTH, screenY: bSlot.y });
    const aTargetSlot = frameSlotCenter(0, 0, geom);
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [
        draggedAsPiece(a),
        piece({ id: "b", gridRow: 0, gridCol: 1, placedRow: 0, placedCol: 1 }),
        piece({ id: "e", gridRow: 4, gridCol: 4, scatterX: aTargetSlot.x, scatterY: aTargetSlot.y }),
      ],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("placement-blocked");
    expect(result.blockedReason).toBe("overlap");
  });

  // The "conflict" outcome (`resolvePlacementAnchor`'s own unit tests in
  // `validate-contagion.test.ts` cover it directly) isn't reachable through
  // a genuine geometric touch here: for two already-placed pieces to
  // register as *genuinely* touching one common dragged point in two
  // different directions, their true-grid-to-slot deltas are necessarily
  // consistent with each other (both anchored to the same dragged point).
  // It only guards against pre-existing data where a placed piece's own
  // `placedRow`/`placedCol` already disagrees with its true grid position
  // — a state the new, stricter corner check (§0 of the redesign) prevents
  // for anything placed going forward, but can't retroactively fix.
});

describe("predictDropOutcome — corner bootstrap", () => {
  it("places a lone corner piece resting at its own true corner, with nothing else placed", () => {
    const corner = frameSlotCenter(0, 0, geom);
    const a = dragged({ pieceId: "a", gridRow: 0, gridCol: 0, shapeType: "corner", screenX: corner.x, screenY: corner.y });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [draggedAsPiece(a)],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("placed");
    expect(result.placedSlotByPieceId?.get("a")).toEqual({ row: 0, col: 0 });
  });

  it("never places a corner piece dropped at the wrong corner", () => {
    const wrongCorner = frameSlotCenter(0, 9, geom);
    const a = dragged({
      pieceId: "a",
      gridRow: 0,
      gridCol: 0,
      shapeType: "corner",
      screenX: wrongCorner.x,
      screenY: wrongCorner.y,
    });
    const result = predictDropOutcome({
      draggedMembers: [a],
      pieces: [draggedAsPiece(a)],
      excludePieceIds: new Set(["a"]),
      clustersById: noClusters,
      geom,
    });
    expect(result.outcome).toBe("none");
  });
});
