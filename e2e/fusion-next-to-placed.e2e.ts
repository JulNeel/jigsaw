import { expect, test } from "./support/fixtures";
import { readPiece } from "./support/db";
import { dragPieceToWorld } from "./support/drag";
import { logTail } from "./support/server-log";
import { waitForVersionAbove } from "./support/wait";

/**
 * Dropping a loose piece against pieces already locked into the Frame.
 *
 * This is the configuration behind the still-open report (2026-09-20: "une
 * pièce refusant d'abord de fusionner avec 2 pièces validées, puis revient
 * systématiquement à la place où j'ai tenté de la placer, mais sans
 * fusionner"). Resting at the drop point is by design — `repositionPlain`
 * never bounces a piece back — so the symptom is precisely "no fusion, no
 * placement", which several different branches of `repositionFuseOrPlace`
 * can produce and which look identical from outside.
 *
 * Layout in every test below (3x3 grid, 100px tiles, frame centred on the
 * world origin), matching the report's "2 pièces validées":
 *
 *        col 1     col 2
 *   row 1  [A]  →  [B locked]
 *   row 2  [C locked]
 *
 * A is (1,1) and is a true neighbour of both: B=(1,2) to its right, and
 * C=(2,1) below it. Dropping A into its own slot puts it in genuine contact
 * with two already-placed pieces, so placement contagion should lock it in.
 */

const A = { row: 1, col: 1 } as const;
const B = { row: 1, col: 2 } as const;
const C = { row: 2, col: 1 } as const;

function baseFixture(extra: Record<string, { at: { x: number; y: number } }> = {}) {
  return {
    gridRows: 3,
    gridCols: 3,
    pieces: {
      "1,1": { at: { x: -250, y: 0 } },
      "1,2": { placed: { row: B.row, col: B.col } },
      "2,1": { placed: { row: C.row, col: C.col } },
      ...extra,
    },
  };
}

test("a piece dropped against two locked neighbours is locked in too", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed(baseFixture());
  const movingId = room.pieceId(A.row, A.col);

  await openRoom(room);
  await dragPieceToWorld(page, movingId, room.slotWorld(A.row, A.col));
  await waitForVersionAbove(page, movingId, 0);

  const moved = await readPiece(movingId);
  expect(
    { row: moved.placed_row, col: moved.placed_col },
    `the piece was not locked into its slot.\nServer log:\n${logTail(logCursor)}`,
  ).toEqual({ row: A.row, col: A.col });
  // Placement dissolves any grouping — a locked piece is never in a Cluster.
  expect(moved.cluster_id).toBeNull();
});

test("an incidental neighbour nearby does not prevent the lock-in", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  // (0,0) is a corner, diagonally opposite A in the true grid and therefore
  // not one of its neighbours. At 110px below A's target it lands inside the
  // ±45px contact window but outside the overlap guard's own one-tile box —
  // so this isolates the false-contact rule from the burial rule.
  const room = await seed(baseFixture({ "0,0": { at: { x: 0, y: 110 } } }));
  const movingId = room.pieceId(A.row, A.col);
  const parasiteId = room.pieceId(0, 0);

  await openRoom(room);
  await dragPieceToWorld(page, movingId, room.slotWorld(A.row, A.col));
  await waitForVersionAbove(page, movingId, 0);

  const moved = await readPiece(movingId);
  expect(
    { row: moved.placed_row, col: moved.placed_col },
    `a non-neighbour in range blocked the lock-in.\nServer log:\n${logTail(logCursor)}`,
  ).toEqual({ row: A.row, col: A.col });

  const parasite = await readPiece(parasiteId);
  expect(parasite.placed_row, "the non-neighbour must not have been placed").toBeNull();
  expect(parasite.cluster_id, "the non-neighbour must not have been merged in").toBeNull();
});

/**
 * A loose piece lying on the slot being claimed no longer stops anything.
 *
 * It used to: placement was refused outright whenever locking a piece in
 * would cover a still-loose one, because a locked piece never moves again
 * and whatever ended up underneath would be unreachable forever. The
 * invariant was right, the enforcement was not — an unrelated piece left on
 * the board silently vetoed fusing with the assembled region, with nothing
 * on screen to explain it (user report, 2026-09-20).
 *
 * Locked pieces now render beneath everything still in play, so nothing can
 * be buried in the first place. The placement goes through, the loose piece
 * is left exactly where the player put it, and — the part that actually
 * matters — it is still there to be picked up.
 */
test("a loose piece lying on the target slot neither blocks the lock-in nor gets lost", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  // 30px from A's target slot centre, so this piece's own centre sits inside
  // A's tile once A is locked in — genuinely on top of it, not merely near.
  // Too far off to register as a contact (the window is one tile ±45px), so
  // it is a pure obstruction and nothing else.
  const room = await seed(baseFixture({ "0,0": { at: { x: 0, y: 30 } } }));
  const movingId = room.pieceId(A.row, A.col);
  const looseId = room.pieceId(0, 0);
  const context = () => `Server log:\n${logTail(logCursor)}`;

  await openRoom(room);
  await dragPieceToWorld(page, movingId, room.slotWorld(A.row, A.col));
  await waitForVersionAbove(page, movingId, 0);

  const moved = await readPiece(movingId);
  expect(
    { row: moved.placed_row, col: moved.placed_col },
    `a loose piece on the slot blocked the lock-in.\n${context()}`,
  ).toEqual({ row: A.row, col: A.col });

  // The player's own piece is left alone — nothing swept it aside.
  const looseAfterPlacement = await readPiece(looseId);
  expect(looseAfterPlacement.placed_row).toBeNull();
  expect(Math.hypot(looseAfterPlacement.scatter_x - 0, looseAfterPlacement.scatter_y - 30)).toBeLessThan(2);

  // The invariant itself, tested the only way that really counts: pick the
  // piece up. It is lying over a locked piece, so if the two were drawn the
  // other way round the pointer would land on the locked one, that drag
  // would be cancelled, and this piece would never move.
  await dragPieceToWorld(page, looseId, { x: -280, y: 260 });
  await waitForVersionAbove(page, looseId, looseAfterPlacement.version);

  const rescued = await readPiece(looseId);
  expect(
    Math.hypot(rescued.scatter_x + 280, rescued.scatter_y - 260),
    `the loose piece could not be picked up off the locked one.\n${context()}`,
  ).toBeLessThan(2);
});
