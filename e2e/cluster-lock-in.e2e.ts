import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  countClusters,
  readPiece,
  waitForClusterVersionAbove,
} from "./support/db";
import { dragPieceToWorld } from "./support/drag";
import { logTail, openCursor, waitForLogLine } from "./support/server-log";
import { waitForCanvasReady, waitForVersionAbove } from "./support/wait";
import type { SeededRoom } from "./support/seed";

/**
 * Story 3.19 — locking a whole Îlot into the Frame.
 *
 * These are Task 4's own verification scenarios. They were left unchecked
 * when the story was implemented, for a reason recorded in its Dev Agent
 * Record: "this environment has no browser to actually drag an Îlot onto a
 * Frame slot". That is no longer true, so the scenarios are run rather than
 * assumed.
 *
 * What these can and cannot show is worth being precise about. The story's
 * AC #1 is about *instant* feedback — every member rendering at its own slot
 * before the server could plausibly have answered — and AC #2 about a green
 * pulse per member. Both live in a deliberately local render override that
 * never touches the collection, and the test hook reads the collection, so
 * neither is observable from here today. What is observable is everything
 * the server and the database decide, which is AC #3 and AC #4 in full plus
 * the outcome half of AC #1: that the Îlot really does lock in, that a
 * rejection really does leave every member still fused and never stranded at
 * a wrong slot, and that an ordinary reposition is untouched.
 *
 * Every fixture here is a two-piece Îlot, and whether it contains a corner
 * is the axis the tests turn on. An Îlot reaches the Frame by exactly two
 * routes: contact with something already placed, or a corner member resting
 * at its own true corner (`findCornerAnchor`). The corner route needs
 * nothing pre-placed, which is what lets these tests exercise the Îlot
 * mechanic in isolation from placement contagion.
 *
 * That asymmetry is the system's central invariant rather than a quirk of
 * the fixtures: the corner check is the *only* place absolute position is
 * ever consulted. Everything that later joins an assembly inherits its
 * position by contact, unchecked — so a cornerless group is never asked
 * where it is, and cannot place itself however correctly it happens to be
 * lying. Two tests below pin both halves of that down.
 */

/**
 * Waits until the canvas actually draws a piece within 2px of `world`.
 *
 * A poll rather than a read, because the database confirming a write and
 * this client having applied it are two different events — reading the
 * rendered position the instant the row lands would be a race, and one that
 * passes far more often than it fails.
 */
async function expectRenderedAt(
  page: Page,
  pieceId: string,
  world: { x: number; y: number },
  what: string,
): Promise<void> {
  const ok = await page
    .waitForFunction(
      ([id, wx, wy]) => {
        const at = window.__jigsawE2E?.pieceWorld(id as string);
        return at != null && Math.hypot(at.x - (wx as number), at.y - (wy as number)) < 2;
      },
      [pieceId, world.x, world.y] as const,
      { timeout: 10_000 },
    )
    .then(() => true)
    .catch(() => false);
  const at = await page.evaluate((id) => window.__jigsawE2E?.pieceWorld(id) ?? null, pieceId);
  expect(
    ok,
    `${what}: expected it drawn at (${world.x}, ${world.y}), found ${JSON.stringify(at)}`,
  ).toBe(true);
}

/**
 * Parking spots for the seven pieces that are not in the Îlot.
 *
 * A ring at radius 300 around the Frame, which is 3x3 tiles of 100px and so
 * reaches only ±150. Every point here is at least 150px from any Frame slot
 * centre and from every drop target these tests use — comfortably outside
 * the ±45px contact window, so nothing can fuse or make contact by accident.
 */
const RING_POSITIONS = [
  { x: 300, y: 0 },
  { x: 212, y: 212 },
  { x: 0, y: 300 },
  { x: -212, y: 212 },
  { x: -300, y: 0 },
  { x: -212, y: -212 },
  { x: 0, y: -300 },
  { x: 212, y: -212 },
];

