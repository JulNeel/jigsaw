import "server-only";

import type { PoolClient } from "pg";
import type { ResolvedActor } from "./contribution-actor";

/**
 * What a Participant did, as the Room will remember it.
 *
 * A plain reposition is deliberately not a kind. Sliding a piece around the
 * mat is not contributing, and a history that counted it would be unreadable
 * within a minute of play. These two are also the app's own existing
 * vocabulary — the placement chime and the pulse fire on exactly these.
 */
export type ContributionKind = "placed" | "fused";

/**
 * Writes the history rows for one gesture.
 *
 * **Takes the caller's `PoolClient`, never the pool.** These rows belong to
 * the same transaction as the placement or fusion they describe: any other
 * arrangement allows a contribution for a placement that rolled back, or a
 * placement with no trace of who made it. This codebase has already spent
 * days on states that disagree with each other, and this is a cheap place
 * not to create another.
 *
 * One statement regardless of how many pieces — locking an Îlot of twelve is
 * twelve rows, and twelve round trips inside a held transaction would be a
 * noticeable pause in the one place the app cannot afford one.
 */
export async function recordContributions(
  client: PoolClient,
  args: {
    roomId: string;
    pieceIds: readonly string[];
    kind: ContributionKind;
    actor: ResolvedActor;
  },
): Promise<void> {
  if (args.pieceIds.length === 0) {
    return;
  }
  const { roomId, kind, actor } = args;
  const values: unknown[] = [roomId, kind, actor.userId, actor.guestParticipantId, actor.pseudo];
  const rows = args.pieceIds.map((pieceId) => {
    values.push(pieceId);
    return `($1, $${values.length}, $2, $3, $4, $5)`;
  });
  await client.query(
    `insert into contribution
       (room_id, piece_id, kind, user_id, guest_participant_id, pseudo)
     values ${rows.join(", ")}`,
    values,
  );
}
