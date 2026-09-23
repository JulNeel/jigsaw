/**
 * Who a Participant is, as far as anyone else in the Room can see.
 *
 * Deliberately nothing to do with the `auth` account. Sign-up collects an
 * email and a password and nothing else, so a registered Participant has no
 * display name either — and an email must never be shown to strangers in a
 * shared Room. Everyone gets the same treatment: a name they chose, or none.
 *
 * Mirrors `tutorial-seen.ts`'s contract exactly — injected storage, `null`
 * meaning "unavailable", and never throwing — for the reason that file
 * documents: a privacy-configured browser can throw on the storage property
 * access *itself*, and a Guest reaching this app with zero friction is
 * exactly the person likely to have one.
 *
 * `localStorage` rather than `sessionStorage`, and not scoped per Room: the
 * tutorial is a per-tab, per-Room fact, a name is neither.
 */

const NAME_KEY = "jigsaw:display-name";
const ID_KEY = "jigsaw:participant-id";

// Long enough for a real first name, short enough that one Participant
// cannot push everyone else off the overlay.
const MAX_NAME_LENGTH = 24;

export type SimpleStorage = Pick<Storage, "getItem" | "setItem">;

export function loadDisplayName(storage: SimpleStorage | null): string | null {
  if (!storage) {
    return null;
  }
  try {
    return normalizeDisplayName(storage.getItem(NAME_KEY));
  } catch {
    return null;
  }
}

export function saveDisplayName(name: string, storage: SimpleStorage | null): void {
  const normalized = normalizeDisplayName(name);
  try {
    // A blank entry is "no name", not a name made of spaces — storing it
    // would make the prompt think it had already been answered.
    storage?.setItem(NAME_KEY, normalized ?? "");
  } catch {
    // Best-effort. Failing to remember a name must never block entry.
  }
}

function normalizeDisplayName(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, MAX_NAME_LENGTH);
}

/** A plausible `crypto.randomUUID()`, and nothing else. */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The stable id this browser is known by, minted once.
 *
 * This is the Realtime *presence key*, which is what makes a reconnect
 * replace an entry instead of adding a second one — so it has to exist
 * before the channel is created, well before a name is known.
 *
 * Unavailable storage still returns an id rather than null. A per-session
 * identity is a worse identity than a persistent one; no identity at all
 * would mean no presence at all, which is a much bigger loss for someone
 * whose only offence is browsing privately.
 */
export function loadOrCreateParticipantId(storage: SimpleStorage | null): string {
  try {
    const stored = storage?.getItem(ID_KEY);
    if (stored && ID_PATTERN.test(stored)) {
      return stored;
    }
  } catch {
    // Fall through and mint a fresh one.
  }
  const minted = crypto.randomUUID();
  try {
    storage?.setItem(ID_KEY, minted);
  } catch {
    // Same as above: an id that lasts this session beats no id.
  }
  return minted;
}

/**
 * The palette presence draws from.
 *
 * Fixed values, never a random hue. The app's palette is warm and narrow
 * (`globals.css`), and an arbitrary colour would clash with the mat, the
 * Frame outline and the pieces themselves. These are the accent values the
 * design already uses, plus two picked to sit alongside them.
 */
export const PARTICIPANT_COLORS = [
  "#8b5cf6", // grape-500
  "#2fb67c", // success
  "#e87710", // tangerine-600
  "#d1453a", // destructive
  "#3b82c4", // a cool counterweight in an otherwise warm palette
  "#8a5200", // warning
] as const;

/**
 * Stable, and spread across the palette.
 *
 * A plain `charCodeAt(0)` would put every `a…` participant on the same
 * colour; ids are random UUIDs, so this folds the whole string.
 */
export function colorForParticipant(participantId: string): string {
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) {
    hash = (hash * 31 + participantId.charCodeAt(i)) >>> 0;
  }
  return PARTICIPANT_COLORS[hash % PARTICIPANT_COLORS.length];
}

/**
 * `window.localStorage` *property access itself* can throw (`SecurityError`)
 * in private-browsing, blocked-cookie or sandboxed contexts. Every call site
 * must go through this and never touch `window.localStorage` directly — the
 * same rule, and the same reason, as `getSafeSessionStorage`.
 */
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
