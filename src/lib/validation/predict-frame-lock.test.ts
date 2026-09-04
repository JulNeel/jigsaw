import { describe, expect, it } from "vitest";
import { predictFrameLock, type PredictableKnownPiece } from "./predict-frame-lock";

const GRID_ROWS = 3;
const GRID_COLS = 3;
const TILE_WIDTH = 40;
const TILE_HEIGHT = 40;
const FRAME_WIDTH = GRID_COLS * TILE_WIDTH;
const FRAME_HEIGHT = GRID_ROWS * TILE_HEIGHT;

function baseParams(overrides: {
  knownPieces?: PredictableKnownPiece[];
  otherFreePiecePositions?: { x: number; y: number }[];
  anchorTargetRow?: number;
  anchorTargetCol?: number;
} = {}) {
  return {
    members: [{ pieceId: "dragged", offsetRow: 0, offsetCol: 0 }],
    anchorTargetRow: overrides.anchorTargetRow ?? 0,
    anchorTargetCol: overrides.anchorTargetCol ?? 0,
    gridRows: GRID_ROWS,
    gridCols: GRID_COLS,
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    knownPieces: overrides.knownPieces ?? [],
    otherFreePiecePositions: overrides.otherFreePiecePositions ?? [],
  };
}

function piece(
  id: string,
  gridRow: number,
  gridCol: number,
  shapeType: PredictableKnownPiece["shapeType"],
  opts: { rotation?: number; placedRow?: number | null; placedCol?: number | null } = {},
): PredictableKnownPiece {
  return {
    id,
    gridRow,
    gridCol,
    shapeType,
    rotation: opts.rotation ?? 0,
    placedRow: opts.placedRow ?? null,
    placedCol: opts.placedCol ?? null,
  };
}

