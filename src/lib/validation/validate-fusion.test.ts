import { describe, expect, it } from "vitest";
import {
  findContactCandidates,
  genuineContacts,
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

  // Behaviour change (2026-09-18): this used to assert the opposite — one
  // false contact vetoed the whole fusion. That veto was what made fusion
  // asymmetric (see the `fusion symmetry` regression below), so a false
  // contact now only excludes its own piece from the merge instead of
  // rejecting the attempt. `genuineContacts` is what guarantees the false
  // contact's piece never joins the Îlot.
  it("still fuses when one contact is genuine and another is merely incidental", () => {
    const a = piece("a", 3, 5);
    const b = piece("b", 3, 6); // genuine true-neighbor, correct direction
    const c = piece("c", 9, 9); // not a's true neighbor at all
    const contacts = [
      { a, b, direction: "right" as const },
      { a, b: c, direction: "down" as const },
    ];
    const neighbors = new Map([["a", new Set(["b"])]]);
    expect(validateFusion(contacts, neighbors)).toBe(true);
  });
});

describe("genuineContacts", () => {
  it("keeps only the genuine contacts, so callers never merge an incidental one", () => {
    const a = piece("a", 3, 5);
    const b = piece("b", 3, 6);
    const c = piece("c", 9, 9);
    const contacts = [
      { a, b, direction: "right" as const },
      { a, b: c, direction: "down" as const },
    ];
    const neighbors = new Map([["a", new Set(["b"])]]);
    expect(genuineContacts(contacts, neighbors).map((contact) => contact.b.pieceId)).toEqual(["b"]);
  });

  it("returns nothing for mere proximity, so no fusion is reported", () => {
    expect(genuineContacts([], new Map())).toEqual([]);
  });
});

// Reproduction for the user report (2026-09-18): "parfois une pièce A que je
// déplace refuse l'association à une pièce B. Par contre si je déplace la
// pièce B vers la pièce A, elles fusionnent."
//
// Fusing two pieces is a symmetric operation — which of the two the user
// happens to pick up must not change the outcome. It does today, because the
// zero-tolerance rule is applied to *every* contact the dragged group has with
// *anything* in the Room, not only with the pieces it would actually merge
// with. An unrelated piece parked roughly one tile from where the dragged
// piece lands is enough to veto an otherwise perfectly genuine contact — and
// whether such a piece is in range depends entirely on which side is dragged.
describe("fusion symmetry (regression)", () => {
  const tileWidth = 100;
  const tileHeight = 100;
  const tolerance = 45; // CONTACT_TOLERANCE_FACTOR * tile

  // a and b are true neighbours, side by side: a at (0,0), b at (0,1).
  // c is an unrelated piece from elsewhere in the puzzle, lying in the pile
  // one tile below where `a` comes to rest.
  const neighbors = new Map([
    ["a", new Set(["b"])],
    ["b", new Set(["a"])],
    ["c", new Set(["z"])],
  ]);
  const aResting = { ...piece("a", 0, 0), screenX: 400, screenY: 500 };
  const bResting = { ...piece("b", 0, 1), screenX: 500, screenY: 500 };
  const cInThePile = { ...piece("c", 7, 7), screenX: 400, screenY: 600 };

  it("fuses when b is dragged onto a", () => {
    const candidates = findContactCandidates(
      [bResting],
      [aResting, cInThePile],
      tileWidth,
      tileHeight,
      tolerance,
    );
    expect(validateFusion(candidates, neighbors)).toBe(true);
  });

  it("fuses when a is dragged onto b — same two pieces, same final layout", () => {
    const candidates = findContactCandidates(
      [aResting],
      [bResting, cInThePile],
      tileWidth,
      tileHeight,
      tolerance,
    );
    expect(validateFusion(candidates, neighbors)).toBe(true);
  });
});
