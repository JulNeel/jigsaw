import { describe, expect, it } from "vitest";
import {
  PARTICIPANT_COLORS,
  colorForParticipant,
  getSafeLocalStorage,
  loadDisplayName,
  loadOrCreateParticipantId,
  saveDisplayName,
  type SimpleStorage,
} from "./participant-identity";

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

function createFakeStorage(seed: Record<string, string> = {}): SimpleStorage {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("display name", () => {
  it("has none before one is saved", () => {
    expect(loadDisplayName(createFakeStorage())).toBeNull();
  });

  it("round-trips a saved name", () => {
    const storage = createFakeStorage();
    saveDisplayName("Julien", storage);
    expect(loadDisplayName(storage)).toBe("Julien");
  });

  it("trims, because a name typed with a stray space is still that name", () => {
    const storage = createFakeStorage();
    saveDisplayName("  Julien  ", storage);
    expect(loadDisplayName(storage)).toBe("Julien");
  });

  it("treats a blank name as no name at all, rather than storing whitespace", () => {
    const storage = createFakeStorage();
    saveDisplayName("   ", storage);
    expect(loadDisplayName(storage)).toBeNull();
  });

  it("caps the length, so one Participant cannot push the others off the overlay", () => {
    const storage = createFakeStorage();
    saveDisplayName("x".repeat(200), storage);
    expect(loadDisplayName(storage)!.length).toBeLessThanOrEqual(24);
  });

  it("is not scoped per Room — unlike the tutorial, a name follows you", () => {
    const storage = createFakeStorage();
    saveDisplayName("Julien", storage);
    // No Room argument exists to pass; this is the assertion that the API
    // itself carries the decision.
    expect(loadDisplayName.length).toBe(1);
  });

  it("treats null storage as no name and a no-op save", () => {
    expect(loadDisplayName(null)).toBeNull();
    expect(() => saveDisplayName("Julien", null)).not.toThrow();
  });

  it("treats a throwing storage as no name and a no-op save, never throwing itself", () => {
    const storage = createThrowingStorage();
    expect(() => loadDisplayName(storage)).not.toThrow();
    expect(loadDisplayName(storage)).toBeNull();
    expect(() => saveDisplayName("Julien", storage)).not.toThrow();
  });
});

describe("participant id", () => {
  it("mints one when there is none, and keeps it afterwards", () => {
    const storage = createFakeStorage();
    const first = loadOrCreateParticipantId(storage);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(loadOrCreateParticipantId(storage)).toBe(first);
  });

  it("still returns a usable id when storage is unavailable", () => {
    // The whole feature would otherwise collapse in a private window: the id
    // is the Realtime presence key, so no id means no presence at all. A
    // per-session id is a worse identity than a persistent one, and a far
    // better one than none.
    const id = loadOrCreateParticipantId(null);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ignores a stored value that is not a plausible id", () => {
    const storage = createFakeStorage({ "jigsaw:participant-id": "<script>" });
    expect(loadOrCreateParticipantId(storage)).not.toBe("<script>");
  });
});

describe("getSafeLocalStorage", () => {
  it("returns null outside a browser environment", () => {
    // Vitest runs with `environment: "node"`, so there is no `window` — this
    // exercises the exact guard that protects SSR and a sandboxed context.
    expect(getSafeLocalStorage()).toBeNull();
  });
});

describe("colour", () => {
  it("is stable for the same participant", () => {
    expect(colorForParticipant("abc-123")).toBe(colorForParticipant("abc-123"));
  });

  it("only ever comes from the palette", () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
      expect(PARTICIPANT_COLORS).toContain(colorForParticipant(id));
    }
  });

  it("spreads across the palette rather than favouring one entry", () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) => colorForParticipant(`participant-${i}`)),
    );
    expect(seen.size).toBe(PARTICIPANT_COLORS.length);
  });
});
