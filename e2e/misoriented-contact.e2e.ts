import { expect, test } from "./support/fixtures";
import { readPiece, waitForDbVersionAbove } from "./support/db";
import { dragPieceToWorld } from "./support/drag";

/**
 * Telling the two refusals apart.
 *
 * A drop that does not fuse can mean two very different things, and until
 * now both produced the same silent red pulse: either the pieces have
 * nothing to do with each other, or they are genuine neighbours that happen
 * to be turned off their as-cut orientation. Only the second is something
 * the player can act on, and it is the one they hit while playing (user
 * report, 2026-09-22: "impossible d'associer deux pièces qui ne sont pas
 * dans la bonne orientation absolue").
 *
 * No rule changed here — a rotated piece still does not fuse. What changed
 * is that the refusal now says which refusal it is.
 */

/** A distinctive fragment of `Canvas.misorientedContactMessage`. */
const HINT = /ne sont pas dans le bon sens/;

/** Parking spots well clear of the Frame and of the drop target. */
const FAR: Record<string, { at: { x: number; y: number } }> = {
  "0,2": { at: { x: 0, y: 300 } },
  "1,0": { at: { x: -300, y: 0 } },
  "2,0": { at: { x: -212, y: -212 } },
  "2,1": { at: { x: 0, y: -300 } },
  "2,2": { at: { x: 212, y: -212 } },
};

// Well below the Frame (which reaches y = 150), so nothing can place.
const STATIONARY = { x: 100, y: 260 };
const ADJACENT_TO_IT = { x: STATIONARY.x - 100, y: STATIONARY.y };

test("two true neighbours turned the wrong way are refused, and say so", async ({
  page,
  seed,
  openRoom,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      // Real neighbours — (1,1) sits directly left of (1,2) in the true grid
      // — and both turned the same quarter turn, so they interlock on screen
      // exactly as the player sees. Only orientation is in the way.
      "1,1": { at: { x: -320, y: 260 }, rotation: 90 },
      "1,2": { at: STATIONARY, rotation: 90 },
      "0,0": { at: { x: 300, y: 0 } },
      "0,1": { at: { x: 212, y: 212 } },
      ...FAR,
    },
  });
  const movingId = room.pieceId(1, 1);

  await openRoom(room);
  await dragPieceToWorld(page, movingId, ADJACENT_TO_IT);
  // A refused fusion is still a reposition, so the server does write. Waiting
  // for that write keeps the room's rows unlocked when the fixture deletes
  // them — ending the test mid-transaction deadlocks the cleanup.
  expect(await waitForDbVersionAbove(movingId, 0)).not.toBeNull();

  await expect(
    page.getByText(HINT).first(),
    "the drop was refused with nothing to distinguish it from a drop against an unrelated piece",
  ).toBeVisible({ timeout: 5_000 });

  // The rule itself is unchanged: rotated pieces still do not fuse.
  const moved = await readPiece(movingId);
  expect(moved.cluster_id, "a rotated piece must still not fuse").toBeNull();
  expect(moved.placed_row).toBeNull();
});

test("a drop against a piece that is no neighbour at all stays silent", async ({
  page,
  seed,
  openRoom,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      // (0,0) and (1,2) are not adjacent in the true grid, so no amount of
      // turning would ever join them — saying "wrong way round" here would
      // be wrong advice, and the hint must not appear.
      "0,0": { at: { x: -320, y: 260 } },
      "1,2": { at: STATIONARY },
      "0,1": { at: { x: 212, y: 212 } },
      "1,1": { at: { x: 300, y: 0 } },
      ...FAR,
    },
  });
  const movingId = room.pieceId(0, 0);

  await openRoom(room);
  await dragPieceToWorld(page, movingId, ADJACENT_TO_IT);

  // A negative needs a barrier: by the time the server has taken the
  // reposition, any hint this drop was going to raise has been raised. It
  // also keeps the row unlocked for the fixture's own cleanup.
  expect(await waitForDbVersionAbove(movingId, 0)).not.toBeNull();

  await expect(page.getByText(HINT)).toHaveCount(0);
});
