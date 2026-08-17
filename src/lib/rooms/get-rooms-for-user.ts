import "server-only";
import { pgPool } from "@/lib/db/pg";

export type Room = {
  id: string;
  name: string;
  inviteSlug: string;
  pieceCount: number;
  piecesPlaced: number;
  onlineCount: number;
};

/**
 * Rooms are read directly from Postgres in a Server Component — not a
 * Server Action, since this is a read, not a mutation (Architecture AD-2
 * governs writes). `piecesPlaced`/`onlineCount` are still static zero:
 * placement (Epic 3) and live presence (Epic 4) don't exist yet.
 */
export async function getRoomsForUser(userId: string): Promise<Room[]> {
  const result = await pgPool.query(
    `select id, name, invite_slug, grid_rows, grid_cols
     from room
     where created_by = $1
     order by created_at desc`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    inviteSlug: row.invite_slug,
    pieceCount: row.grid_rows * row.grid_cols,
    piecesPlaced: 0,
    onlineCount: 0,
  }));
}
