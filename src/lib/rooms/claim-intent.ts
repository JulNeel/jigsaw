import { getSafeSessionStorage } from "@/lib/rooms/tutorial-seen";

const KEY = "jigsaw:claim-participant-id";

/**
 * "I am leaving in order to keep what I did."
 *
 * `sessionStorage`, deliberately not `localStorage`: this belongs to one act
 * of leaving, not to the browser for ever. A Guest who starts signing up and
 * wanders off should not have the intent fire weeks later against whoever
 * signs in next — on a shared machine that would attach their pieces to a
 * stranger's account.
 *
 * Reuses `tutorial-seen.ts`'s own throw-safe accessor rather than a second
 * copy: storage property access itself can throw in a privacy-configured
 * browser, and there should be exactly one place in this codebase that
 * knows that.
 */
export function rememberClaimIntent(participantId: string): void {
  try {
    getSafeSessionStorage()?.setItem(KEY, participantId);
  } catch {
    // Losing the intent costs attribution, never the contributions
    // themselves, and must never block someone from leaving.
  }
}

/**
 * Reads the intent and clears it in the same breath.
 *
 * Read-and-delete rather than read-then-delete-on-success: a claim that
 * fails should not be retried automatically on the next page this component
 * happens to mount on. The contributions stay claimable — the Guest's
 * browser still has its id — but the retry is the person's to ask for.
 */
export function consumeClaimIntent(): string | null {
  const storage = getSafeSessionStorage();
  if (!storage) {
    return null;
  }
  try {
    const value = storage.getItem(KEY);
    if (value) {
      // `removeItem` is outside `SimpleStorage`'s two methods, hence the
      // direct access here — guarded by the same try.
      (storage as Storage).removeItem?.(KEY);
    }
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
