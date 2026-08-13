import { describe, expect, it } from "vitest";
import { formatRoomProgress } from "./format-room-progress";

describe("formatRoomProgress", () => {
  it("formats zero pieces placed", () => {
    expect(formatRoomProgress(0, 500)).toBe("0 / 500 pièces posées");
  });

  it("formats partial progress", () => {
    expect(formatRoomProgress(34, 1247)).toBe("34 / 1247 pièces posées");
  });

  it("formats a fully completed room", () => {
    expect(formatRoomProgress(500, 500)).toBe("500 / 500 pièces posées");
  });

  it("returns a neutral placeholder when pieceCount is 0", () => {
    expect(formatRoomProgress(0, 0)).toBe("—");
  });
});
