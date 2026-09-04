import { describe, expect, it } from "vitest";
import {
  canBootstrapWithoutNeighbor,
  validatePieceOrientationAndShape,
  validatePlacementNeighbors,
} from "./validate-placement";

describe("validatePieceOrientationAndShape", () => {
  it("accepts a correctly-shaped, correctly-oriented piece", () => {
    // (0,0) in a 5x5 grid is a corner.
    expect(validatePieceOrientationAndShape("corner", 0, 0, 0, 5, 5)).toEqual({
      valid: true,
    });
  });

  it("rejects a non-zero rotation", () => {
    expect(validatePieceOrientationAndShape("corner", 90, 0, 0, 5, 5)).toEqual({
      valid: false,
      reason: "ROTATION_INVALID",
    });
    expect(validatePieceOrientationAndShape("corner", 180, 0, 0, 5, 5).valid).toBe(false);
    expect(validatePieceOrientationAndShape("corner", 270, 0, 0, 5, 5).valid).toBe(false);
  });

  it("rejects a shape-category mismatch", () => {
    // (0,0) is a corner slot; an interior piece doesn't belong there.
    expect(validatePieceOrientationAndShape("interior", 0, 0, 0, 5, 5)).toEqual({
      valid: false,
      reason: "SHAPE_MISMATCH",
    });
  });

  it("accepts an edge piece at an edge slot", () => {
    // (0,1) in a 5x5 grid is an edge slot.
    expect(validatePieceOrientationAndShape("edge", 0, 0, 1, 5, 5)).toEqual({ valid: true });
  });

  it("accepts an interior piece at an interior slot", () => {
    // (2,2) in a 5x5 grid is interior.
    expect(validatePieceOrientationAndShape("interior", 0, 2, 2, 5, 5)).toEqual({
      valid: true,
    });
  });
});

describe("validatePlacementNeighbors", () => {
  it("accepts placement when no neighboring slot is occupied yet (first piece / untested corner)", () => {
    const result = validatePlacementNeighbors({ right: "piece-b" }, new Map(), 0, 0);
    expect(result).toEqual({ valid: true });
  });

  it("accepts placement when every occupied neighboring slot holds its own direction's true neighbor", () => {
    const trueNeighbors = { right: "piece-b", down: "piece-c" };
    const occupied = new Map([["0,1", "piece-b"]]);
    expect(validatePlacementNeighbors(trueNeighbors, occupied, 0, 0)).toEqual({ valid: true });
  });

  it("rejects placement when an occupied neighboring slot holds a non-neighbor", () => {
    const trueNeighbors = { right: "piece-b" };
    const occupied = new Map([["0,1", "piece-x"]]);
    expect(validatePlacementNeighbors(trueNeighbors, occupied, 0, 0)).toEqual({
      valid: false,
      reason: "NEIGHBOR_MISMATCH",
    });
  });

  it("checks all four orthogonal neighbor slots, not just one", () => {
    const trueNeighbors = { down: "below", right: "right-piece" };
    const occupied = new Map([
      ["1,1", "below"], // below (row+1)
      ["0,2", "right-piece"], // right (col+1)
    ]);
    expect(validatePlacementNeighbors(trueNeighbors, occupied, 0, 1)).toEqual({ valid: true });
  });

  it("rejects if any one of multiple occupied neighbors mismatches, even if others match", () => {
    const trueNeighbors = { down: "below" };
    const occupied = new Map([
      ["1,1", "below"],
      ["0,2", "not-a-neighbor"],
    ]);
    expect(validatePlacementNeighbors(trueNeighbors, occupied, 0, 1)).toEqual({
      valid: false,
      reason: "NEIGHBOR_MISMATCH",
    });
  });

  it("rejects a true neighbor placed on the wrong side (regression: piece_adjacency is undirected)", () => {
    // "left-piece" is genuinely this piece's true LEFT neighbor, but it's
    // occupying the slot to the RIGHT instead — must be rejected even
    // though it's a real member of the true-neighbor set, because a flat
    // "is it a true neighbor at all" check (the pre-fix behavior) would
    // wrongly accept this.
    const trueNeighbors = { left: "left-piece" };
    const occupied = new Map([["0,2", "left-piece"]]); // sitting to the right (col+1) instead
    expect(validatePlacementNeighbors(trueNeighbors, occupied, 0, 1)).toEqual({
      valid: false,
      reason: "NEIGHBOR_MISMATCH",
    });
  });

  it("rejects two true neighbors swapped between directions", () => {
    // Both "left-piece" and "top-piece" are real true neighbors of the
    // piece being placed at target (1,1), but swapped: top-piece sits to
    // the left, left-piece sits above. Every occupied slot's occupant is a
    // real true neighbor of the piece *somewhere*, but not in these exact
    // directions.
    const trueNeighbors = { left: "left-piece", up: "top-piece" };
    const occupiedSwapped = new Map([
      ["0,1", "left-piece"], // above (row-1, col) — should hold "top-piece"
      ["1,0", "top-piece"], // left (row, col-1) — should hold "left-piece"
    ]);
    expect(validatePlacementNeighbors(trueNeighbors, occupiedSwapped, 1, 1)).toEqual({
      valid: false,
      reason: "NEIGHBOR_MISMATCH",
    });
  });
});

describe("canBootstrapWithoutNeighbor", () => {
  it("allows a solo corner piece to bootstrap", () => {
    expect(canBootstrapWithoutNeighbor(["corner"])).toBe(true);
  });

  it("rejects a solo edge piece", () => {
    expect(canBootstrapWithoutNeighbor(["edge"])).toBe(false);
  });

  it("rejects a solo interior piece", () => {
    expect(canBootstrapWithoutNeighbor(["interior"])).toBe(false);
  });

  it("allows a Cluster that contains at least one corner among other shapes", () => {
    expect(canBootstrapWithoutNeighbor(["interior", "edge", "corner"])).toBe(true);
  });

  it("rejects a Cluster with no corner member at all", () => {
    expect(canBootstrapWithoutNeighbor(["interior", "edge", "edge"])).toBe(false);
  });

  it("rejects an empty member list", () => {
    expect(canBootstrapWithoutNeighbor([])).toBe(false);
  });
});
