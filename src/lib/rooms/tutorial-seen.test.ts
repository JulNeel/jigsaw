import { describe, expect, it } from "vitest";
import {
  getSafeSessionStorage,
  hasSeenTutorial,
  markTutorialSeen,
  type SimpleStorage,
} from "./tutorial-seen";

function createThrowingStorage(): SimpleStorage {
  return {
    getItem: () => {
      throw new Error("SecurityError: storage blocked");
    },
    setItem: () => {
      throw new Error("QuotaExceededError: storage full");
    },
  };
}

function createFakeStorage(): SimpleStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("tutorial-seen", () => {
  it("reports unseen for a Room that was never marked", () => {
    const storage = createFakeStorage();
    expect(hasSeenTutorial("family-dupont-ab12cd", storage)).toBe(false);
  });

  it("reports seen after markTutorialSeen for that same Room", () => {
    const storage = createFakeStorage();
    markTutorialSeen("family-dupont-ab12cd", storage);
    expect(hasSeenTutorial("family-dupont-ab12cd", storage)).toBe(true);
  });

  it("keeps a different Room's key independent", () => {
    const storage = createFakeStorage();
    markTutorialSeen("family-dupont-ab12cd", storage);
    expect(hasSeenTutorial("other-room-xy99zz", storage)).toBe(false);
  });

  it("treats null storage as always-unseen and a no-op save", () => {
    expect(hasSeenTutorial("family-dupont-ab12cd", null)).toBe(false);
    expect(() => markTutorialSeen("family-dupont-ab12cd", null)).not.toThrow();
  });

  it("treats a throwing storage as unseen and a no-op save, never throwing itself", () => {
    const storage = createThrowingStorage();
    expect(() => hasSeenTutorial("family-dupont-ab12cd", storage)).not.toThrow();
    expect(hasSeenTutorial("family-dupont-ab12cd", storage)).toBe(false);
    expect(() => markTutorialSeen("family-dupont-ab12cd", storage)).not.toThrow();
  });

  it("getSafeSessionStorage returns null outside a browser environment", () => {
    // Vitest's `environment: "node"` config has no `window` global — this
    // exercises the exact guard that protects a sandboxed/SSR context.
    expect(getSafeSessionStorage()).toBeNull();
  });
});
