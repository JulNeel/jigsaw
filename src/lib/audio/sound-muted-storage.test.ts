import { describe, expect, it } from "vitest";
import { getSoundMuted, setSoundMuted, type SimpleStorage } from "./sound-muted-storage";

function fakeStorage(): SimpleStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("getSoundMuted", () => {
  it("defaults to unmuted when storage is null", () => {
    expect(getSoundMuted(null)).toBe(false);
  });

  it("defaults to unmuted when nothing has been persisted yet", () => {
    expect(getSoundMuted(fakeStorage())).toBe(false);
  });

  it("reads back a persisted muted preference", () => {
    const storage = fakeStorage();
    setSoundMuted(true, storage);
    expect(getSoundMuted(storage)).toBe(true);
  });

  it("reads back a persisted unmuted preference after having been muted", () => {
    const storage = fakeStorage();
    setSoundMuted(true, storage);
    setSoundMuted(false, storage);
    expect(getSoundMuted(storage)).toBe(false);
  });

  it("never throws when storage.getItem throws (e.g. Safari private browsing)", () => {
    const storage: SimpleStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
    };
    expect(getSoundMuted(storage)).toBe(false);
  });

  it("never throws when storage.setItem throws (e.g. quota exceeded)", () => {
    const storage: SimpleStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => setSoundMuted(true, storage)).not.toThrow();
  });
});
