const STORAGE_KEY_PREFIX = "jigsaw:tutorial-seen:";
const SEEN_VALUE = "1";

// Injected rather than reading `window.sessionStorage` directly, so this
// stays a pure function testable under Vitest's `environment: "node"` (no
// `window` global). `null` means "storage unavailable" — treated as
// always-unseen / a no-op save, never a thrown error.
export type SimpleStorage = Pick<Storage, "getItem" | "setItem">;

export function hasSeenTutorial(roomSlug: string, storage: SimpleStorage | null): boolean {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(`${STORAGE_KEY_PREFIX}${roomSlug}`) === SEEN_VALUE;
  } catch {
    // A storage object can exist but still throw on access (e.g. Safari
    // private browsing) — "never throw" is the contract regardless of why.
    return false;
  }
}

export function markTutorialSeen(roomSlug: string, storage: SimpleStorage | null): void {
  try {
    storage?.setItem(`${STORAGE_KEY_PREFIX}${roomSlug}`, SEEN_VALUE);
  } catch {
    // Best-effort cache only — a QuotaExceededError or similar must not
    // block the dialog from closing.
  }
}

// `window.sessionStorage` *property access itself* can throw (`SecurityError`)
// in private-browsing/blocked-cookie/sandboxed-iframe contexts — not just a
// hypothetical, this is exactly the kind of privacy-conscious browser
// configuration a Guest reaching this app with "zero friction" is likely to
// have. Every call site must go through this, never touch
// `window.sessionStorage` directly.
export function getSafeSessionStorage(): SimpleStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
