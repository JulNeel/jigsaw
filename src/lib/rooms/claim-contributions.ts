"use server";

import { createClient } from "@/lib/auth/supabase-server";
import { pgPool } from "@/lib/db/pg";
import { guestKeyFor } from "@/lib/rooms/guest-key";

export type ClaimResult =
  | { ok: true; claimed: number }
  | { ok: false; reason: "not-signed-in" | "failed" };

/**
 * Attaches a browser's Guest contributions to the account now signed in.
 *
 * Three things make this safe, and all three are load-bearing.
 *
 * **The account is the caller's own, from the session.** It is never an
 * argument. An action that took a target user id would let anyone move
 * anyone's contributions anywhere.
 *
 * **The Guest key is derived here from the raw id**, which only that
 * browser has. The database stores the hash, and the hash is broadcast to
 * the whole Room — so knowing what the history shows is not enough to claim
 * anything (Story 4.3's own reason for existing).
 *
 * **`and user_id is null`** is not redundant with the key check. It makes
 * the action idempotent, and it means that even if a raw id leaked later,
 * an already-claimed contribution cannot be taken from the person who
 * claimed it.
 *
 * Deliberately not scoped to one Room. A Guest who played in three Rooms
 * from this browser gets all three, which is more than AC #3's "current
 * session" asks for and strictly better for the person: the alternative is
 * contributions they made, on this machine, staying anonymous for ever.
 */
export async function claimContributions(participantId: string): Promise<ClaimResult> {
  let userId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) {
      return { ok: false, reason: "not-signed-in" };
    }
    userId = data.claims.sub;
  } catch {
    return { ok: false, reason: "not-signed-in" };
  }

  try {
    const result = await pgPool.query(
      `update contribution
       set user_id = $1, guest_key = null
       where guest_key = $2 and user_id is null`,
      [userId, guestKeyFor(participantId)],
    );
    return { ok: true, claimed: result.rowCount ?? 0 };
  } catch (err) {
    // Worth a server-side line: a failure here means someone's history
    // silently stayed anonymous, which is invisible from the outside.
    console.error("claimContributions failed:", err);
    return { ok: false, reason: "failed" };
  }
}
