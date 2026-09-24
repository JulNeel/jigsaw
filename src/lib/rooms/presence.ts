import { colorForParticipant } from "./participant-identity";

/**
 * Turning Supabase's raw presence state into "who else is here".
 *
 * Pure on purpose. Everything below is a plain function of a state snapshot
 * and a clock, so the parts worth being sure about — the expiry window, one
 * person appearing twice, a malformed payload — are provable under Vitest
 * rather than by waiting in a browser.
 */

/**
 * How long someone stays listed after their last action.
 *
 * Raised from 30 seconds (user decision, 2026-09-23, and `epics.md`'s own AC
 * was amended with it). At 30s the overlay answered "who is working" — a
 * Participant watching you play vanished after half a minute, in a feature
 * whose stated purpose is a Room that feels lived-in.
 *
 * Lengthening it is cheap because it governs only *idle* Participants.
 * Someone who actually leaves drops the socket, Supabase emits a presence
 * `leave`, and they are gone at once whatever this says. The cost of a long
 * window is a lingering idle entry, never a ghost.
 */
export const PRESENCE_ACTIVITY_WINDOW_MS = 5 * 60_000;

/**
 * How often a client re-evaluates who has gone quiet.
 *
 * Sized to the window rather than copied from it: at a 5-minute cutoff, a
 * 5-second tick would be sixty wake-ups to notice one change, and nobody can
 * tell whether a name disappeared at 5:00 or at 5:20.
 */
export const PRESENCE_TICK_MS = 30_000;

/** What each client broadcasts about itself. */
export type PresencePayload = {
  participantId: string;
  /** `null` until they choose one; the UI decides what to call them. */
  name: string | null;
  lastActivityAt: number;
};

export type PresentParticipant = PresencePayload & { color: string };

/**
 * Clock skew is tolerated in one direction only, and deliberately.
 *
 * `lastActivityAt` is stamped on the sender's clock and read on ours. A
 * timestamp slightly in the future is a clock a few seconds fast, not an
 * error — and treating it as one would make that Participant flicker out.
 * A timestamp in the past is the case this exists to measure.
 */
export function isActive(lastActivityAt: number, now: number): boolean {
  return now - lastActivityAt <= PRESENCE_ACTIVITY_WINDOW_MS;
}

function readPayload(raw: unknown): PresencePayload | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { participantId, name, lastActivityAt } = raw as Record<string, unknown>;
  if (typeof participantId !== "string" || typeof lastActivityAt !== "number") {
    return null;
  }
  return {
    participantId,
    name: typeof name === "string" && name.length > 0 ? name : null,
    lastActivityAt,
  };
}

/**
 * The people to draw, from `channel.presenceState()`.
 *
 * Self is excluded: the AC asks for "who **else** is currently active", and
 * a solo player seeing an empty overlay is the honest answer to that.
 *
 * Supabase keys the state by presence key and gives an *array* per key — one
 * entry per live connection. Two tabs, or a reconnect not yet reaped, would
 * otherwise draw the same person twice, so each key collapses to its freshest
 * entry.
 *
 * Nothing here throws on bad input. This feeds an overlay; a payload from a
 * client running an older build must cost that one entry, not the list.
 */
export function toPresentParticipants(
  state: Record<string, unknown[]>,
  selfParticipantId: string,
  now: number,
): PresentParticipant[] {
  const freshest = new Map<string, PresencePayload>();

  for (const entries of Object.values(state)) {
    for (const raw of entries ?? []) {
      const payload = readPayload(raw);
      if (!payload || payload.participantId === selfParticipantId) {
        continue;
      }
      if (!isActive(payload.lastActivityAt, now)) {
        continue;
      }
      const existing = freshest.get(payload.participantId);
      if (!existing || payload.lastActivityAt > existing.lastActivityAt) {
        freshest.set(payload.participantId, payload);
      }
    }
  }

  // Ordered by id, not by activity: re-sorting as people act would make the
  // avatars swap places while you play, which is distracting and says
  // nothing useful.
  return [...freshest.values()]
    .sort((a, b) => a.participantId.localeCompare(b.participantId))
    .map((payload) => ({ ...payload, color: colorForParticipant(payload.participantId) }));
}

/**
 * Who joined and who left between two lists.
 *
 * Identity only — a Participant who renames themselves has not arrived, and
 * announcing them again would be noise in a screen reader.
 */
export function diffPresence(
  previous: readonly PresentParticipant[],
  next: readonly PresentParticipant[],
): { arrived: PresentParticipant[]; left: PresentParticipant[] } {
  const before = new Set(previous.map((p) => p.participantId));
  const after = new Set(next.map((p) => p.participantId));
  return {
    arrived: next.filter((p) => !before.has(p.participantId)),
    left: previous.filter((p) => !after.has(p.participantId)),
  };
}
