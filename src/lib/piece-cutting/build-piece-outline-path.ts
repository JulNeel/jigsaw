import type { EdgeSpec, PieceEdgeShapes } from "./compute-piece-edge-shapes";

export type PathCommand =
  | { type: "moveTo"; x: number; y: number }
  | { type: "lineTo"; x: number; y: number }
  | { type: "quadraticCurveTo"; cx: number; cy: number; x: number; y: number }
  | {
      type: "bezierCurveTo";
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x: number;
      y: number;
    };

type BumpProfile = {
  // Fraction of the smaller tile dimension the bump bulges out (tab) or
  // recesses in (blank).
  depthFactor: number;
  // Fraction of the edge's own length spanned by the *neck* — the narrow
  // stretch directly attached to the flat baseline.
  neckWidthFraction: number;
  // Fraction of the edge's own length spanned by the *bulb* — the round
  // head at the tip, always wider than the neck (user feedback, 2026-09-04:
  // a real puzzle tab has a narrow neck flaring into a bulb wider than
  // itself — a smooth single-arc bump, tried first, doesn't read as a
  // "puzzle piece" no matter how it's tuned, since it never actually
  // narrows anywhere).
  bulbWidthFraction: number;
};

// A spread of bump shapes/sizes, purely for visual variety (user request,
// 2026-09-03: "donner l'impression de diversité") — which one applies to a
// given edge is picked deterministically from that edge's own
// `profileSeed` (`compute-piece-edge-shapes.ts`), not randomly at render
// time. Values are reasonable defaults, not spec-mandated — tune visually.
// Every entry's `bulbWidthFraction` is deliberately well above its
// `neckWidthFraction` (the defining "mushroom" silhouette). Max
// `depthFactor` here (0.20) must stay comfortably under `slice-image.ts`'s
// `TILE_OVERHANG_FACTOR` (0.25), or a deep tab could protrude past the real
// pixel content baked into the tile at creation time, into never-painted
// transparent space.
//
// No lateral center-offset (there once was one, removed 2026-09-04 — user
// feedback: "les encoches/languettes ne sont pas alignées entre pièces
// voisines"). Two pieces sharing an edge walk it in *opposite* directions
// (e.g. a piece's own "right" edge runs top→bottom, while its right
// neighbor's "left" edge — the same physical edge — runs bottom→top, per
// this module's clockwise-from-top-left traversal). A lateral offset
// measured "along the direction of travel" therefore pushes the bump
// toward opposite physical ends of the shared edge for the two neighbors,
// even though both derive the identical profile — every non-zero offset
// was a guaranteed visual misalignment, not an occasional one. Centering
// every bump exactly at the edge's own midpoint sidesteps the whole
// problem: a midpoint is the same point regardless of which direction you
// approach it from.
const BUMP_PROFILES: readonly BumpProfile[] = [
  { depthFactor: 0.14, neckWidthFraction: 0.16, bulbWidthFraction: 0.3 },
  { depthFactor: 0.16, neckWidthFraction: 0.18, bulbWidthFraction: 0.34 },
  { depthFactor: 0.18, neckWidthFraction: 0.2, bulbWidthFraction: 0.36 },
  { depthFactor: 0.2, neckWidthFraction: 0.16, bulbWidthFraction: 0.32 },
  { depthFactor: 0.15, neckWidthFraction: 0.2, bulbWidthFraction: 0.38 },
  { depthFactor: 0.17, neckWidthFraction: 0.14, bulbWidthFraction: 0.28 },
  { depthFactor: 0.19, neckWidthFraction: 0.22, bulbWidthFraction: 0.4 },
  { depthFactor: 0.13, neckWidthFraction: 0.18, bulbWidthFraction: 0.3 },
  { depthFactor: 0.18, neckWidthFraction: 0.16, bulbWidthFraction: 0.34 },
  { depthFactor: 0.16, neckWidthFraction: 0.2, bulbWidthFraction: 0.38 },
  { depthFactor: 0.2, neckWidthFraction: 0.18, bulbWidthFraction: 0.32 },
  { depthFactor: 0.14, neckWidthFraction: 0.16, bulbWidthFraction: 0.28 },
  { depthFactor: 0.17, neckWidthFraction: 0.2, bulbWidthFraction: 0.36 },
  { depthFactor: 0.19, neckWidthFraction: 0.14, bulbWidthFraction: 0.3 },
  { depthFactor: 0.15, neckWidthFraction: 0.22, bulbWidthFraction: 0.4 },
];

function pickProfile(profileSeed: number): BumpProfile {
  const index = Math.min(BUMP_PROFILES.length - 1, Math.floor(profileSeed * BUMP_PROFILES.length));
  return BUMP_PROFILES[index];
}

type Point = { x: number; y: number };