/** Where the Îlot's left member sits before anything is dragged. */
const ILOT_HOME = { x: -280, y: 260 };

/**
 * A 3x3 room whose only Îlot is the horizontally-adjacent pair `[left,
 * right]`, with every other piece parked on the ring.
 *
 * Which pair you pick is the whole point of these tests, not a detail: an
 * Îlot containing a corner can bootstrap a placement on its own, and one
 * without a corner can only ever place by contact.
 */
function ilotFixture(left: string, right: string) {
  const pieces: Record<string, Record<string, unknown>> = {
    [left]: { cluster: "ab", clusterOffset: { row: 0, col: 0 } },
    [right]: { cluster: "ab", clusterOffset: { row: 0, col: 1 } },
  };
  let next = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = `${row},${col}`;
      if (cell === left || cell === right) {
        continue;
      }
      pieces[cell] = { at: RING_POSITIONS[next++] };
    }
  }
  return {
    gridRows: 3,
    gridCols: 3,
    clusters: { ab: { anchorX: ILOT_HOME.x, anchorY: ILOT_HOME.y } },
    pieces,
  };
}

/** `(0,0)` is a true corner, so this Îlot can anchor itself. */
const cornerIlot = () => ilotFixture("0,0", "0,1");

/** Neither `(1,1)` (centre) nor `(1,2)` (edge) is a corner. */
const cornerlessIlot = () => ilotFixture("1,1", "1,2");

test("an Îlot dropped at its own true corner locks every member in", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed(cornerIlot());
  const cornerId = room.pieceId(0, 0);
  const mateId = room.pieceId(0, 1);

  await openRoom(room);
  // Dragging any member drags the whole rigid Group, so landing the corner
  // member on slot (0,0) necessarily lands its mate on slot (0,1).
  await dragPieceToWorld(page, cornerId, room.slotWorld(0, 0));
  await waitForVersionAbove(page, cornerId, 0);

  const corner = await readPiece(cornerId);
  const mate = await readPiece(mateId);
  const context = `Server log:\n${logTail(logCursor)}`;

  expect({ row: corner.placed_row, col: corner.placed_col }, context).toEqual({ row: 0, col: 0 });
  expect(
    { row: mate.placed_row, col: mate.placed_col },
    `only the dragged member was locked in — the rest of the Îlot was left behind.\n${context}`,
  ).toEqual({ row: 0, col: 1 });

  // Placement dissolves the grouping: a locked piece is never in a Cluster,
  // and the Cluster row itself is deleted once every member is placed. Its
  // survival would leave every member rendering at a stale anchor.
  expect(corner.cluster_id).toBeNull();
  expect(mate.cluster_id).toBeNull();
  expect(await countClusters(room.roomId), "the Cluster row outlived its members").toBe(0);
});

/**
 * A corner that anchors at the *wrong* corner would poison a whole quadrant.
 *
 * `findCornerAnchor` is deliberately stricter than the rest of the product.
 * FR-6's general rule is never to check the real picture, and this is the one
 * documented exception, because a bootstrap anchor is the single point where
 * absolute position enters the system: everything that later joins the
 * assembly inherits its position by contact, with no further position check
 * of any kind. One wrong anchor and contagion propagates the error outwards.
 *
 * So the check is not "is this piece near *a* corner slot" but "is it near
 * *the one slot it truly belongs to*". This drops a corner-bearing Îlot on
 * the middle of the Frame — a corner piece nowhere near its own corner — and
 * nothing is placed to make contact with either, so both routes into a lock
 * are closed.
 */
