import "server-only";

import { createClient } from "@/lib/auth/supabase-server";
import { normalizePseudo } from "@/lib/rooms/participant-identity";

/**
 * Who a client *says* it is. Nothing here is trusted on its own.
 */
export type ClaimedActor = {
  participantId: string;
  pseudo: string | null;
};

/**
 * Who the server has decided it is, and on what basis.
 *
 * Exactly one of the two ids is set, and which one records how much the row
 * can be relied on later — Story 4.3's conversion depends on being able to
 * tell "this was a Guest, and here is the browser it came from" apart from
 * "this was account X".
 */
export type ResolvedActor =
  | { userId: string; guestParticipantId: null; pseudo: string | null }
  | { userId: null; guestParticipantId: string; pseudo: string | null };

/**
 * Establishes the contributor for a write, server-side.
 *
 * **A signed-in Participant is never taken at their word.** The account id
 * comes from the session's own JWT, verified here; the client could claim any
 * `participantId` it liked and it would change nothing. That matters: without
 * it, anyone holding a Room's invite link could attribute their placements to
 * a real account.
 *
 * **A Guest is taken at their word, because there is nothing else to take.**
 * They have no session by definition — `participantId` and `pseudo` are what
 * their own browser generated, and both are forgeable. What forging them buys
 * is a wrong name on a history line, in a Room whose invite link the person
 * already holds and where they could simply place the piece themselves.
 * Accepted deliberately (Story 4.2's own scope decision), and it stops being
 * true the moment they sign up.
 *
 * `getClaims()` rather than `getUser()`: this runs on the hot path, once per
 * placed piece, and `getUser()` sends a request to the Auth server every
 * single time. `getClaims()` verifies the JWT locally against a cached JWKS
 * when the project signs asymmetrically, which this one does (`sb_publishable_`
 * / `sb_secret_` keys).
 *
 * Never throws. A failure to identify someone must not fail their move —
 * losing a line of history is a far smaller harm than losing the placement
 * it describes, so the worst case here is falling back to the Guest path.
 */
export async function resolveActor(claimed: ClaimedActor): Promise<ResolvedActor> {
  const guest: ResolvedActor = {
    userId: null,
    guestParticipantId: claimed.participantId,
    // Normalised server-side: length and blankness are not a client's to
    // decide, and this value is displayed to everyone else in the Room.
    pseudo: normalizePseudo(claimed.pseudo),
  };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) {
      return guest;
    }
    const metadata = data.claims.user_metadata;
    const pseudo =
      typeof metadata === "object" && metadata !== null
        ? normalizePseudo((metadata as Record<string, unknown>).pseudo as string | undefined)
        : null;
    return { userId: data.claims.sub, guestParticipantId: null, pseudo };
  } catch {
    // Auth unreachable, misconfigured, or a malformed cookie. Attributing
    // the contribution to the browser that made it is a worse answer than
    // attributing it to the account — and a much better one than refusing
    // the move.
    return guest;
  }
}
