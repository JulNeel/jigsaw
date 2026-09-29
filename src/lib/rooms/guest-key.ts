import { createHash } from "node:crypto";

/**
 * The public stand-in for a Guest's own browser id.
 *
 * A Guest's `participantId` is a `crypto.randomUUID()` that never leaves
 * their `localStorage` — except that, stored raw, it did: every
 * contribution row is broadcast to the whole Room over Realtime and
 * returned by the history read. Once claiming a contribution is keyed on
 * that id, handing it out is handing out the ability to claim.
 *
 * So the database holds this instead. It is stable (the same browser always
 * produces the same key, so a Guest's lines group and colour together), and
 * it is not reversible — claiming still requires the pre-image, which only
 * that browser has.
 *
 * Unsalted on purpose. A salt protects a *low-entropy* input from being
 * brute-forced; the input here is a random UUID, so there is nothing to
 * enumerate. A per-row salt would additionally break the one property this
 * needs: that the same Guest always maps to the same key.
 *
 * Must stay byte-for-byte what the migration computes in Postgres
 * (`encode(sha256(convert_to(id, 'UTF8')), 'hex')`) — lowercase hex of the
 * UTF-8 bytes. A mismatch would not fail anywhere; it would quietly make
 * every claim match nothing.
 */
export function guestKeyFor(participantId: string): string {
  return createHash("sha256").update(participantId, "utf8").digest("hex");
}
