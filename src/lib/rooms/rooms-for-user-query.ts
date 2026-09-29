/**
 * The Home listing query, deliberately *not* `server-only`.
 *
 * `get-rooms-for-user.ts` is the real entry point and stays `server-only`
 * because it reaches for the app's pool. This module holds only the SQL and
 * the row mapping, and takes whatever client the caller already has — which
 * is what lets the e2e suite exercise it against real seeded rows with its
 * own pool (`e2e/support/db.ts` exists for exactly this reason: anything
 * importing `server-only` throws outside a React Server Component).
 *
 * That matters here more than usual. Everything this story adds lives in one
 * `where` clause and one `order by`, Home sits behind `requireUser`, and the
 * harness never writes to `auth.users` — so no browser test can reach the
 * screen. The SQL is the only part that can be tested, and it is also the
 * only part that can be wrong.
 */

export type Room = {
  id: string;
  name: string;
  inviteSlug: string;
  pieceCount: number;
  piecesPlaced: number;
  onlineCount: number;
  imageSource: "library" | "upload";
  imageLibraryId: string | null;
  /**
   * Whether this Participant created the Room, as opposed to merely having
   * played in it. Drives one thing today — who is offered the delete button
   * — and it is an ergonomic distinction, not a security one: `deleteRoom`
   * already carries `and created_by = $2` in its own `where`. A non-owner
   * pressing the button would not delete anything; they would simply watch
   * nothing happen, which is worse than being refused.
   */
  isOwner: boolean;
  /**
   * How many of this Room's contributions are this Participant's own.
   * "Progress" told only as the Room's overall count says nothing about what
   * *you* did, which is the thing a returning Participant came back for.
   * Epic 5 owns per-Participant statistics proper; this is one number.
   */
  myContributions: number;
};

type QueryResult = { rows: Array<Record<string, unknown>> };
export type RoomsQueryable = {
  query(text: string, values: unknown[]): Promise<QueryResult>;
};

/**
 * Rooms this Participant created **or** contributed to.
 *
 * Two things about the shape of this query are deliberate.
 *
 * **The counts are computed separately.** Joining `piece` and `contribution`
 * in the same `from` would multiply them by each other — a 9-piece Room with
 * 4 contributions would report 36 of each. So `pieces_placed` is a scalar
 * subquery and the contribution aggregates come from a `lateral`, and
 * neither can see the other.
 *
 * **Ordering is by *your* last contribution, not the Room's age.** When a
 * Room can now appear because someone else made it, `created_at desc` orders
 * the list by a date the Participant has no relationship to. `coalesce`
 * falls back to the Room's creation for one they own but never played —
 * without it those Rooms would sort as null and drift to the wrong end.
 *
 * The `or` in the `where` means Postgres cannot seek on `created_by` alone
 * and will scan `room`, with an index lookup per row for the lateral. That
 * is the right trade at this app's scale (a household's Rooms, not a feed)
 * and worth revisiting only if `room` ever grows by orders of magnitude.
 */
export async function readRoomsForUser(
  client: RoomsQueryable,
  userId: string,
): Promise<Room[]> {
  const result = await client.query(
    `select r.id, r.name, r.invite_slug, r.grid_rows, r.grid_cols,
            r.image_source, r.image_library_id,
            (r.created_by = $1) as is_owner,
            (select count(*) from piece p
              where p.room_id = r.id and p.placed_row is not null)
              as pieces_placed,
            mine.contribution_count,
            mine.last_contributed_at
     from room r
     left join lateral (
       select count(*) as contribution_count,
              max(c.created_at) as last_contributed_at
       from contribution c
       where c.room_id = r.id and c.user_id = $1
     ) mine on true
     where r.created_by = $1 or mine.contribution_count > 0
     order by coalesce(mine.last_contributed_at, r.created_at) desc, r.id desc`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    inviteSlug: row.invite_slug as string,
    pieceCount: (row.grid_rows as number) * (row.grid_cols as number),
    // `count(*)` comes back from `pg` as a string: bigint does not fit a
    // JS number in the general case, so the driver refuses to guess.
    piecesPlaced: Number(row.pieces_placed),
    onlineCount: 0,
    imageSource: row.image_source as "library" | "upload",
    imageLibraryId: row.image_library_id as string | null,
    isOwner: row.is_owner as boolean,
    myContributions: Number(row.contribution_count),
  }));
}
