import { describe, expect, it } from "vitest";
import { formatRoomProgress } from "./format-room-progress";
import messages from "../../../messages/fr.json";

const roomsMessages = messages.Rooms as Record<string, string>;

function t(key: string, values?: Record<string, unknown>): string {
  let message = roomsMessages[key];
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      message = message.replaceAll(`{${name}}`, String(value));
    }
  }
  return message;
}

describe("formatRoomProgress", () => {
  it("formats zero pieces placed", () => {
    expect(formatRoomProgress(0, 500, t)).toBe("0 / 500 pièces posées");
  });

  it("formats partial progress", () => {
    expect(formatRoomProgress(34, 1247, t)).toBe("34 / 1247 pièces posées");
  });

  it("formats a fully completed room", () => {
    expect(formatRoomProgress(500, 500, t)).toBe("500 / 500 pièces posées");
  });

  it("returns a neutral placeholder when pieceCount is 0", () => {
    expect(formatRoomProgress(0, 0, t)).toBe("—");
  });
});
