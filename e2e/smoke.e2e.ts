import { expect, test } from "./support/fixtures";
import { readPiece, countClusters } from "./support/db";
import { dragPieceToWorld } from "./support/drag";
import { assertNoLogLine, logTail } from "./support/server-log";
import { pieceVersion, waitForVersionAbove } from "./support/wait";

/**
 * Proves the whole chain in one test: seeding, tutorial bypass, canvas
 * readiness, world→screen conversion, Konva's drag threshold, the drop, the
 * Server Action, the Realtime round trip, the database read-back, and the
 * server-log capture. If this is green, the harness works; if it is red,
 * nothing built on top of it can be trusted.
 *
 * The pair is deliberately non-corner and away from the Frame: a corner
 * piece resting at its true corner would trigger the placement bootstrap,
 * and proximity to a slot would bring contagion into play. Neither is under
 * test here — only plain fusion of two true neighbours.
 */
test("two true neighbours fuse when one is dragged against the other", async ({
  page,
  seed,
  openRoom,
  logCursor,
  clientErrors,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      "1,1": { at: { x: -250, y: 0 } },
      "1,2": { at: { x: 250, y: 0 } },
    },
  });
  const movingId = room.pieceId(1, 1);
  const anchorId = room.pieceId(1, 2);

  await openRoom(room);

  expect(await pieceVersion(page, movingId), "seeded pieces start at version 0").toBe(0);

  // One exact tile-width to the left of (1,2) — dead centre of the ±45px
  // contact window (CONTACT_TOLERANCE_FACTOR 0.45 × 100px tiles).
  const { from, to } = await dragPieceToWorld(page, movingId, {
    x: 250 - room.geom.tileWidth,
    y: 0,
  });

  await waitForVersionAbove(page, movingId, 0);

  // The database is the ground truth. The optimistic render can agree with a
  // fusion that never happened — that is one of the bugs this harness was
  // built to catch — so the assertion has to come from here.
  const moved = await readPiece(movingId);
  const anchor = await readPiece(anchorId);

  expect(
    moved.cluster_id,
    `piece (1,1) did not fuse. Dragged ${JSON.stringify(from)} -> ${JSON.stringify(to)}.\n` +
      `Server log:\n${logTail(logCursor)}`,
  ).not.toBeNull();
  expect(anchor.cluster_id, "the two pieces ended up in different clusters").toBe(
    moved.cluster_id,
  );
  expect(await countClusters(room.roomId)).toBe(1);

  // Fused side by side: same row within the cluster, adjacent columns.
  expect(moved.cluster_offset_row).toBe(anchor.cluster_offset_row);
  expect(Math.abs(moved.cluster_offset_col! - anchor.cluster_offset_col!)).toBe(1);

  // Neither piece is placed — nothing here should have touched the Frame.
  expect(moved.placed_row).toBeNull();
  expect(anchor.placed_row).toBeNull();

  // A pass that was quietly rejecting writes is not a pass.
  assertNoLogLine(logCursor, /\[move-reject\][^\n]*/, "the drag should have been accepted");
  assertNoLogLine(logCursor, /\[no-fusion\][^\n]*/, "the drop should have fused");
  expect(clientErrors, "unexpected browser console errors").toEqual([]);
});

/**
 * The other half of the smoke test, and the reason it can be trusted: a
 * fusion assertion that never fails proves nothing. This drops the same
 * piece nowhere near its neighbour and requires that *nothing* happens.
 *
 * It also covers a real acceptance criterion in its own right (Story 3.8:
 * sorting pieces near each other must have zero effect unless they actually
 * touch), so it earns its place beyond validating the harness.
 */
test("a drop away from any neighbour repositions without fusing", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      "1,1": { at: { x: -250, y: 0 } },
      "1,2": { at: { x: 250, y: 0 } },
    },
  });
  const movingId = room.pieceId(1, 1);

  await openRoom(room);
  // Well beyond the contact window: 350px from (1,2), where a tile is 100.
  await dragPieceToWorld(page, movingId, { x: -100, y: 0 });
  await waitForVersionAbove(page, movingId, 0);

  const moved = await readPiece(movingId);
  expect(moved.cluster_id, `unexpected fusion.\nServer log:\n${logTail(logCursor)}`).toBeNull();
  expect(moved.placed_row).toBeNull();
  // The move itself must still have landed — "no fusion" must not quietly
  // mean "no write at all".
  expect(Math.round(moved.scatter_x)).toBe(-100);
});
