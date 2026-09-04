import { describe, expect, it } from "vitest";
import { predictFusionOutcome } from "./predict-fusion";

const TILE_WIDTH = 40;
const TILE_HEIGHT = 40;

describe("predictFusionOutcome", () => {
  it("returns 'none' when nothing is brought into contact", () => {
    const outcome = predictFusionOutcome({
      draggedMembers: [
        { pieceId: "a", gridRow: 0, gridCol: 0, rotation: 0, screenX: 0, screenY: 0 },
      ],
      stationaryMembers: [
        { pieceId: "b", gridRow: 0, gridCol: 1, rotation: 0, screenX: 500, screenY: 500 },
      ],
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      knownPieces: [
        { id: "a", gridRow: 0, gridCol: 0 },
        { id: "b", gridRow: 0, gridCol: 1 },
      ],
    });
    expect(outcome).toBe("none");
  });

  it("returns 'genuine' when a true right-neighbor is brought into genuine contact", () => {
    const outcome = predictFusionOutcome({
      draggedMembers: [
        { pieceId: "a", gridRow: 0, gridCol: 0, rotation: 0, screenX: 0, screenY: 0 },
      ],
      stationaryMembers: [
        { pieceId: "b", gridRow: 0, gridCol: 1, rotation: 0, screenX: TILE_WIDTH, screenY: 0 },
      ],
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      knownPieces: [
        { id: "a", gridRow: 0, gridCol: 0 },
        { id: "b", gridRow: 0, gridCol: 1 },
      ],
    });
    expect(outcome).toBe("genuine");
  });

  it("returns 'false-contact' when two non-true-neighbors are brought into visual contact", () => {
    const outcome = predictFusionOutcome({
      draggedMembers: [
        { pieceId: "a", gridRow: 0, gridCol: 0, rotation: 0, screenX: 0, screenY: 0 },
      ],
      stationaryMembers: [
        { pieceId: "b", gridRow: 5, gridCol: 5, rotation: 0, screenX: TILE_WIDTH, screenY: 0 },
      ],
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      knownPieces: [
        { id: "a", gridRow: 0, gridCol: 0 },
        { id: "b", gridRow: 5, gridCol: 5 },
      ],
    });
    expect(outcome).toBe("false-contact");
  });

  it("returns 'false-contact' when a genuine neighbor is touched but the dragged piece is rotated off its as-cut orientation", () => {
    const outcome = predictFusionOutcome({
      draggedMembers: [
        { pieceId: "a", gridRow: 0, gridCol: 0, rotation: 90, screenX: 0, screenY: 0 },
      ],
      stationaryMembers: [
        { pieceId: "b", gridRow: 0, gridCol: 1, rotation: 0, screenX: TILE_WIDTH, screenY: 0 },
      ],
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      knownPieces: [
        { id: "a", gridRow: 0, gridCol: 0 },
        { id: "b", gridRow: 0, gridCol: 1 },
      ],
    });
    expect(outcome).toBe("false-contact");
  });

  it("returns 'false-contact' when a genuine neighbor is touched but the stationary piece is rotated off its as-cut orientation", () => {
    // Code review fix: the symmetric case of the test above — only the
    // *dragged* piece's rotation was previously exercised, even though
    // `isGenuineContact` (validate-fusion.ts) checks both sides.
    const outcome = predictFusionOutcome({
      draggedMembers: [
        { pieceId: "a", gridRow: 0, gridCol: 0, rotation: 0, screenX: 0, screenY: 0 },
      ],
      stationaryMembers: [
        { pieceId: "b", gridRow: 0, gridCol: 1, rotation: 90, screenX: TILE_WIDTH, screenY: 0 },
      ],
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      knownPieces: [
        { id: "a", gridRow: 0, gridCol: 0 },
        { id: "b", gridRow: 0, gridCol: 1 },
      ],
    });
    expect(outcome).toBe("false-contact");
  });
});
