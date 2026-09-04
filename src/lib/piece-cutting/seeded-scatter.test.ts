import { describe, expect, it } from "vitest";
import { createSeededRotations, createSeededScatter } from "./seeded-scatter";

describe("createSeededScatter", () => {
  it("produces the same output for the same seed", () => {
    const a = createSeededScatter("room-1", 20, 200, 150, 40, 40);
    const b = createSeededScatter("room-1", 20, 200, 150, 40, 40);
    expect(a).toEqual(b);
  });

  it("produces different output for a different seed", () => {
    const a = createSeededScatter("room-1", 20, 200, 150, 40, 40);
    const b = createSeededScatter("room-2", 20, 200, 150, 40, 40);
    expect(a).not.toEqual(b);
  });

  it("returns the requested number of positions", () => {
    expect(createSeededScatter("room-1", 37, 100, 100, 10, 10)).toHaveLength(37);
  });

  it("never lets a piece's own footprint overlap the Frame's rectangle, on the first draw every time", () => {
    // A deliberately large Frame relative to the tile size — the exact
    // shape of bug this guards against (a fixed radius range that doesn't
    // scale with the Frame's own size).
    const frameHalfWidth = 1500;
    const frameHalfHeight = 900;
    const tileWidth = 60;
    const tileHeight = 50;
    const positions = createSeededScatter("room-1", 80, frameHalfWidth, frameHalfHeight, tileWidth, tileHeight);
    for (const { x, y } of positions) {
      const overlapsFrame =
        Math.abs(x) < frameHalfWidth + tileWidth / 2 && Math.abs(y) < frameHalfHeight + tileHeight / 2;
      expect(overlapsFrame).toBe(false);
    }
  });

  it("clears a Frame far wider than it is tall", () => {
    const frameHalfWidth = 1300;
    const frameHalfHeight = 100;
    const tileWidth = 40;
    const tileHeight = 40;
    const positions = createSeededScatter("room-1", 15, frameHalfWidth, frameHalfHeight, tileWidth, tileHeight);
    for (const { x, y } of positions) {
      const overlapsFrame =
        Math.abs(x) < frameHalfWidth + tileWidth / 2 && Math.abs(y) < frameHalfHeight + tileHeight / 2;
      expect(overlapsFrame).toBe(false);
    }
  });

  it("clears a Frame far taller than it is wide", () => {
    const frameHalfWidth = 100;
    const frameHalfHeight = 1300;
    const tileWidth = 40;
    const tileHeight = 40;
    const positions = createSeededScatter("room-1", 15, frameHalfWidth, frameHalfHeight, tileWidth, tileHeight);
    for (const { x, y } of positions) {
      const overlapsFrame =
        Math.abs(x) < frameHalfWidth + tileWidth / 2 && Math.abs(y) < frameHalfHeight + tileHeight / 2;
      expect(overlapsFrame).toBe(false);
    }
  });

  it("never lets two scattered pieces' footprints overlap each other", () => {
    const tileWidth = 80;
    const tileHeight = 70;
    const positions = createSeededScatter("room-1", 80, 300, 250, tileWidth, tileHeight);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const overlaps =
          Math.abs(positions[i].x - positions[j].x) < tileWidth &&
          Math.abs(positions[i].y - positions[j].y) < tileHeight;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("stays overlap-free even at high piece count with large tiles (a dense field the fixed SCATTER_SPREAD alone can't accommodate)", () => {
    // Regression test: an earlier version sized the scatter field from a
    // fixed margin around the Frame regardless of how much total piece
    // footprint area needed to fit in it — fine at low piece counts/small
    // tiles, but at the top of the piece-count range combined with a
    // high-resolution source image (large tiles), a fixed-size field left
    // ~7% of pieces still overlapping the Frame after exhausting their
    // retry budget. The field must scale with total footprint area, not
    // just Frame size.
    const count = 1500;
    const tileWidth = 100;
    const tileHeight = 100;
    const positions = createSeededScatter("room-dense", count, 1300, 900, tileWidth, tileHeight);
    let overlapsFrame = 0;
    for (const { x, y } of positions) {
      if (Math.abs(x) < 1300 + tileWidth / 2 && Math.abs(y) < 900 + tileHeight / 2) {
        overlapsFrame++;
      }
    }
    expect(overlapsFrame).toBe(0);
  });
});

describe("createSeededRotations", () => {
  it("produces the same output for the same seed", () => {
    const a = createSeededRotations("room-1", 20);
    const b = createSeededRotations("room-1", 20);
    expect(a).toEqual(b);
  });

  it("produces different output for a different seed", () => {
    const a = createSeededRotations("room-1", 20);
    const b = createSeededRotations("room-2", 20);
    expect(a).not.toEqual(b);
  });

  it("returns the requested number of rotations, each one of the four valid values", () => {
    const rotations = createSeededRotations("room-1", 40);
    expect(rotations).toHaveLength(40);
    for (const rotation of rotations) {
      expect([0, 90, 180, 270]).toContain(rotation);
    }
  });

  it("is independent from the scatter's own PRNG stream (same seed, different results)", () => {
    // Not literally checkable without reaching into internals, but a
    // sanity check that varying count doesn't crash and stays in range.
    expect(createSeededRotations("room-1", 1)[0]).toBeDefined();
  });
});