test("a corner Îlot dropped away from its own corner does not anchor", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed(cornerIlot());
  const cornerId = room.pieceId(0, 0);
  const mateId = room.pieceId(0, 1);

  await openRoom(room);
  const target = room.slotWorld(1, 1);
  await dragPieceToWorld(page, cornerId, target);
  // A plain reposition bumps the Cluster row, not necessarily this piece's
  // own version — see `waitForClusterVersionAbove`.
  expect(await waitForClusterVersionAbove(room.roomId, 0)).not.toBeNull();

  const corner = await readPiece(cornerId);
  const mate = await readPiece(mateId);
  const context = `Server log:\n${logTail(logCursor)}`;

  // AC #3, the part that matters most: never stuck showing members "placed"
  // at slots the server never granted.
  expect(corner.placed_row, `the Îlot was locked into a slot it does not own.\n${context}`).toBeNull();
  expect(mate.placed_row, context).toBeNull();

  // Still fused, and resting where it was dropped rather than bounced home.
  expect(corner.cluster_id).not.toBeNull();
  expect(mate.cluster_id).toBe(corner.cluster_id);
  expect(await countClusters(room.roomId)).toBe(1);

  await expectRenderedAt(page, cornerId, target, "the dragged member");
  await expectRenderedAt(
    page,
    mateId,
    { x: target.x + 100, y: target.y },
    "the Îlot's other member",
  );
});

/**
 * Without a corner, position is never checked at all — not even when right.
 *
 * The complement of the test above, and the clearer half of the invariant.
 * A group with no corner member has exactly one route into the Frame:
 * contact with something already placed, from which contagion *computes* its
 * slots. It is never asked "is this your slot", so it cannot get the answer
 * wrong — and equally, being right earns it nothing.
 *
 * Which is what this drops: a cornerless Îlot laid exactly on its own two
 * true slots, perfectly correct, with nothing placed anywhere in the Frame.
 * It must stay loose. If it ever locked in here, absolute position would
 * have leaked into a second place in the system, and `findCornerAnchor`'s
 * strictness would be protecting nothing.
 */
test("a cornerless Îlot lying on its own true slots still does not place", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed(cornerlessIlot());
  const centreId = room.pieceId(1, 1);
  const edgeId = room.pieceId(1, 2);

  await openRoom(room);
  const target = room.slotWorld(1, 1);
  await dragPieceToWorld(page, centreId, target);
  expect(await waitForClusterVersionAbove(room.roomId, 0)).not.toBeNull();

  const centre = await readPiece(centreId);
  const edge = await readPiece(edgeId);
  const context = `Server log:\n${logTail(logCursor)}`;

  expect(
    centre.placed_row,
    `a cornerless Îlot placed itself with nothing to anchor to — absolute position ` +
      `is leaking outside findCornerAnchor.\n${context}`,
  ).toBeNull();
  expect(edge.placed_row, context).toBeNull();
  expect(edge.cluster_id).toBe(centre.cluster_id);
  expect(await countClusters(room.roomId)).toBe(1);

  // Still fused and resting exactly where it was dropped — which happens to
  // be right on top of its own slots, and that changes nothing.
  await expectRenderedAt(page, centreId, target, "the cornerless Îlot");
  await expectRenderedAt(
    page,
    edgeId,
    { x: target.x + 100, y: target.y },
    "the cornerless Îlot's other member",
  );
});

test("an Îlot dropped nowhere near the Frame is an ordinary reposition", async ({
  page,
  seed,
  openRoom,
}) => {
  const room = await seed(cornerIlot());
  const cornerId = room.pieceId(0, 0);
  const mateId = room.pieceId(0, 1);

  await openRoom(room);
  const target = { x: 260, y: 280 };
  await dragPieceToWorld(page, cornerId, target);
  expect(await waitForClusterVersionAbove(room.roomId, 0)).not.toBeNull();

  const corner = await readPiece(cornerId);
  const mate = await readPiece(mateId);

  expect(corner.placed_row).toBeNull();
  expect(mate.placed_row).toBeNull();
  expect(mate.cluster_id, "the Îlot came apart on an ordinary move").toBe(corner.cluster_id);
  expect(await countClusters(room.roomId)).toBe(1);

  await expectRenderedAt(page, cornerId, target, "the repositioned Îlot");
});

