import { expect, test } from "./support/fixtures";
import { readPiece } from "./support/db";
import { dragPieceToWorld } from "./support/drag";
import { assertNoLogLine, logTail } from "./support/server-log";
import { waitForVersionAbove } from "./support/wait";

/**
 * Moves that come back rejected, and the piece jumping home as a result.
 *
 * A rejection rolls the optimistic mutation back, so the piece returns to
 * wherever the server still believes it is — the "revient systématiquement à
 * sa place" symptom. Two rejection codes produce it, from opposite causes,
 * and the server log is the only place they can be told apart:
 *
 *   STALE_WRITE     the client's cached version fell behind the server's
 *   ALREADY_PLACED  the version matched, but the piece is locked in the Frame
 *                   — meaning the client let a locked piece be dragged at all
 *
 * Neither should ever be reachable by a single player playing normally.
 */

test("dragging the same piece twice in quick succession is not a self-conflict", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: { "1,1": { at: { x: -250, y: 0 } } },
  });
  const movingId = room.pieceId(1, 1);

  await openRoom(room);

  // Deliberately *not* awaiting the first round trip. Each `.update()` opens
  // its own transaction immediately, so the second drag reads the version
  // floor before the first write has come back — the exact race the
  // speculative version floor in `collections.ts` exists to absorb. Both
  // targets are in open space, so nothing here depends on fusion.
  await dragPieceToWorld(page, movingId, { x: -100, y: -200 });
  await dragPieceToWorld(page, movingId, { x: 200, y: 150 });

  await waitForVersionAbove(page, movingId, 1);

  assertNoLogLine(
    logCursor,
    /\[move-reject\] STALE_WRITE[^\n]*/,
    "two quick drags by the same player must not conflict with each other",
  );

  // Tolerance rather than equality: the target is converted to screen pixels
  // to aim the mouse and converted back by the app, so a drop lands within
  // well under a pixel of world space, not exactly on it. Anything beyond a
  // couple of pixels would mean the wrong drag won, not rounding.
  const moved = await readPiece(movingId);
  const landed = { x: moved.scatter_x, y: moved.scatter_y };
  expect(
    Math.hypot(landed.x - 200, landed.y - 150),
    `the second drag did not win — landed at (${landed.x.toFixed(1)}, ${landed.y.toFixed(1)}), ` +
      `expected (200, 150).\nServer log:\n${logTail(logCursor)}`,
  ).toBeLessThan(2);

  // The mechanised form of "did it snap back?": what the player sees has to
  // agree with what the database holds, once everything has settled.
  const drift = await page.evaluate(
    ([id, world]) => {
      const handle = window.__jigsawE2E!;
      const onScreen = handle.pieceScreen(id as string)!;
      const fromDb = handle.toScreen(world as { x: number; y: number });
      return Math.hypot(onScreen.x - fromDb.x, onScreen.y - fromDb.y);
    },
    [movingId, { x: moved.scatter_x, y: moved.scatter_y }] as const,
  );
  expect(drift, "the piece is rendered somewhere other than where the server has it").toBeLessThan(
    1,
  );
});

test("a piece locked into the Frame never dispatches a move", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      // Already locked in, as if placed earlier in the session.
      "1,1": { placed: { row: 1, col: 1 } },
      // An ordinary loose piece, used purely as a timing barrier below.
      "0,1": { at: { x: -250, y: -250 } },
    },
  });
  const lockedId = room.pieceId(1, 1);
  const barrierId = room.pieceId(0, 1);

  await openRoom(room);

  // The client is supposed to cancel this at drag-start (`stopDrag()` in
  // `SoloPieceSprite`) and dispatch nothing at all. If a move does go out,
  // the server answers ALREADY_PLACED and the piece snaps back to its slot —
  // one of the two live hypotheses for the recurring report.
  await dragPieceToWorld(page, lockedId, { x: -300, y: 300 });

  // An absence can't be waited for, so a *presence* provides the barrier: by
  // the time an unrelated piece's move has completed a full round trip, any
  // move the locked piece dispatched would long since have been logged.
  await dragPieceToWorld(page, barrierId, { x: -100, y: -300 });
  await waitForVersionAbove(page, barrierId, 0);

  assertNoLogLine(
    logCursor,
    /\[move-reject\] ALREADY_PLACED[^\n]*/,
    "the client dispatched a move for a piece that is locked into the Frame",
  );

  const locked = await readPiece(lockedId);
  expect(locked.version, "a locked piece must not be written to at all").toBe(0);
  expect(
    { row: locked.placed_row, col: locked.placed_col },
    `the locked piece moved.\nServer log:\n${logTail(logCursor)}`,
  ).toEqual({ row: 1, col: 1 });
});
