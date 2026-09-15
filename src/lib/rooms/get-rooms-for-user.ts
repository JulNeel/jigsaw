import "server-only";
import { pgPool } from "@/lib/db/pg";

export type Room = {
  id: string;
  name: string;
  inviteSlug: string;
  pieceCount: number;
  piecesPlaced: number;
  onlineCount: number;
  imageSource: "library" | "upload";
  imageLibraryId: string | null;
};

/**
 * Rooms are read directly from Postgres in a Server Component — not a
 * Server Action, since this is a read, not a mutation (Architecture AD-2
 * governs writes). `onlineCount` is still static zero: live presence
 * (Epic 4) doesn't exist yet. `piecesPlaced` counts `piece.placed_row is
 * not null` — the same definition of "placed" used everywhere else in
 * this app (see `get-room-by-slug.ts`, `collections.ts`'s
 * `confirmedPlacedIds`) — bug fix (2026-09-13, user report: the dashboard
 * always showed 0 placed regardless of real progress): this was a
 * hardcoded literal `0`, left over from before Epic 3 shipped placement,
 * never updated afterward.
 */
export async function getRoomsForUser(userId: string): Promise<Room[]> {
  const result = await pgPool.query(
    `select r.id, r.name, r.invite_slug, r.grid_rows, r.grid_cols,
            r.image_source, r.image_library_id,
            count(p.id) filter (where p.placed_row is not null) as pieces_placed
     from room r
     left join piece p on p.room_id = r.id
     where r.created_by = $1
     group by r.id
     order by r.created_at desc`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    inviteSlug: row.invite_slug,
    pieceCount: row.grid_rows * row.grid_cols,
    piecesPlaced: Number(row.pieces_placed),
    onlineCount: 0,
    imageSource: row.image_source,
    imageLibraryId: row.image_library_id,
  }));
}
