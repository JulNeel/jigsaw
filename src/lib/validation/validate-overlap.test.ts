import { describe, expect, it } from "vitest";
import { overlapsAnyFreePiece } from "./validate-overlap";

describe("overlapsAnyFreePiece", () => {
  const tileWidth = 100;
  const tileHeight = 80;

  it("returns false when nothing is nearby", () => {
    expect(
      overlapsAnyFreePiece({ x: 0, y: 0 }, [{ x: 500, y: 500 }], tileWidth, tileHeight),
    ).toBe(false);
  });

  it("returns true when a free piece sits exactly on the slot center", () => {
    expect(overlapsAnyFreePiece({ x: 0, y: 0 }, [{ x: 0, y: 0 }], tileWidth, tileHeight)).toBe(
      true,
    );
  });

  it("returns true for a partial pixel overlap, not just an exact coincidence", () => {
    // Half a tile-width off in x, well within a tile-height in y — the two
    // tile-sized rectangles still genuinely overlap.
    expect(
      overlapsAnyFreePiece({ x: 0, y: 0 }, [{ x: tileWidth / 2, y: 10 }], tileWidth, tileHeight),
    ).toBe(true);
  });

  it("returns false once a free piece clears a full tile-width away", () => {
    expect(
      overlapsAnyFreePiece({ x: 0, y: 0 }, [{ x: tileWidth, y: 0 }], tileWidth, tileHeight),
    ).toBe(false);
  });

  it("returns false once a free piece clears a full tile-height away", () => {
    expect(
      overlapsAnyFreePiece({ x: 0, y: 0 }, [{ x: 0, y: tileHeight }], tileWidth, tileHeight),
    ).toBe(false);
  });

  it("returns true if any one of several other pieces overlaps", () => {
    expect(
      overlapsAnyFreePiece(
        { x: 0, y: 0 },
        [
          { x: 1000, y: 1000 },
          { x: 20, y: 10 },
          { x: -900, y: 400 },
        ],
        tileWidth,
        tileHeight,
      ),
    ).toBe(true);
  });
});
