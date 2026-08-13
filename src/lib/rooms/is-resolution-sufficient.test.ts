import { describe, expect, it } from "vitest";
import {
  getLargestSufficientPieceCount,
  isResolutionSufficient,
} from "./is-resolution-sufficient";
import { LIBRARY_IMAGES } from "./library-images";
import { PIECE_COUNT_OPTIONS } from "./piece-count-options";

const lille = LIBRARY_IMAGES.find((image) => image.id === "lille-grand-place")!;
const office = LIBRARY_IMAGES.find((image) => image.id === "office-workstation")!;

describe("isResolutionSufficient", () => {
  it("passes a high-resolution image at the largest piece count option", () => {
    expect(isResolutionSufficient(4000, 3000, 1500)).toBe(true);
  });

  it("fails a low-resolution image even at the smallest piece count option", () => {
    expect(isResolutionSufficient(200, 150, 100)).toBe(false);
  });

  it("passes exactly at the threshold boundary", () => {
    expect(isResolutionSufficient(100, 30, 1)).toBe(true); // 3000 >= 1 * 3000
  });

  it("fails one pixel short of the threshold boundary", () => {
    expect(isResolutionSufficient(100, 29, 1)).toBe(false); // 2900 < 3000
  });

  it("fails for zero dimensions", () => {
    expect(isResolutionSufficient(0, 0, 100)).toBe(false);
  });

  describe("real library images", () => {
    it("passes the Lille photo at 1500 pieces (the largest offered option)", () => {
      expect(isResolutionSufficient(lille.width, lille.height, 1500)).toBe(true);
    });

    it("fails the Lille photo at a piece count beyond the offered options", () => {
      expect(isResolutionSufficient(lille.width, lille.height, 2000)).toBe(false);
    });

    it("passes the office-workstation photo at 500 pieces", () => {
      expect(isResolutionSufficient(office.width, office.height, 500)).toBe(true);
    });

    it("fails the office-workstation photo at 1000 pieces", () => {
      expect(isResolutionSufficient(office.width, office.height, 1000)).toBe(false);
    });
  });
});

describe("getLargestSufficientPieceCount", () => {
  it("returns the largest passing option for a high-resolution image", () => {
    expect(
      getLargestSufficientPieceCount(lille.width, lille.height, PIECE_COUNT_OPTIONS),
    ).toBe(1500);
  });

  it("returns the largest passing option for a lower-resolution image", () => {
    expect(
      getLargestSufficientPieceCount(office.width, office.height, PIECE_COUNT_OPTIONS),
    ).toBe(500);
  });

  it("returns null when no option passes", () => {
    expect(getLargestSufficientPieceCount(10, 10, PIECE_COUNT_OPTIONS)).toBeNull();
  });
});