describe("predictFrameLock", () => {
  it("locks a corner piece bootstrapping into an empty Frame corner slot (a genuine validation attempt)", () => {
    const dragged = piece("dragged", 0, 0, "corner");
    expect(
      predictFrameLock(
        baseParams({ knownPieces: [dragged], anchorTargetRow: 0, anchorTargetCol: 0 }),
      ),
    ).toEqual({ outcome: "locked" });
  });

  it("is NOT a validation attempt for an interior piece with no already-placed neighbor (physical-puzzle leniency, AD-3)", () => {
    const dragged = piece("dragged", 1, 1, "interior");
    expect(
      predictFrameLock(
        baseParams({ knownPieces: [dragged], anchorTargetRow: 1, anchorTargetCol: 1 }),
      ),
    ).toEqual({ outcome: "not-an-attempt" });
  });

  it("is NOT a validation attempt for a non-corner piece landing on a corner slot with no neighbor", () => {
    // (0,0) is a corner slot in a 3x3 grid, but the dropped piece isn't
    // corner-shaped — this isn't "placing a corner at a corner slot" per
    // the user-confirmed scope decision, so it stays silent rather than
    // treated as a rejected corner attempt.
    const dragged = piece("dragged", 0, 0, "edge");
    expect(
      predictFrameLock(
        baseParams({ knownPieces: [dragged], anchorTargetRow: 0, anchorTargetCol: 0 }),
      ),
    ).toEqual({ outcome: "not-an-attempt" });
  });

  it("locks a piece whose true neighbor is already placed in the matching direction (a genuine validation attempt)", () => {
    // dragged's true grid neighbor to the right (0,1) is already placed at
    // Frame slot (0,1) — dragged targets (0,0), its true right-neighbor.
    const dragged = piece("dragged", 0, 0, "corner");
    const neighbor = piece("neighbor", 0, 1, "edge", { placedRow: 0, placedCol: 1 });
    expect(
      predictFrameLock(
        baseParams({
          knownPieces: [dragged, neighbor],
          anchorTargetRow: 0,
          anchorTargetCol: 0,
        }),
      ),
    ).toEqual({ outcome: "locked" });
  });

  it("rejects (as a genuine attempt) when a placed neighbor occupies the slot but isn't the true neighbor in that direction", () => {
    // "imposter" sits at Frame slot (0,1) (dragged's target right-neighbor
    // slot) but its true grid position is nowhere near dragged's — not a
    // genuine match. Still a validation attempt, since a neighbor is present.
    const dragged = piece("dragged", 0, 0, "corner");
    const imposter = piece("imposter", 2, 2, "interior", { placedRow: 0, placedCol: 1 });
    expect(
      predictFrameLock(
        baseParams({
          knownPieces: [dragged, imposter],
          anchorTargetRow: 0,
          anchorTargetCol: 0,
        }),
      ),
    ).toEqual({ outcome: "rejected" });
  });

  it("is NOT a validation attempt for a target outside the grid bounds", () => {
    const dragged = piece("dragged", 0, 0, "corner");
    expect(
      predictFrameLock(
        baseParams({ knownPieces: [dragged], anchorTargetRow: -1, anchorTargetCol: 0 }),
      ),
    ).toEqual({ outcome: "not-an-attempt" });
  });

  it("rejects (as a genuine corner attempt) a target slot already occupied by another placed piece", () => {
    const dragged = piece("dragged", 0, 0, "corner");
    const occupant = piece("occupant", 5, 5, "interior", { placedRow: 0, placedCol: 0 });
    expect(
      predictFrameLock(
        baseParams({
          knownPieces: [dragged, occupant],
          anchorTargetRow: 0,
          anchorTargetCol: 0,
        }),
      ),
    ).toEqual({ outcome: "rejected" });
  });

  it("rejects (as a genuine attempt) a non-corner piece dropped exactly on an already-occupied slot with no adjacent neighbor placed yet — code review fix", () => {
    // Regression test for a real gap the second code review round found:
    // a non-corner piece landing squarely on an occupied slot used to fall
    // through to "not-an-attempt" (silently, no red pulse) whenever nothing
    // was placed *adjacent* to that slot yet, even though the exact-slot
    // occupancy itself is an unambiguous, always-genuine rejection.
    const dragged = piece("dragged", 4, 4, "interior");
    const occupant = piece("occupant", 0, 0, "corner", { placedRow: 1, placedCol: 1 });
    expect(
      predictFrameLock(
        baseParams({
          knownPieces: [dragged, occupant],
          anchorTargetRow: 1,
          anchorTargetCol: 1,
        }),
      ),
    ).toEqual({ outcome: "rejected" });
  });

  it("reports 'overlap' (not a plain rejection) for a lock that would bury a loose piece resting near the target slot", () => {
    const dragged = piece("dragged", 0, 0, "corner");
    // Slot (0,0) center is at (-FRAME_WIDTH/2 + TILE_WIDTH/2, -FRAME_HEIGHT/2 + TILE_HEIGHT/2).
    const slotCenterX = -FRAME_WIDTH / 2 + TILE_WIDTH / 2;
    const slotCenterY = -FRAME_HEIGHT / 2 + TILE_HEIGHT / 2;
    expect(
      predictFrameLock(
        baseParams({
          knownPieces: [dragged],
          otherFreePiecePositions: [{ x: slotCenterX, y: slotCenterY }],
          anchorTargetRow: 0,
          anchorTargetCol: 0,
        }),
      ),
    ).toEqual({ outcome: "overlap" });
  });

  it("is NOT a validation attempt for a shape/target-slot category mismatch with no neighbor", () => {
    // (1,1) in a 3x3 grid is the interior slot — an edge-shaped piece
    // there is a mismatch, but with no neighbor and not a corner scenario,
    // this stays silent rather than a rejection.
    const dragged = piece("dragged", 1, 1, "edge");
    expect(
      predictFrameLock(
        baseParams({ knownPieces: [dragged], anchorTargetRow: 1, anchorTargetCol: 1 }),
      ),
    ).toEqual({ outcome: "not-an-attempt" });
  });

  it("rejects (as a genuine corner attempt) a rotated corner piece at a corner slot", () => {
    const dragged = piece("dragged", 0, 0, "corner", { rotation: 90 });
    expect(
      predictFrameLock(
        baseParams({ knownPieces: [dragged], anchorTargetRow: 0, anchorTargetCol: 0 }),
      ),
    ).toEqual({ outcome: "rejected" });
  });
});
