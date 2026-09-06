import { describe, expect, it } from "vitest";
import { computeAutoscrollVelocity } from "./edge-autoscroll";

describe("computeAutoscrollVelocity", () => {
  const viewport = { width: 800, height: 600 };
  const margin = 80;
  const maxSpeed = 900;

  it("is zero on both axes comfortably inside the viewport", () => {
    const velocity = computeAutoscrollVelocity({ x: 400, y: 300 }, viewport, margin, maxSpeed);
    expect(velocity).toEqual({ x: 0, y: 0 });
  });

  it("is zero exactly at the margin boundary (not yet past it)", () => {
    const velocity = computeAutoscrollVelocity(
      { x: margin, y: viewport.height - margin },
      viewport,
      margin,
      maxSpeed,
    );
    expect(velocity).toEqual({ x: 0, y: 0 });
  });

  it("pans left (negative x) at max speed exactly at the left edge", () => {
    const velocity = computeAutoscrollVelocity({ x: 0, y: 300 }, viewport, margin, maxSpeed);
    expect(velocity.x).toBeCloseTo(-maxSpeed);
    expect(velocity.y).toBe(0);
  });

  it("pans right (positive x) at max speed exactly at the right edge", () => {
    const velocity = computeAutoscrollVelocity(
      { x: viewport.width, y: 300 },
      viewport,
      margin,
      maxSpeed,
    );
    expect(velocity.x).toBeCloseTo(maxSpeed);
    expect(velocity.y).toBe(0);
  });

  it("pans up (negative y) at max speed exactly at the top edge", () => {
    const velocity = computeAutoscrollVelocity({ x: 400, y: 0 }, viewport, margin, maxSpeed);
    expect(velocity.y).toBeCloseTo(-maxSpeed);
    expect(velocity.x).toBe(0);
  });

  it("pans down (positive y) at max speed exactly at the bottom edge", () => {
    const velocity = computeAutoscrollVelocity(
      { x: 400, y: viewport.height },
      viewport,
      margin,
      maxSpeed,
    );
    expect(velocity.y).toBeCloseTo(maxSpeed);
    expect(velocity.x).toBe(0);
  });

  it("scales linearly between the margin boundary and the edge", () => {
    const halfway = computeAutoscrollVelocity(
      { x: margin / 2, y: 300 },
      viewport,
      margin,
      maxSpeed,
    );
    expect(halfway.x).toBeCloseTo(-maxSpeed / 2);
  });

  it("pans diagonally when the pointer is in a corner", () => {
    const velocity = computeAutoscrollVelocity({ x: 0, y: 0 }, viewport, margin, maxSpeed);
    expect(velocity.x).toBeCloseTo(-maxSpeed);
    expect(velocity.y).toBeCloseTo(-maxSpeed);
  });

  it("never exceeds maxSpeed even when the pointer is outside the viewport bounds", () => {
    const velocity = computeAutoscrollVelocity({ x: -5000, y: 10000 }, viewport, margin, maxSpeed);
    expect(Math.abs(velocity.x)).toBeLessThanOrEqual(maxSpeed);
    expect(Math.abs(velocity.y)).toBeLessThanOrEqual(maxSpeed);
    expect(velocity.x).toBeCloseTo(-maxSpeed);
    expect(velocity.y).toBeCloseTo(maxSpeed);
  });
});
