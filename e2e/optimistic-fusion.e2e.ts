import { expect, test } from "./support/fixtures";
import { dragPieceToWorld } from "./support/drag";
import { readDrawnGroups, type DrawnGroup } from "./support/stage";

/**
 * A fusion has to *look* like it happened before the server says so.
 *
 * User report (2026-09-21): "lorsque j'associe plusieurs pièces libres, il y
 * a immédiatement le son et le pulse, mais leur association visuelle prend
 * parfois 2 ou 3 secondes". The sound and the pulse were never the problem —
 * both fire at drag-end. The wait was the *grouping*: Story 3.13 scoped its
 * optimistic grouping to one loose piece touching exactly one other loose
 * piece, so the moment what you landed against was already part of an Îlot,
 * nothing was predicted and the pieces stayed drawn apart until the server's
 * own `cluster_id` arrived over Realtime. Which is precisely the two or three
 * seconds, and precisely why the sound arrived first.
 *
 * These assertions are made while the Server Action's *response* is held, so
 * anything visible can only be the client's own prediction. The request, the
 * commit and the Realtime delivery are untouched — only the moment the
 * browser learns the answer is pushed out.
 *
 * They read the Konva stage rather than the test hook, because the hook
 * reports the collection and a prediction deliberately never touches it.
 */

const RESPONSE_HOLD_MS = 6_000;

/** Parking spots well clear of the Frame and of every drop target below. */
const FAR: Record<string, { at: { x: number; y: number } }> = {
  "0,0": { at: { x: 300, y: 0 } },
  "0,1": { at: { x: 212, y: 212 } },
  "0,2": { at: { x: 0, y: 300 } },
  "2,0": { at: { x: -300, y: 0 } },
  "2,1": { at: { x: -212, y: -212 } },
  "2,2": { at: { x: 0, y: -300 } },
};

// The Îlot's two members, and therefore where its third neighbour belongs.
const ILOT_ANCHOR = { x: 0, y: 260 };
const JOIN_EXACTLY_AT = { x: ILOT_ANCHOR.x - 100, y: ILOT_ANCHOR.y };
// 20px off: inside the ±45px contact window, and far enough that "snapped
// into the Îlot" and "left lying where it was dropped" are different
// pictures. Dropping exactly on target would make the two indistinguishable.
const DROP_AT = { x: JOIN_EXACTLY_AT.x + 20, y: JOIN_EXACTLY_AT.y + 20 };

/**
 * Asserts on the one multi-member group the canvas is drawing.
 *
 * Positions are compared with a 2px tolerance: a synthetic drag lands within
 * a fraction of a pixel of its target, not on it, and an exact match would
 * fail for a reason that has nothing to do with what is being tested.
 */
function expectSingleIlot(
  groups: DrawnGroup[],
  expected: { at: { x: number; y: number }; members: number },
  message: string,
): void {
  const multi = groups.filter((g) => g.members > 1);
  const detail = `${message}\nDrawn: ${JSON.stringify(groups)}`;
  expect(multi.length, detail).toBe(1);
  expect(multi[0].members, detail).toBe(expected.members);
  expect(Math.hypot(multi[0].x - expected.at.x, multi[0].y - expected.at.y), detail).toBeLessThan(
    2,
  );
}

test("a loose piece joining an existing Îlot is grouped immediately", async ({
  page,
  seed,
  openRoom,
  holdServerActionResponses,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    clusters: { ab: { anchorX: ILOT_ANCHOR.x, anchorY: ILOT_ANCHOR.y } },
    pieces: {
      "1,1": { cluster: "ab", clusterOffset: { row: 0, col: 0 } },
      "1,2": { cluster: "ab", clusterOffset: { row: 0, col: 1 } },
      // (1,0) is the true left neighbour of (1,1), and loose.
      "1,0": { at: { x: -320, y: 260 } },
      ...FAR,
    },
  });
  const looseId = room.pieceId(1, 0);

  await openRoom(room);

  expectSingleIlot(
    await readDrawnGroups(page),
    { at: ILOT_ANCHOR, members: 2 },
    "the fixture should start with exactly one two-member Îlot",
  );

  await holdServerActionResponses(RESPONSE_HOLD_MS);
  await dragPieceToWorld(page, looseId, DROP_AT);

  // No waiting, no polling: this is read as soon as the pointer is released,
  // and the server cannot have answered for another six seconds.
  expectSingleIlot(
    await readDrawnGroups(page),
    { at: DROP_AT, members: 3 },
    "the piece was left drawn on its own next to an unchanged two-member Îlot — nothing was " +
      "predicted, so the grouping can only appear once the server's confirmation arrives.",
  );

  // And it stays that way: the prediction must hold for the whole wait, not
  // flicker back to three separate pieces a frame later.
  await page.waitForTimeout(1_500);
  expectSingleIlot(
    await readDrawnGroups(page),
    { at: DROP_AT, members: 3 },
    "the predicted grouping did not survive the wait",
  );
});

test("two loose pieces fusing are grouped immediately", async ({
  page,
  seed,
  openRoom,
  holdServerActionResponses,
}) => {
  // The case Story 3.13 did cover. Kept as its own test so a future change to
  // the shared merge math cannot quietly break the simple half while the
  // Îlot half keeps passing.
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      "1,1": { at: { x: -320, y: 260 } },
      "1,2": { at: { x: 100, y: 260 } },
      "1,0": { at: { x: -212, y: 212 } },
      ...FAR,
    },
  });
  const movingId = room.pieceId(1, 1);
  // (1,1) belongs one tile to the left of (1,2).
  const dropAt = { x: 100 - 100 + 20, y: 260 + 20 };

  await openRoom(room);
  await holdServerActionResponses(RESPONSE_HOLD_MS);
  await dragPieceToWorld(page, movingId, dropAt);

  expectSingleIlot(
    await readDrawnGroups(page),
    { at: dropAt, members: 2 },
    "two loose true neighbours were not grouped on drop",
  );
});
