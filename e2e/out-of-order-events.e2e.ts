import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { readPiece, waitForDbVersionAbove } from "./support/db";
import { dragPieceToWorld } from "./support/drag";
import { logTail, openCursor } from "./support/server-log";
import { waitForCanvasReady } from "./support/wait";
import { seedRoom } from "./support/seed";

/**
 * Two row changes from one gesture, delivered in the wrong order.
 *
 * Found by accident, chasing an intermittent failure in
 * `move-rejection.e2e.ts`. Client-side instrumentation on a captured failing
 * run showed the two Realtime events for a single drag arriving swapped, 8ms
 * apart, on a real channel:
 *
 *     +1655ms  row version 2
 *     +1663ms  row version 1     <- older, applied last
 *
 * One drag of a loose piece writes its row twice — `repositionPlain` sets
 * `scatter_x`/`scatter_y` in one statement and bumps `version` in the next —
 * so Postgres replicates two changes carrying versions N and N+1. Whichever
 * arrives last used to win, so a swap left the collection holding the
 * pre-bump row for good.
 *
 * The consequence is not a cosmetic lag. The cached version stays one behind
 * the server's, the next drag therefore sends a stale `expectedVersion`, the
 * server rejects it as STALE_WRITE, and the piece is rolled back onto the
 * position the server had already moved it away from. That is the "une pièce
 * revient systématiquement à sa place" report, reproduced from the other end.
 *
 * Here the swap is forced rather than waited for: adjacent row-change frames
 * are held and re-emitted in reverse on their way to the browser. Nothing
 * about the server changes — the same two frames arrive, in the order a real
 * channel was observed to deliver them.
 */

/** A frame carrying a row change, as opposed to the channel's own plumbing. */
function isRowChangeFrame(payload: string): boolean {
  return payload.includes("postgres_changes") && payload.includes('"data"');
}

async function openRoomWithSwappedRowEvents(
  browser: Browser,
  room: Awaited<ReturnType<typeof seedRoom>>,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  await context.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));

    // Holds one row change; when the next arrives, that newer one is sent
    // first and the held one immediately after. Every other frame — the join
    // handshake, heartbeats — passes straight through untouched, so the
    // channel stays healthy in every other respect.
    let held: string | null = null;
    let holdTimer: NodeJS.Timeout | null = null;
    const flush = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (held !== null) {
        const pending = held;
        held = null;
        ws.send(pending);
      }
    };

    server.onMessage((message) => {
      const payload = String(message);
      if (!isRowChangeFrame(payload)) {
        ws.send(payload);
        return;
      }
      if (held === null) {
        held = payload;
        // A lone row change must still arrive — only *pairs* get swapped.
        holdTimer = setTimeout(flush, 250);
        return;
      }
      ws.send(payload);
      flush();
    });
  });

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

test("a row change delivered out of order does not strand the client", async ({
  browser,
  seed,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    // Far from the Frame and from every neighbour: this is about delivery
    // order, so nothing here should fuse or place.
    pieces: { "1,1": { at: { x: -250, y: 0 } } },
  });
  const pieceId = room.pieceId(1, 1);
  const cursor = openCursor();

  const { context, page } = await openRoomWithSwappedRowEvents(browser, room);

  try {
    await dragPieceToWorld(page, pieceId, { x: -100, y: -200 });

    // The server is not in question: it took the write and bumped the row.
    const dbVersion = await waitForDbVersionAbove(pieceId, 0);
    expect(dbVersion, `the move never reached the database.\n${logTail(cursor)}`).toBe(1);

    // The client has to end up agreeing, even though it was told about the
    // bump *before* it was told about the position. Generous, because what is
    // being tested is whether it converges at all, not how fast.
    const caughtUp = await page
      .waitForFunction(
        (id) => window.__jigsawE2E?.pieceVersion(id as string) === 1,
        pieceId,
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
    expect(
      caughtUp,
      "the client applied the older of the two row changes last and kept it. Its cached version " +
        "now trails the server's for good, so the next drag will be rejected as STALE_WRITE and " +
        `the piece will snap back.\n${logTail(cursor)}`,
    ).toBe(true);

    // The consequence, tested rather than inferred: the next drag has to be
    // accepted. With a stale cached version it is rejected, and the piece is
    // rolled back onto where the server had already moved it away from.
    await dragPieceToWorld(page, pieceId, { x: 200, y: 150 });
    const secondVersion = await waitForDbVersionAbove(pieceId, dbVersion!);
    expect(
      secondVersion,
      `the second drag was refused — the stale-version loop is still closed.\n${logTail(cursor)}`,
    ).toBe(2);

    const landed = await readPiece(pieceId);
    expect(Math.hypot(landed.scatter_x - 200, landed.scatter_y - 150)).toBeLessThan(2);
  } finally {
    await context.close();
  }
});
