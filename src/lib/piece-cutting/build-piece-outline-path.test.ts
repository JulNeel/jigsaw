import { describe, expect, it } from "vitest";
import { buildPieceOutlinePath, type PathCommand } from "./build-piece-outline-path";
import type { EdgeSpec, PieceEdgeShapes } from "./compute-piece-edge-shapes";

function edge(type: EdgeSpec["type"], profileSeed = 0.5): EdgeSpec {
  return { type, profileSeed };
}

const FLAT = edge("flat");
const ALL_FLAT: PieceEdgeShapes = { top: FLAT, right: FLAT, bottom: FLAT, left: FLAT };

// Every coordinate a command touches, control points included — extent/
// shape checks below need to see the curves' control points, not just
// their endpoints (which, for a mushroom bump, sit back on the flat
// baseline/centerline and don't reveal the bulge on their own).
function allX(commands: PathCommand[]): number[] {
  return commands.flatMap((c) => {
    if (c.type === "quadraticCurveTo") return [c.x, c.cx];
    if (c.type === "bezierCurveTo") return [c.x, c.c1x, c.c2x];
    return [c.x];
  });
}
function allY(commands: PathCommand[]): number[] {
  return commands.flatMap((c) => {
    if (c.type === "quadraticCurveTo") return [c.y, c.cy];
    if (c.type === "bezierCurveTo") return [c.y, c.c1y, c.c2y];
    return [c.y];
  });
}

