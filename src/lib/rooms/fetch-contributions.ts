"use server";

import { pgPool } from "@/lib/db/pg";
import { toContributionRow, type ContributionRow } from "./contribution-row";

/** Where the previous page stopped. */
export type ContributionCursor = { createdAt: string; id: string };

// Enough to fill a panel without a scroll on first open, small enough that
// a Room with fifteen hundred contributions does not send them all.
const PAGE_SIZE = 30;

/**
 * One page of a Room's history, newest first.
 *
 * A Server Action over the direct pool rather than a client-side PostgREST
 * read, for the two reasons `room-state.ts` already records: it is how
 * everything in this app reaches the database (AD-2), and it does not depend
 * on a service the app otherwise never uses — this project's PostgREST was
 * returning `PGRST002` for every anonymous read as recently as 2026-09-20.
 *
 * Paginated by a **cursor, not an offset**. Rows are inserted at the head
 * while someone reads: an offset would silently repeat or skip entries every
 * time a piece was placed mid-scroll. `(created_at, id)` because two
 * contributions from one gesture share a timestamp to the microsecond —
 * locking in an Îlot writes all of its pieces in a single statement.
 *
 * No auth gate, matching `getRoomBySlug` and the piece Server Actions:
 * Guests play without an account, and this returns nothing they cannot
 * already see in the Room.
 */
export async function fetchContributions(
  roomId: string,
  cursor?: ContributionCursor,
): Promise<{ rows: ContributionRow[]; nextCursor: ContributionCursor | null }> {
  const result = await pgPool.query(
    `select id, piece_id, kind, user_id, guest_participant_id, pseudo, created_at
     from contribution
     where room_id = $1
       and ($2::timestamptz is null or (created_at, id) < ($2::timestamptz, $3::uuid))
     order by created_at desc, id desc
     limit ${PAGE_SIZE + 1}`,
    [roomId, cursor?.createdAt ?? null, cursor?.id ?? null],
  );

  // One extra row is fetched purely to answer "is there more" without a
  // second count query, then dropped.
  const hasMore = result.rows.length > PAGE_SIZE;
  const page = result.rows.slice(0, PAGE_SIZE);
  // Shared with the live feed rather than hand-written twice — see
  // `contribution-row.ts`.
  const rows = page
    .map(toContributionRow)
    .filter((row): row is ContributionRow => row !== null);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}
