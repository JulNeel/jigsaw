import "server-only";
import { pgPool } from "@/lib/db/pg";
import { readRoomsForUser, type Room } from "@/lib/rooms/rooms-for-user-query";

export type { Room };

/**
 * Rooms are read directly from Postgres in a Server Component — not a
 * Server Action, since this is a read, not a mutation (Architecture AD-2
 * governs writes). `onlineCount` is still static zero: live presence
 * (Story 4.1) is per-Room and ephemeral, and nothing broadcasts it to a
 * dashboard that isn't subscribed to the Room's channel.
 *
 * The SQL itself lives in `rooms-for-user-query.ts` rather than here, so
 * that it can be tested against real rows — this module's `server-only`
 * import throws anywhere outside a Server Component, the e2e suite
 * included (Story 4.4).
 *
 * `piecesPlaced` counts `piece.placed_row is not null` — the same
 * definition of "placed" used everywhere else in this app (see
 * `get-room-by-slug.ts`, `collections.ts`'s `confirmedPlacedIds`) — bug fix
 * (2026-09-13, user report: the dashboard always showed 0 placed regardless
 * of real progress): this was a hardcoded literal `0`, left over from
 * before Epic 3 shipped placement, never updated afterward.
 */
export async function getRoomsForUser(userId: string): Promise<Room[]> {
  return readRoomsForUser(pgPool, userId);
}
