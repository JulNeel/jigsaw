import { expect, test } from "./support/fixtures";
import { borrowUserIds, seedContribution } from "./support/seed";
import { getPool } from "./support/db";
import { readRoomsForUser } from "../src/lib/rooms/rooms-for-user-query";

/**
 * Story 4.4 — a returning Participant finds their Rooms on Home.
 *
 * **No browser opens in this file, on purpose.** Home is behind
 * `requireUser`, and this harness never writes to `auth.users` — so no test
 * that drives a page can reach the screen. What it *can* reach is the part
 * that carries all the risk: one `where` clause, one `order by`, and two
 * aggregates that must not multiply each other. That query is imported here
 * directly, which is the whole reason it lives in `rooms-for-user-query.ts`
 * instead of beside the `server-only` pool.
 *
 * The two accounts are borrowed, never created, and a seeded Room's owner is
 * a foreign key into `auth.users` — so "a Room I did not create" is the one
 * case that cannot be faked, and it is exactly the case this story adds.
 */

const grid = { gridRows: 3, gridCols: 3 } as const;

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60_000);
}

test("Home lists the Rooms you played in, not only the ones you made", async ({ seed }) => {
  const [me, someoneElse] = await borrowUserIds(2);

  // Mine, never played. The `coalesce` case: no contribution date to sort
  // by, so it falls back to the Room's own creation — and seeded Rooms are
  // created now, which puts this one first.
  const untouched = await seed(grid);

  // Mine, played in. Two pieces placed *and* two contributions: if the two
  // counts were computed in one join they would multiply, and both would
  // read 4.
  const played = await seed({
    ...grid,
    pieces: {
      "1,1": { placed: { row: 1, col: 1 } },
      "1,2": { placed: { row: 1, col: 2 } },
    },
  });
  await seedContribution({
    roomId: played.roomId,
    pieceId: played.pieceId(1, 1),
    userId: me,
    createdAt: minutesAgo(10),
  });
  await seedContribution({
    roomId: played.roomId,
    pieceId: played.pieceId(1, 2),
    userId: me,
    kind: "fused",
    createdAt: minutesAgo(9),
  });

  // Someone else's, played in — the Room that had no way back before this
  // story. A Guest row sits alongside mine to prove the count filters on
  // `user_id` rather than counting the Room's whole history.
  const joined = await seed({ ...grid, ownerId: someoneElse });
  await seedContribution({
    roomId: joined.roomId,
    pieceId: joined.pieceId(2, 2),
    userId: me,
    createdAt: minutesAgo(60),
  });
  await seedContribution({
    roomId: joined.roomId,
    pieceId: joined.pieceId(2, 1),
    userId: null,
    guestKey: "f".repeat(64),
    createdAt: minutesAgo(55),
  });

  // Someone else's, never played in. The listing must stay a listing and
  // not become "every Room that exists".
  const stranger = await seed({ ...grid, ownerId: someoneElse });
  await seedContribution({
    roomId: stranger.roomId,
    pieceId: stranger.pieceId(1, 1),
    userId: someoneElse,
  });

  const rooms = await readRoomsForUser(getPool(), me);
  const byId = new Map(rooms.map((room) => [room.id, room]));

  expect(byId.get(stranger.roomId)).toBeUndefined();

  expect(byId.get(untouched.roomId)).toMatchObject({
    isOwner: true,
    myContributions: 0,
    piecesPlaced: 0,
    pieceCount: 9,
  });

  expect(byId.get(played.roomId)).toMatchObject({
    isOwner: true,
    myContributions: 2,
    // Not 4. This is the assertion that fails if the aggregates are ever
    // folded back into a single join.
    piecesPlaced: 2,
  });

  expect(byId.get(joined.roomId)).toMatchObject({
    isOwner: false,
    // Not 2: the Guest's row belongs to the Room's history, not to mine.
    myContributions: 1,
  });

  // Ordered by when *I* last played, newest first — and only among the
  // Rooms this test seeded, since the borrowed account owns real ones too.
  const seededOrder = rooms
    .map((room) => room.id)
    .filter((id) => id === untouched.roomId || id === played.roomId || id === joined.roomId);
  expect(seededOrder).toEqual([untouched.roomId, played.roomId, joined.roomId]);
});

test("a Room you only looked at does not follow you home", async ({ seed }) => {
  // The boundary that keeps the list meaningful. Moving a piece around the
  // mat writes no contribution (Story 4.2's rule, tested there), so opening
  // someone's Room and shuffling pieces must not add it to your dashboard —
  // otherwise Home fills up with every link anyone ever sent you.
  const [me, someoneElse] = await borrowUserIds(2);
  const room = await seed({ ...grid, ownerId: someoneElse });

  const rooms = await readRoomsForUser(getPool(), me);
  expect(rooms.some((entry) => entry.id === room.roomId)).toBe(false);
});
