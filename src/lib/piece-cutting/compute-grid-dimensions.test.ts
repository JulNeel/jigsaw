import { describe, expect, it } from "vitest";
import { computeGridDimensions } from "./compute-grid-dimensions";

describe("computeGridDimensions", () => {
  it("computes a roughly square grid for a square aspect ratio", () => {
    const { rows, cols } = computeGridDimensions(100, 1);
    expect(rows * cols).toBeGreaterThan(80);
    expect(rows * cols).toBeLessThan(120);
    expect(Math.abs(rows - cols)).toBeLessThanOrEqual(1);
  });

  it("computes more columns than rows for a wide aspect ratio", () => {
    const { rows, cols } = computeGridDimensions(500, 16 / 9);
    expect(cols).toBeGreaterThan(rows);
  });

  it("computes more rows than columns for a tall aspect ratio", () => {
    const { rows, cols } = computeGridDimensions(500, 9 / 16);
    expect(rows).toBeGreaterThan(cols);
  });

  it("never returns less than 1 row or column", () => {
    const { rows, cols } = computeGridDimensions(1, 100);
    expect(rows).toBeGreaterThanOrEqual(1);
    expect(cols).toBeGreaterThanOrEqual(1);
  });

  it("throws for a non-positive piece count", () => {
    expect(() => computeGridDimensions(0, 1)).toThrow();
    expect(() => computeGridDimensions(-5, 1)).toThrow();
  });

  it("throws for a non-finite aspect ratio", () => {
    expect(() => computeGridDimensions(100, NaN)).toThrow();
    expect(() => computeGridDimensions(100, Infinity)).toThrow();
    expect(() => computeGridDimensions(100, 0)).toThrow();
  });
});
