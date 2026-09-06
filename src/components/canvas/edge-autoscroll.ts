import type { Point, ViewportSize } from "./viewport-bounds";

// Story 3.15: how close (in screen px) the pointer must get to a viewport
// edge before the Canvas starts auto-panning while a piece/Îlot is being
// dragged, and how fast (in px/sec) it pans once the pointer is right at
// the edge itself. Reasonable defaults, not spec-mandated — tune visually.
export const EDGE_AUTOSCROLL_MARGIN_PX = 80;
export const EDGE_AUTOSCROLL_MAX_SPEED_PX_PER_SEC = 900;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// One axis of `computeAutoscrollVelocity` below: `0` while `pos` is more
// than `margin` px from either edge of `[0, size]`; otherwise scales
// linearly from `0` at the margin boundary up to `maxSpeed` at (or past)
// the edge itself. `clamp01` on the depth ratio means a `pos` outside
// `[0, size]` entirely (can happen mid-drag on a fast gesture) still never
// produces a velocity beyond `maxSpeed`.
function axisVelocity(pos: number, size: number, margin: number, maxSpeed: number): number {
  if (pos < margin) {
    const depth = margin - pos;
    return -maxSpeed * clamp01(depth / margin);
  }
  if (pos > size - margin) {
    const depth = pos - (size - margin);
    return maxSpeed * clamp01(depth / margin);
  }
  return 0;
}

/**
 * The auto-pan velocity (px/sec, per axis) for a Canvas being dragged
 * toward its edge (Story 3.15) — `pointer` in the same screen/Stage-
 * container-relative coordinates `Stage.getPointerPosition()` already
 * returns. Both axes are independent, so a corner drag produces a non-zero
 * velocity on both at once (diagonal pan). Pure function, no Konva/DOM
 * dependency — the imperative RAF loop and Konva Stage/node writes live in
 * `room-canvas.tsx`.
 */
export function computeAutoscrollVelocity(
  pointer: Point,
  viewport: ViewportSize,
  margin: number,
  maxSpeed: number,
): Point {
  return {
    x: axisVelocity(pointer.x, viewport.width, margin, maxSpeed),
    y: axisVelocity(pointer.y, viewport.height, margin, maxSpeed),
  };
}
