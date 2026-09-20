"use server";

import { pgPool } from "@/lib/db/pg";

/**
 * The authoritative current state of a Room's pieces and Clusters.
 *
 * Exists for reconciliation (`collections.ts`'s `resyncRoom`): when a client
 * can tell its Realtime view has gone stale, this is how it finds out the
 * truth. Rows are returned raw, in database shape, because the caller folds
 * them through exactly the same write path a Realtime payload takes — one
 * mapping, not two that could drift.
 *
 * Deliberately a Server Action over the direct Postgres pool rather than a
 * client-side PostgREST read, for two reasons. It matches how everything
 * else in this app reaches the database (Architecture AD-2), and it does not
 * depend on a service the app otherwise never uses — during this function's
 * own development the project's PostgREST was returning `PGRST002` for every
 * anon read while the direct connection was perfectly healthy, which would
 * have made the repair silently useless exactly when it was needed.
 *
 * No auth gate, matching `getRoomBySlug` and the piece Server Actions: Guests
 * play without an account, and this returns nothing they cannot already see.
 * Signed tile URLs are *not* included — the client keeps the ones it was
 * given at page load, so reconciliation costs no Storage round trip.
 */
export async function fetchRoomState(roomId: string): Promise<{
  pieces: Record<string, unknown>[];
  clusters: Record<string, unknown>[];
}> {
  const [pieces, clusters] = await Promise.all([
    pgPool.query(
      `select id, shape_type, grid_row, grid_col, scatter_x, scatter_y, rotation,
              placed_row, placed_col, version, cluster_id,
              cluster_offset_row, cluster_offset_col
       from piece where room_id = $1`,
      [roomId],
    ),
    pgPool.query(`select id, anchor_x, anchor_y, version from cluster where room_id = $1`, [
      roomId,
    ]),
  ]);
  return { pieces: pieces.rows, clusters: clusters.rows };
}
