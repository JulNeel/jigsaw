import { expect, test } from "./support/fixtures";
import { readPiece } from "./support/db";
import { dragPieceToWorld } from "./support/drag";
import { logTail } from "./support/server-log";
import { waitForVersionAbove } from "./support/wait";

/**
 * Fusing two pieces is symmetric: which of the two the player happens to
 * pick up cannot change the outcome.
 *
 * It did, for a while (user report, 2026-09-18: "une pièce A que je déplace
 * refuse l'association à une pièce B. Par contre si je déplace la pièce B
 * vers la pièce A, elles fusionnent"). The cause was `validateFusion`
 * applying its zero-tolerance rule to *every* detected contact, including
 * incidental ones with pieces that were never going to be merged — and
 * whether such a piece is in range depends entirely on which side is
 * dragged. Fixed by `genuineContacts` (src/lib/validation/validate-fusion.ts).
 *
 * These are the regression guards, at the level the unit tests cannot reach:
 * through a real drag, a real Server Action, and the real database.
 */

// A parasite: piece (0,0) is a corner, diagonally opposite in the true grid
// and therefore *not* a neighbour of anything in the pairs below. Parked one
// tile from where the dragged piece lands, it produces a contact candidate
// that must be ignored rather than veto the fusion.
//
// Its offset is chosen deliberately: 110px away is inside the ±45px contact
// window (|110 - 100| = 10) but outside the overlap guard's own one-tile
// box, so this isolates the false-contact rule and nothing else.
const PARASITE_OFFSET = 110;

async function expectFusedPair(
  aId: string,
  bId: string,
  parasiteId: string,
  context: string,
) {
  const a = await readPiece(aId);
  const b = await readPiece(bId);
  const parasite = await readPiece(parasiteId);
  expect(a.cluster_id, `${context}: dragged piece did not fuse`).not.toBeNull();
  expect(b.cluster_id, `${context}: pieces landed in different clusters`).toBe(a.cluster_id);
  // The other half of the rule: an incidental contact no longer vetoes the
  // fusion, so it must not be dragged into the Îlot either.
  expect(parasite.cluster_id, `${context}: a non-neighbour was merged in`).toBeNull();
}

test.describe("fusion is symmetric", () => {
  // (1,1) and (1,2) are true horizontal neighbours. Whichever one moves, the
  // final layout is identical — so the outcome must be too.
  for (const direction of ["drag (1,1) onto (1,2)", "drag (1,2) onto (1,1)"] as const) {
    test(`horizontal pair — ${direction}`, async ({ page, seed, openRoom, logCursor }) => {
      const dragsLeftPiece = direction === "drag (1,1) onto (1,2)";
      const room = await seed({
        gridRows: 3,
        gridCols: 3,
        pieces: {
          "1,1": { at: { x: -250, y: 0 } },
          "1,2": { at: { x: 250, y: 0 } },
          // Fixed in one spot for both directions — that asymmetry is the
          // whole point. It sits one tile below where (1,1) comes to rest,
          // and nowhere near where (1,2) does. Under the old veto rule the
          // left-piece drag was therefore refused while the right-piece drag
          // succeeded, with the pair ending in the same place either way:
          // exactly the report.
          "0,0": { at: { x: 150, y: PARASITE_OFFSET } },
        },
      });
      const leftId = room.pieceId(1, 1);
      const rightId = room.pieceId(1, 2);

      await openRoom(room);

      // Either way the pair ends up in the same place: left piece at x=150,
      // right piece at x=250.
      const movingId = dragsLeftPiece ? leftId : rightId;
      const target = dragsLeftPiece ? { x: 150, y: 0 } : { x: -150, y: 0 };

      await dragPieceToWorld(page, movingId, target);
      await waitForVersionAbove(page, movingId, 0);

      await expectFusedPair(
        leftId,
        rightId,
        room.pieceId(0, 0),
        `${direction}\n${logTail(logCursor)}`,
      );
    });
  }

  // The same test transposed. A row/col mix-up in the direction handling
  // would pass the horizontal cases and fail only here.
  for (const direction of ["drag (1,1) onto (2,1)", "drag (2,1) onto (1,1)"] as const) {
    test(`vertical pair — ${direction}`, async ({ page, seed, openRoom, logCursor }) => {
      const dragsTopPiece = direction === "drag (1,1) onto (2,1)";
      const room = await seed({
        gridRows: 3,
        gridCols: 3,
        pieces: {
          "1,1": { at: { x: 0, y: -250 } },
          "2,1": { at: { x: 0, y: 250 } },
          // Fixed, as above: in range of where (1,1) lands, out of range of
          // where (2,1) lands.
          "0,2": { at: { x: PARASITE_OFFSET, y: 150 } },
        },
      });
      const topId = room.pieceId(1, 1);
      const bottomId = room.pieceId(2, 1);

      await openRoom(room);

      const movingId = dragsTopPiece ? topId : bottomId;
      const target = dragsTopPiece ? { x: 0, y: 150 } : { x: 0, y: -150 };

      await dragPieceToWorld(page, movingId, target);
      await waitForVersionAbove(page, movingId, 0);

      await expectFusedPair(
        topId,
        bottomId,
        room.pieceId(0, 2),
        `${direction}\n${logTail(logCursor)}`,
      );
    });
  }
});
