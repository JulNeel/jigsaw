export type Point = { x: number; y: number };
export type ViewportSize = { width: number; height: number };
export type FitView = { scale: number; position: Point };

// The "fit everything in view, centered" computation — used both to seed
// the initial view (`room-canvas.tsx`'s `useState`) and to implement
// "recenter" (Story 3.4): one formula, called from two places, rather than
// two independent computations that could silently drift apart. Floored at
// 1 so a transiently zero-size viewport/content span (hidden tab, zero-size
// iframe) can never collapse `scale` to 0 — every subsequent zoom
// computation divides by it.
export function computeFitView(viewport: ViewportSize, contentSpan: number): FitView {
  const scale = Math.max(1, Math.min(viewport.width, viewport.height)) / Math.max(1, contentSpan);
  return {
    scale,
    position: { x: viewport.width / 2, y: viewport.height / 2 },
  };
}

export function clampScale(scale: number, min: number, max: number): number {
  // A non-finite input (e.g. a NaN pinch-distance ratio from two coincident
  // touch points, or a division by a zero scale) must never propagate into
  // the Stage's scale/position — fall back to `min` rather than corrupt the
  // view with no way to recover short of a remount.
  if (!Number.isFinite(scale)) {
    return min;
  }
  return Math.min(max, Math.max(min, scale));
}

// Keeps `pointer` (screen coordinates) visually fixed while scale changes
// from oldScale to newScale, given the stage's current screen position.
// Same math serves both wheel-zoom (pointer = cursor) and pinch-zoom
// (pointer = touch midpoint) — one function, two call sites.
export function zoomAtPoint(
  pointer: Point,
  oldScale: number,
  newScale: number,
  oldPosition: Point,
): Point {
  const contentPoint = {
    x: (pointer.x - oldPosition.x) / oldScale,
    y: (pointer.y - oldPosition.y) / oldScale,
  };
  return {
    x: pointer.x - contentPoint.x * newScale,
    y: pointer.y - contentPoint.y * newScale,
  };
}

// Clamps `position` (where content-space (0,0) maps to on screen) so the
// content's bounding box — spanning [-contentHalfExtent, +contentHalfExtent]
// in content-space on both axes, the same square-bounding-box convention
// `room-canvas.tsx` uses for `halfExtentX`/`halfExtentY` — always keeps at
// least `margin` px of content visibly inside the viewport (AC #2 / NFR-1:
// nothing ever becomes permanently unreachable). `margin` is capped at
// `half` so the bounds never invert (`minX > maxX`) at extreme zoom-out,
// where the content itself is narrower than the requested margin.
export function clampPosition(
  position: Point,
  scale: number,
  viewport: ViewportSize,
  contentHalfExtent: number,
  margin: number,
): Point {
  const half = contentHalfExtent * scale;
  const effectiveMargin = Math.min(margin, half);
  const minX = -half + effectiveMargin;
  const maxX = viewport.width + half - effectiveMargin;
  const minY = -half + effectiveMargin;
  const maxY = viewport.height + half - effectiveMargin;
  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  };
}