function buildEdgeCommands(
  from: Point,
  to: Point,
  edgeSpec: EdgeSpec,
  tileWidth: number,
  tileHeight: number,
): PathCommand[] {
  if (edgeSpec.type === "flat") {
    return [{ type: "lineTo", x: to.x, y: to.y }];
  }

  const profile = pickProfile(edgeSpec.profileSeed);
  const depth = profile.depthFactor * Math.min(tileWidth, tileHeight);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // Outward normal for a clockwise traversal (derived once, verified for
  // all four edges): rotating the direction vector (ux, uy) this way
  // always points away from the piece's interior, regardless of which
  // edge is being walked.
  const nx = uy;
  const ny = -ux;
  const sign = edgeSpec.type === "tab" ? 1 : -1;

  const neckHalf = (profile.neckWidthFraction / 2) * len;
  const bulbHalf = (profile.bulbWidthFraction / 2) * len;
  const center = len / 2;

  // `tAlong` = distance along the edge from `from`; `depthAmount` = how far
  // out (tab) or in (blank) from the flat baseline at that point.
  const at = (tAlong: number, depthAmount: number): Point => ({
    x: from.x + ux * tAlong + nx * sign * depthAmount,
    y: from.y + uy * tAlong + ny * sign * depthAmount,
  });

  const neckStart = at(center - neckHalf, 0);
  const neckEnd = at(center + neckHalf, 0);
  const apex = at(center, depth);

  // The actual "mushroom" shape: two cubic Beziers (neckStart→apex,
  // apex→neckEnd), each pulled laterally out to the *bulb's* half-width
  // (wider than the neck) partway through its own depth, then back in
  // toward the centerline as it reaches the apex — this is what makes the
  // silhouette genuinely narrower at its base than at its widest point,
  // unlike a single symmetric arc (tried first; every bump read as a plain
  // dome, never as an interlocking puzzle knob, per user feedback).
  //
  // The control point immediately adjacent to the apex on each side sits
  // at the *same* depth as the apex itself (not partway there) — code
  // review fix (2026-09-04, user feedback: "il faut arrondir la pointe"):
  // with an earlier depth short of the apex's own, the incoming and
  // outgoing tangent directions at the join disagreed (one still rising,
  // the other already falling), leaving a visible point/cusp right at the
  // tip. Matching depths make both tangents purely lateral (horizontal) at
  // the join — the two curves meet smoothly, like the rounded top of a
  // circle, instead of a corner.
  const leftControl1 = at(center - bulbHalf * 1.05, depth * 0.35);
  const leftControl2 = at(center - bulbHalf * 0.45, depth);
  const rightControl1 = at(center + bulbHalf * 0.45, depth);
  const rightControl2 = at(center + bulbHalf * 1.05, depth * 0.35);

  return [
    { type: "lineTo", x: neckStart.x, y: neckStart.y },
    {
      type: "bezierCurveTo",
      c1x: leftControl1.x,
      c1y: leftControl1.y,
      c2x: leftControl2.x,
      c2y: leftControl2.y,
      x: apex.x,
      y: apex.y,
    },
    {
      type: "bezierCurveTo",
      c1x: rightControl1.x,
      c1y: rightControl1.y,
      c2x: rightControl2.x,
      c2y: rightControl2.y,
      x: neckEnd.x,
      y: neckEnd.y,
    },
    { type: "lineTo", x: to.x, y: to.y },
  ];
}

/**
 * Pure geometry for one piece's cut silhouette, as a sequence of canvas
 * path commands in the piece's own local, unrotated `0,0`-to-
 * `tileWidth,tileHeight` coordinate space — the same space `KonvaImage`
 * already draws the tile's image in, so a `clipFunc` built from this walks
 * identically whether the node is later rotated 0°/90°/180°/270° (Konva
 * applies a node's own rotation transform around this local space, not the
 * other way around — verify visually per this story's own Dev Notes rather
 * than assuming, but nothing here should need rotation-specific logic).
 *
 * Traverses clockwise from the top-left corner: top, right, bottom, left.
 * Deliberately separated from any actual `CanvasRenderingContext2D` call so
 * the geometry itself is unit-testable — see `drawPieceOutlinePath` for the
 * thin drawing wrapper.
 */
export function buildPieceOutlinePath(
  edgeShapes: PieceEdgeShapes,
  tileWidth: number,
  tileHeight: number,
): PathCommand[] {
  const topLeft: Point = { x: 0, y: 0 };
  const topRight: Point = { x: tileWidth, y: 0 };
  const bottomRight: Point = { x: tileWidth, y: tileHeight };
  const bottomLeft: Point = { x: 0, y: tileHeight };

  return [
    { type: "moveTo", x: topLeft.x, y: topLeft.y },
    ...buildEdgeCommands(topLeft, topRight, edgeShapes.top, tileWidth, tileHeight),
    ...buildEdgeCommands(topRight, bottomRight, edgeShapes.right, tileWidth, tileHeight),
    ...buildEdgeCommands(bottomRight, bottomLeft, edgeShapes.bottom, tileWidth, tileHeight),
    ...buildEdgeCommands(bottomLeft, topLeft, edgeShapes.left, tileWidth, tileHeight),
  ];
}

// Structural, not `CanvasRenderingContext2D` directly — Konva's own
// `clipFunc` hands this a `Konva.Context`, which mirrors these same method
// signatures without actually being a `CanvasRenderingContext2D`. Matching
// the shape structurally lets this one function serve both a real canvas
// context (untested, browser-only) and Konva's wrapper, with no cast.
export interface PathDrawingContext {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}

/**
 * Thin, side-effecting wrapper — the only part of this module that isn't
 * unit-tested (no canvas available in this repo's test environment),
 * deliberately kept to a single dumb loop over already-computed geometry.
 */
export function drawPieceOutlinePath(ctx: PathDrawingContext, commands: PathCommand[]): void {
  for (const command of commands) {
    if (command.type === "moveTo") {
      ctx.moveTo(command.x, command.y);
    } else if (command.type === "lineTo") {
      ctx.lineTo(command.x, command.y);
    } else if (command.type === "quadraticCurveTo") {
      ctx.quadraticCurveTo(command.cx, command.cy, command.x, command.y);
    } else {
      ctx.bezierCurveTo(command.c1x, command.c1y, command.c2x, command.c2y, command.x, command.y);
    }
  }
  ctx.closePath();
}
