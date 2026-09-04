const STORAGE_KEY = "jigsaw:sound-muted";
const MUTED_VALUE = "1";

// Injected rather than reading `window.localStorage` directly, so this stays
// a pure function testable under Vitest's `environment: "node"` (no `window`
// global) — mirrors `tutorial-seen.ts`'s `SimpleStorage` pattern.
export type SimpleStorage = Pick<Storage, "getItem" | "setItem">;

export function getSoundMuted(storage: SimpleStorage | null): boolean {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(STORAGE_KEY) === MUTED_VALUE;
  } catch {
    // A storage object can exist but still throw on access (e.g. Safari
    // private browsing) — default to unmuted rather than throwing.
    return false;
  }
}

export function setSoundMuted(muted: boolean, storage: SimpleStorage | null): void {
  try {
    storage?.setItem(STORAGE_KEY, muted ? MUTED_VALUE : "0");
  } catch {
    // Best-effort persistence only — a QuotaExceededError or similar must
    // not block the mute toggle from taking effect for the current visit.
  }
}

// `window.localStorage` *property access itself* can throw (`SecurityError`)
// in private-browsing/blocked-cookie/sandboxed-iframe contexts — every call
// site must go through this, never touch `window.localStorage` directly.
export function getSafeLocalStorage(): SimpleStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
