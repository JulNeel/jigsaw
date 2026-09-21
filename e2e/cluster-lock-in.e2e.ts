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
 * The fixture is a two-piece Îlot containing the (0,0) corner. An Îlot locks
 * in either by contact with something already placed or via a corner member
 * resting at its own true corner (`findCornerAnchor`), and the corner route
 * needs nothing pre-placed — so the Îlot mechanic is isolated from placement
 * contagion entirely.
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

/** The seven pieces that are not in the Îlot, parked well clear of everything. */
const RING: Record<string, { at: { x: number; y: number } }> = {
  "0,2": { at: { x: 0, y: 300 } },
  "1,0": { at: { x: -212, y: 212 } },
  "1,1": { at: { x: -300, y: 0 } },
  "1,2": { at: { x: -212, y: -212 } },
  "2,0": { at: { x: 0, y: -300 } },
  "2,1": { at: { x: 212, y: -212 } },
  "2,2": { at: { x: 300, y: 0 } },
};

/** Where the Îlot's anchor member sits before anything is dragged. */
const ILOT_HOME = { x: -280, y: 260 };

function ilotFixture() {
  return {
    gridRows: 3,
    gridCols: 3,
    clusters: { ab: { anchorX: ILOT_HOME.x, anchorY: ILOT_HOME.y } },
    pieces: {
      "0,0": { cluster: "ab", clusterOffset: { row: 0, col: 0 } },
      "0,1": { cluster: "ab", clusterOffset: { row: 0, col: 1 } },
      ...RING,
    },
  };
}

test("an Îlot dropped at its own true corner locks every member in", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed(ilotFixture());
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

test("an Îlot dropped on Frame slots that are not its own stays fused at the drop point", async ({
  page,
  seed,
  openRoom,
  logCursor,
}) => {
  const room = await seed(ilotFixture());
  const cornerId = room.pieceId(0, 0);
  const mateId = room.pieceId(0, 1);

  await openRoom(room);
  // Slot (1,1) is the Frame's middle. The corner member is a corner piece but
  // not at *its* corner, and nothing is placed to make contact with, so both
  // routes into a lock are closed: this must resolve as a plain reposition.
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

test("an Îlot dropped nowhere near the Frame is an ordinary reposition", async ({
  page,
  seed,
  openRoom,
}) => {
  const room = await seed(ilotFixture());
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
    } catch {
      /* a storage-less context just shows the tutorial */
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
  const room = await seed(ilotFixture());
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
