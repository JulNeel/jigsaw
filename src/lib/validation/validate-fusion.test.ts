import { describe, expect, it } from "vitest";
import {
  findContactCandidates,
  isGenuineContact,
  validateFusion,
  type FusionPieceInfo,
} from "./validate-fusion";

function piece(pieceId: string, gridRow: number, gridCol: number, rotation = 0): FusionPieceInfo {
  return { pieceId, gridRow, gridCol, rotation };
}

describe("isGenuineContact", () => {
  it("accepts a true right-neighbor sitting to the right on screen", () => {
    const a = piece("a", 3, 5);
    const b = piece("b", 3, 6);
    expect(isGenuineContact(a, b, "right", new Set(["b"]))).toBe(true);
  });

  it("rejects when the observed direction doesn't match the true grid delta", () => {
    // b is a's true neighbor, but only to the right — not below.
    const a = piece("a", 3, 5);
    const b = piece("b", 3, 6);
    expect(isGenuineContact(a, b, "down", new Set(["b"]))).toBe(false);
  });

  it("rejects when b isn't a true neighbor of a at all", () => {
    const a = piece("a", 3, 5);
    const b = piece("b", 8, 8);
    expect(isGenuineContact(a, b, "right", new Set(["c"]))).toBe(false);
  });

  it("rejects if either piece is rotated off its as-cut orientation", () => {
    const a = piece("a", 3, 5, 90);
    const b = piece("b", 3, 6);
    expect(isGenuineContact(a, b, "right", new Set(["b"]))).toBe(false);
  });
});

describe("findContactCandidates", () => {
  const tileWidth = 100;
  const tileHeight = 80;

  it("finds a right-contact within tolerance", () => {
    const dragged = [{ ...piece("a", 3, 5), screenX: 0, screenY: 0 }];
    const stationary = [{ ...piece("b", 3, 6), screenX: 100, screenY: 0 }];
    expect(findContactCandidates(dragged, stationary, tileWidth, tileHeight, 5)).toEqual([
      { a: dragged[0], b: stationary[0], direction: "right" },
    ]);
  });

  it("finds no candidate when merely nearby, not touching", () => {
    const dragged = [{ ...piece("a", 3, 5), screenX: 0, screenY: 0 }];
    const stationary = [{ ...piece("b", 3, 6), screenX: 40, screenY: 40 }];
    expect(findContactCandidates(dragged, stationary, tileWidth, tileHeight, 5)).toEqual([]);
  });

  it("finds every cardinal direction", () => {
    const origin = { ...piece("a", 3, 5), screenX: 0, screenY: 0 };
    const up = { ...piece("u", 2, 5), screenX: 0, screenY: -tileHeight };
    const down = { ...piece("d", 4, 5), screenX: 0, screenY: tileHeight };
    const left = { ...piece("l", 3, 4), screenX: -tileWidth, screenY: 0 };
    const right = { ...piece("r", 3, 6), screenX: tileWidth, screenY: 0 };
    const candidates = findContactCandidates(
      [origin],
      [up, down, left, right],
      tileWidth,
      tileHeight,
      5,
    );
    expect(candidates.map((c) => c.direction).sort()).toEqual(["down", "left", "right", "up"]);
  });
});

describe("validateFusion", () => {
  it("rejects when there are zero contacts (mere proximity, no fusion)", () => {
    expect(validateFusion([], new Map())).toBe(false);
  });

  it("accepts when the single contact is genuine", () => {
    const a = piece("a", 3, 5);
    const b = piece("b", 3, 6);
    const contacts = [{ a, b, direction: "right" as const }];
    const neighbors = new Map([["a", new Set(["b"])]]);
    expect(validateFusion(contacts, neighbors)).toBe(true);
  });

  it("rejects the whole fusion if any one of several contacts is false (zero tolerance)", () => {
    const a = piece("a", 3, 5);
    const b = piece("b", 3, 6); // genuine true-neighbor, correct direction
    const c = piece("c", 9, 9); // not a's true neighbor at all
    const contacts = [
      { a, b, direction: "right" as const },
      { a, b: c, direction: "down" as const },
    ];
    const neighbors = new Map([["a", new Set(["b"])]]);
    expect(validateFusion(contacts, neighbors)).toBe(false);
  });
});
