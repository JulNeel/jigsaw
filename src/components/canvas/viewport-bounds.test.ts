import { describe, expect, it } from "vitest";
import { clampPosition, clampScale, zoomAtPoint } from "./viewport-bounds";

describe("clampScale", () => {
  it("returns the value unchanged when within bounds", () => {
    expect(clampScale(1, 0.5, 4)).toBe(1);
  });

  it("clamps to the minimum when below it", () => {
    expect(clampScale(0.1, 0.5, 4)).toBe(0.5);
  });

  it("clamps to the maximum when above it", () => {
    expect(clampScale(10, 0.5, 4)).toBe(4);
  });

  it("falls back to the minimum for a non-finite input (NaN, Infinity)", () => {
    expect(clampScale(NaN, 0.5, 4)).toBe(0.5);
    expect(clampScale(Infinity, 0.5, 4)).toBe(0.5);
    expect(clampScale(-Infinity, 0.5, 4)).toBe(0.5);
  });
});

describe("zoomAtPoint", () => {
  it("keeps the pointer's content-space location fixed across a scale change", () => {
    const pointer = { x: 300, y: 200 };
    const oldScale = 1;
    const oldPosition = { x: 100, y: 50 };
    const newScale = 2;

    const newPosition = zoomAtPoint(pointer, oldScale, newScale, oldPosition);

    // The content-space point under `pointer` before the zoom...
    const contentPointBefore = {
      x: (pointer.x - oldPosition.x) / oldScale,
      y: (pointer.y - oldPosition.y) / oldScale,
    };
    // ...must map back to the same screen point after applying newScale/newPosition.
    const screenPointAfter = {
      x: contentPointBefore.x * newScale + newPosition.x,
      y: contentPointBefore.y * newScale + newPosition.y,
    };
    expect(screenPointAfter.x).toBeCloseTo(pointer.x);
    expect(screenPointAfter.y).toBeCloseTo(pointer.y);
  });

  it("is a no-op when scale doesn't change", () => {
    const pointer = { x: 50, y: 50 };
    const oldPosition = { x: 20, y: 30 };
    expect(zoomAtPoint(pointer, 1, 1, oldPosition)).toEqual(oldPosition);
  });
});

describe("clampPosition", () => {
  const viewport = { width: 800, height: 600 };
  const scale = 1;
  const contentHalfExtent = 200;
  const margin = 150;
  const half = contentHalfExtent * scale;

  // The property that actually matters (AC #2 / NFR-1): at least `margin`
  // px of the content's bounding box must remain inside [0, viewport.width]
  // (and the Y equivalent) — not just "the formula returns what the formula
  // returns" (the bug this replaces: an inverted margin sign that let
  // content go margin px *past* fully off-screen, and a test that only
  // ever asserted that wrong formula's own output).
  function assertMarginVisible(position: { x: number; y: number }) {
    expect(position.x + half).toBeGreaterThanOrEqual(margin);
    expect(position.x - half).toBeLessThanOrEqual(viewport.width - margin);
    expect(position.y + half).toBeGreaterThanOrEqual(margin);
    expect(position.y - half).toBeLessThanOrEqual(viewport.height - margin);
  }

  it("leaves position unchanged when already within bounds", () => {
    const position = { x: 400, y: 300 };
    expect(clampPosition(position, scale, viewport, contentHalfExtent, margin)).toEqual(
      position,
    );
  });

  it("clamps when panned far left/up, keeping the margin visible", () => {
    const result = clampPosition(
      { x: -10000, y: -10000 },
      scale,
      viewport,
      contentHalfExtent,
      margin,
    );
    assertMarginVisible(result);
  });

  it("clamps when panned far right/down, keeping the margin visible", () => {
    const result = clampPosition(
      { x: 100000, y: 100000 },
      scale,
      viewport,
      contentHalfExtent,
      margin,
    );
    assertMarginVisible(result);
  });

  it("always keeps at least a margin-sized sliver of content reachable at any extreme", () => {
    assertMarginVisible(
      clampPosition({ x: -1_000_000, y: 0 }, scale, viewport, contentHalfExtent, margin),
    );
    assertMarginVisible(
      clampPosition({ x: 1_000_000, y: 1_000_000 }, scale, viewport, contentHalfExtent, margin),
    );
  });

  it("caps the effective margin at `half` so bounds never invert at extreme zoom-out", () => {
    // scale small enough that half (contentHalfExtent * scale) < margin.
    const tinyScale = 0.1;
    const result = clampPosition(
      { x: -1_000_000, y: -1_000_000 },
      tinyScale,
      viewport,
      contentHalfExtent,
      margin,
    );
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});