/** A frame carrying a row change, as opposed to the channel's own plumbing. */
function isRowChangeFrame(payload: string): boolean {
  return payload.includes("postgres_changes") && payload.includes('"data"');
}

async function openRoomIn(
  browser: Browser,
  room: SeededRoom,
  opts: { deaf?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (opts.deaf) {
    await context.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        if (isRowChangeFrame(String(message))) {
          return;
        }
        ws.send(message);
      });
    });
  }
  await context.addInitScript((slug) => {
    try {
      window.sessionStorage.setItem(`jigsaw:tutorial-seen:${slug}`, "1");
      // Story 4.1's name prompt is the second first-load dialog; seeded for
      // the same reason as the tutorial (see `support/fixtures.ts`).
      window.localStorage.setItem("jigsaw:display-name", "E2E");
    } catch {
      /* a storage-less context just shows both dialogs */
    }
  }, room.slug);
  const page = await context.newPage();
  await page.goto(`http://localhost:${process.env.E2E_PORT ?? "3100"}${room.path}`);
  await waitForCanvasReady(page);
  return { context, page };
}

/**
 * Task 4's own third scenario — the losing side of a contested Îlot lock.
 *
 * A genuine wall-clock race between two players would be timing-dependent
 * and would pass or fail for reasons unrelated to the code. Starving one
 * client of row changes makes the *same* conflict happen on demand: Alice
 * never learns the Îlot has been locked in, so her own drag carries a stale
 * view and the server refuses it. That is precisely the rejection path
 * Story 3.19's Task 1 widened `emitMoveConflict` to cover — before that
 * change a rejected Îlot lock emitted no signal at all, leaving the guess on
 * screen indefinitely.
 */
test("a client whose Îlot was locked in behind its back is refused and recovers", async ({
  browser,
  seed,
}) => {
  const room = await seed(cornerIlot());
  const cornerId = room.pieceId(0, 0);
  const mateId = room.pieceId(0, 1);

  const alice = await openRoomIn(browser, room, { deaf: true });
  const bob = await openRoomIn(browser, room);

  try {
    // Bob locks the Îlot in. Alice is told nothing.
    await dragPieceToWorld(bob.page, cornerId, room.slotWorld(0, 0));
    await waitForVersionAbove(bob.page, cornerId, 0);
    expect((await readPiece(cornerId)).placed_row).toBe(0);

    const cursor = openCursor();
    // Alice still believes she has a free-floating Îlot, and drags it.
    await dragPieceToWorld(alice.page, cornerId, { x: 260, y: 280 });

    // The rejection names whichever member the client elected representative
    // (the lowest id), not the one Alice grabbed — so match either.
    const rejection = await waitForLogLine(
      cursor,
      new RegExp(`\\[move-reject\\] (\\w+) piece=(?:${cornerId}|${mateId})`),
      15_000,
    );
    expect(rejection[1], "the stale Îlot drag should have been refused").toMatch(
      /STALE_WRITE|ALREADY_PLACED/,
    );

    // Bob's lock stands, untouched by Alice's refused write.
    const corner = await readPiece(cornerId);
    expect({ row: corner.placed_row, col: corner.placed_col }).toEqual({ row: 0, col: 0 });

    // And Alice is not left holding her guess: the rejection triggers a
    // reconciliation, so her view catches up to the truth without a reload.
    const recovered = await alice.page
      .waitForFunction(
        (id) => window.__jigsawE2E?.pieceState(id as string)?.placedRow === 0,
        cornerId,
        { timeout: 20_000 },
      )
      .then(() => true)
      .catch(() => false);
    expect(
      recovered,
      "Alice's refused Îlot drag left her showing a lock the server never granted.\n" +
        `Server log:\n${logTail(cursor)}`,
    ).toBe(true);
    const aliceMate = await alice.page.evaluate(
      (id) => window.__jigsawE2E!.pieceState(id),
      mateId,
    );
    expect(aliceMate?.placedRow, "only the dragged member converged").toBe(0);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
