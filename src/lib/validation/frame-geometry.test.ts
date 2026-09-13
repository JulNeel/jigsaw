import { describe, expect, it } from "vitest";
import { frameSlotCenter, isSlotInBounds } from "./frame-geometry";

const geom = { gridRows: 4, gridCols: 5, tileWidth: 100, tileHeight: 80 };

describe("frameSlotCenter", () => {
  it("centers slot (0,0) at the top-left corner of the centered-on-origin frame", () => {
    // frameWidth = 500, frameHeight = 320 — pinning the formula previously
    // inlined identically in `placePiece`, `predictFrameLock`, and
    // `pieceRenderPosition`, so this extraction is provably behavior-
    // preserving.
    expect(frameSlotCenter(0, 0, geom)).toEqual({ x: -250 + 50, y: -160 + 40 });
  });

  it("centers the bottom-right slot correctly", () => {
    expect(frameSlotCenter(3, 4, geom)).toEqual({
      x: -250 + 4 * 100 + 50,
      y: -160 + 3 * 80 + 40,
    });
  });

  it("centers a mid slot correctly", () => {
    expect(frameSlotCenter(2, 3, geom)).toEqual({
      x: -250 + 3 * 100 + 50,
      y: -160 + 2 * 80 + 40,
    });
  });
});

describe("isSlotInBounds", () => {
  it("accepts every corner of the grid", () => {
    expect(isSlotInBounds(0, 0, geom)).toBe(true);
    expect(isSlotInBounds(0, 4, geom)).toBe(true);
    expect(isSlotInBounds(3, 0, geom)).toBe(true);
    expect(isSlotInBounds(3, 4, geom)).toBe(true);
  });

  it("rejects a row/col one past either edge", () => {
    expect(isSlotInBounds(-1, 0, geom)).toBe(false);
    expect(isSlotInBounds(4, 0, geom)).toBe(false);
    expect(isSlotInBounds(0, -1, geom)).toBe(false);
    expect(isSlotInBounds(0, 5, geom)).toBe(false);
  });

  it("rejects a non-integer row or col", () => {
    expect(isSlotInBounds(1.5, 0, geom)).toBe(false);
    expect(isSlotInBounds(0, 2.5, geom)).toBe(false);
  });
});
