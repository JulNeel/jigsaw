import { describe, expect, it } from "vitest";
import {
  computeContagionTargets,
  resolvePlacementAnchor,
  type ContagionMember,
} from "./validate-contagion";

const geom = { gridRows: 5, gridCols: 5, tileWidth: 100, tileHeight: 100 };

function member(
  pieceId: string,
  gridRow: number,
  gridCol: number,
  overrides: Partial<ContagionMember> = {},
): ContagionMember {
  return { pieceId, gridRow, gridCol, rotation: 0, placedRow: null, placedCol: null, ...overrides };
}

describe("resolvePlacementAnchor", () => {
  it("returns no-anchor when nothing in the group is placed", () => {
    const members = [member("a", 0, 0), member("b", 0, 1)];
    expect(resolvePlacementAnchor(members)).toEqual({ kind: "no-anchor" });
  });

  it("derives the anchor delta from a single placed member", () => {
    const members = [member("a", 2, 3, { placedRow: 2, placedCol: 3 }), member("b", 2, 4)];
    expect(resolvePlacementAnchor(members)).toEqual({
      kind: "anchored",
      anchor: { rowDelta: 0, colDelta: 0 },
    });
  });

  it("accepts two placed members that agree on the same translation", () => {
    const members = [
      member("a", 2, 3, { placedRow: 2, placedCol: 3 }),
      member("b", 2, 4, { placedRow: 2, placedCol: 4 }),
      member("c", 2, 5),
    ];
    expect(resolvePlacementAnchor(members)).toEqual({
      kind: "anchored",
      anchor: { rowDelta: 0, colDelta: 0 },
    });
  });

  it("reports a conflict when two placed members imply different translations", () => {
    const members = [
      member("a", 2, 3, { placedRow: 2, placedCol: 3 }),
      // A different true grid position, but placed at a slot that implies a
      // different grid->slot translation than "a" does — geometrically
      // inconsistent, must abort rather than silently pick one.
      member("b", 0, 0, { placedRow: 1, placedCol: 1 }),
    ];
    expect(resolvePlacementAnchor(members)).toEqual({ kind: "conflict" });
  });
});

describe("computeContagionTargets", () => {
  const zeroAnchor = { rowDelta: 0, colDelta: 0 };

  it("computes each member's target as gridPosition + anchor delta", () => {
    const members = [member("a", 2, 2), member("b", 2, 3)];
    const result = computeContagionTargets({ rowDelta: 1, colDelta: -1 }, members, geom);
    expect(result).toEqual({
      valid: true,
      targets: new Map([
        ["a", { row: 3, col: 1 }],
        ["b", { row: 3, col: 2 }],
      ]),
    });
  });

  it("rejects a rotated member", () => {
    const members = [member("a", 2, 2, { rotation: 90 })];
    expect(computeContagionTargets(zeroAnchor, members, geom)).toEqual({
      valid: false,
      reason: "ROTATED_MEMBER",
    });
  });

  it("rejects a target that falls outside the grid bounds", () => {
    const members = [member("a", 0, 0)];
    expect(computeContagionTargets({ rowDelta: -1, colDelta: 0 }, members, geom)).toEqual({
      valid: false,
      reason: "OUT_OF_BOUNDS",
    });
  });

  it("gives an unambiguous slot to a member sitting between two anchors", () => {
    const members = [member("bridge", 1, 1)];
    expect(computeContagionTargets(zeroAnchor, members, geom)).toEqual({
      valid: true,
      targets: new Map([["bridge", { row: 1, col: 1 }]]),
    });
  });
});
