import { describe, expect, it } from "vitest";
import { createSeededScatter } from "./seeded-scatter";

describe("createSeededScatter", () => {
  it("produces the same output for the same seed", () => {
    const a = createSeededScatter("room-1", 20, { min: 100, max: 500 });
    const b = createSeededScatter("room-1", 20, { min: 100, max: 500 });
    expect(a).toEqual(b);
  });

  it("produces different output for a different seed", () => {
    const a = createSeededScatter("room-1", 20, { min: 100, max: 500 });
    const b = createSeededScatter("room-2", 20, { min: 100, max: 500 });
    expect(a).not.toEqual(b);
  });

  it("returns the requested number of positions", () => {
    expect(createSeededScatter("room-1", 37, { min: 0, max: 100 })).toHaveLength(37);
  });

  it("keeps every position within the requested radius range", () => {
    const positions = createSeededScatter("room-1", 50, { min: 100, max: 500 });
    for (const { x, y } of positions) {
      const radius = Math.sqrt(x * x + y * y);
      expect(radius).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(radius).toBeLessThanOrEqual(500 + 1e-9);
    }
  });
});