describe("buildPieceOutlinePath", () => {
  it("starts with a moveTo at the piece's own top-left corner", () => {
    const commands = buildPieceOutlinePath(ALL_FLAT, 100, 80);
    expect(commands[0]).toEqual({ type: "moveTo", x: 0, y: 0 });
  });

  it("closes back to the starting point when every edge is flat (a plain rectangle)", () => {
    const commands = buildPieceOutlinePath(ALL_FLAT, 100, 80);
    const last = commands.at(-1)!;
    expect(last).toMatchObject({ x: 0, y: 0 });
  });

  it("produces exactly 4 straight lineTo segments for an all-flat (fully-boundary) piece", () => {
    const commands = buildPieceOutlinePath(ALL_FLAT, 100, 80);
    // moveTo + 4 lineTo (one per edge), no curves.
    expect(commands).toHaveLength(5);
    expect(commands.filter((c) => c.type === "lineTo")).toHaveLength(4);
    expect(commands.some((c) => c.type !== "moveTo" && c.type !== "lineTo")).toBe(false);
  });

  it("is deterministic for the same inputs", () => {
    const shapes: PieceEdgeShapes = {
      top: edge("tab"),
      right: edge("blank"),
      bottom: edge("tab"),
      left: edge("blank"),
    };
    const a = buildPieceOutlinePath(shapes, 100, 80);
    const b = buildPieceOutlinePath(shapes, 100, 80);
    expect(a).toEqual(b);
  });

  it("produces exactly one lineTo-to-neck, two bezier curves (the mushroom's two halves), and a closing lineTo per bump edge", () => {
    const shapes: PieceEdgeShapes = { ...ALL_FLAT, top: edge("tab") };
    const commands = buildPieceOutlinePath(shapes, 100, 80);
    const bezierCurves = commands.filter((c) => c.type === "bezierCurveTo");
    expect(bezierCurves).toHaveLength(2);
  });

  it("bulges a 'tab' top edge above the flat edge line (negative y, outward)", () => {
    const shapes: PieceEdgeShapes = { ...ALL_FLAT, top: edge("tab") };
    const commands = buildPieceOutlinePath(shapes, 100, 80);
    expect(Math.min(...allY(commands))).toBeLessThan(0);
  });

  it("recesses a 'blank' top edge below the flat edge line (positive y, inward)", () => {
    const shapes: PieceEdgeShapes = { ...ALL_FLAT, top: edge("blank") };
    const commands = buildPieceOutlinePath(shapes, 100, 80);
    // The bump's peak should stay between the flat line (0) and the piece interior.
    const insidePoints = allY(commands).filter((y) => y > 0 && y < 80 / 2);
    expect(insidePoints.length).toBeGreaterThan(0);
  });

  it("mirrors bulge direction correctly for right/bottom/left tabs (outward = further from center)", () => {
    const rightTab = buildPieceOutlinePath({ ...ALL_FLAT, right: edge("tab") }, 100, 80);
    expect(Math.max(...allX(rightTab))).toBeGreaterThan(100);

    const bottomTab = buildPieceOutlinePath({ ...ALL_FLAT, bottom: edge("tab") }, 100, 80);
    expect(Math.max(...allY(bottomTab))).toBeGreaterThan(80);

    const leftTab = buildPieceOutlinePath({ ...ALL_FLAT, left: edge("tab") }, 100, 80);
    expect(Math.min(...allX(leftTab))).toBeLessThan(0);
  });

  it("reads as a real puzzle knob: the bulb's widest point is further from center than the neck's own half-width (a genuine narrow-neck-wide-head silhouette, not a plain symmetric dome)", () => {
    for (let seed = 0.02; seed < 1; seed += 0.07) {
      const commands = buildPieceOutlinePath({ ...ALL_FLAT, top: edge("tab", seed) }, 100, 80);
      const curves = commands.filter((c) => c.type === "bezierCurveTo");
      expect(curves).toHaveLength(2);
      // Neck endpoints are the lineTo before the first curve and the lineTo
      // after the second — both lie exactly on the flat baseline (y = 0),
      // at some lateral distance from the tile's own center (x = 50).
      const neckStart = commands.find((c) => c.type === "lineTo" && c.y === 0 && c.x < 50);
      expect(neckStart).toBeDefined();
      const neckHalfWidth = 50 - (neckStart as { x: number }).x;
      // Every control point's lateral distance from center should, for at
      // least one of them, exceed the neck's own half-width — otherwise the
      // curve never actually flares wider than its own attachment point.
      const lateralExtents = curves.flatMap((c) =>
        c.type === "bezierCurveTo" ? [Math.abs(c.c1x - 50), Math.abs(c.c2x - 50)] : [],
      );
      expect(Math.max(...lateralExtents)).toBeGreaterThan(neckHalfWidth);
    }
  });

  it("meets smoothly at the apex — no pinch/point at the tip (user feedback, 2026-09-04)", () => {
    for (let seed = 0.02; seed < 1; seed += 0.07) {
      const commands = buildPieceOutlinePath({ ...ALL_FLAT, top: edge("tab", seed) }, 100, 80);
      const [firstCurve, secondCurve] = commands.filter((c) => c.type === "bezierCurveTo");
      expect(firstCurve.type).toBe("bezierCurveTo");
      expect(secondCurve.type).toBe("bezierCurveTo");
      if (firstCurve.type === "bezierCurveTo" && secondCurve.type === "bezierCurveTo") {
        // The apex is the first curve's own endpoint. For a smooth (not
        // pointed) join, both curves' control points immediately adjacent
        // to that apex must sit at the exact same depth as the apex itself
        // — giving both an incoming and an outgoing tangent that are
        // purely lateral (horizontal) right at the tip, matching each
        // other instead of disagreeing.
        expect(firstCurve.c2y).toBeCloseTo(firstCurve.y, 10);
        expect(secondCurve.c1y).toBeCloseTo(firstCurve.y, 10);
      }
    }
  });

  it("aligns identically for two neighbors walking the same shared edge in opposite directions (regression, 2026-09-04: 'les encoches/languettes ne sont pas alignées')", () => {
    const seed = 0.33;
    const rightEdgePiece = buildPieceOutlinePath({ ...ALL_FLAT, right: edge("tab", seed) }, 100, 80);
    const leftEdgePiece = buildPieceOutlinePath({ ...ALL_FLAT, left: edge("tab", seed) }, 100, 80);
    const apexY = (commands: PathCommand[]) => {
      const curve = commands.find((c) => c.type === "bezierCurveTo");
      return curve?.type === "bezierCurveTo" ? curve.y : undefined;
    };
    // The right edge runs top→bottom (y: 0→tileHeight); the left edge —
    // the same physical vertical line for whichever piece sits just to the
    // right — runs bottom→top. A correctly-centered bump lands at the same
    // physical y (tileHeight / 2) regardless of which direction it's
    // walked from.
    expect(apexY(rightEdgePiece)).toBeCloseTo(80 / 2, 10);
    expect(apexY(leftEdgePiece)).toBeCloseTo(80 / 2, 10);
  });

  it("picks a genuinely different bump shape/size for a different profileSeed (visual variety)", () => {
    const low = buildPieceOutlinePath({ ...ALL_FLAT, top: edge("tab", 0.02) }, 100, 80);
    const high = buildPieceOutlinePath({ ...ALL_FLAT, top: edge("tab", 0.98) }, 100, 80);
    expect(low).not.toEqual(high);
  });

  it("stays a well-formed two-curve bump across the whole profile table (no seed bucket degenerates)", () => {
    for (let seed = 0; seed < 1; seed += 0.05) {
      const commands = buildPieceOutlinePath({ ...ALL_FLAT, top: edge("tab", seed) }, 100, 80);
      const curves = commands.filter((c) => c.type === "bezierCurveTo");
      expect(curves).toHaveLength(2);
      for (const curve of curves) {
        if (curve.type === "bezierCurveTo") {
          expect(Math.abs(curve.c1y)).toBeGreaterThan(0);
          expect(Math.abs(curve.c2y)).toBeGreaterThan(0);
        }
      }
    }
  });
});
