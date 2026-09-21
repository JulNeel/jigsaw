import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { readPiece, waitForDbVersionAbove } from "./support/db";
import { dragPieceToWorld } from "./support/drag";
import { logTail, openCursor } from "./support/server-log";
import { waitForCanvasReady, waitForVersionAbove, pieceVersion } from "./support/wait";
import type { SeededRoom } from "./support/seed";

/**
 * A client whose Realtime channel goes deaf must still converge.
 *
 * This is the last unexplained report: a piece that "revient systématiquement
 * à sa place", the same `expectedVersion` sent and rejected over and over in
 * ~50ms, and only a page reload clearing it. Two simpler explanations were
 * tested and ruled out first — the client does refuse to drag a locked piece,
 * and two quick drags by one player do not conflict with each other
 * (`move-rejection.e2e.ts`).
 *
 * What remained was the architecture. A client's cached `version` only
 * advances when a Realtime event arrives; a rejected write produces no event;
 * and a Supabase channel can stop delivering while still reporting itself
 * SUBSCRIBED, so there is nothing to listen for. Miss one message and that
 * piece becomes permanently unwritable for that client — every attempt is
 * rejected, which produces no event, which keeps the cache stale. A closed
 * loop, and exactly the "presque aléatoire, seul un rechargement répare"
 * profile.
 *
 * The first version of this test took a browser context offline and hoped.
 * It *did* reproduce the bug — three times, with the database proving the
 * write had landed while the client was never told — but only about one run
 * in six, and it passed just as happily with the fix removed. Useless as a
 * guard. Dropping the messages deliberately makes the failure reproducible
 * on demand, which is what a test has to be.
 */

/** A frame carrying a row change, as opposed to the channel's own plumbing. */
function isRowChangeFrame(payload: string): boolean {
  return payload.includes("postgres_changes") && payload.includes('"data"');
}

type Client = {
  context: BrowserContext;
  page: Page;
  /** Starts swallowing row-change frames on their way to this client. */
  goDeaf(): void;
};

async function openRoomIn(browser: Browser, room: SeededRoom): Promise<Client> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let deaf = false;

  // Intercepts the Realtime socket and relays it by hand. The join handshake
  // is always forwarded, so the app still believes it is subscribed — which
  // is exactly the state measured against the real service: a channel
  // reporting itself healthy while delivering nothing. Closing the socket
  // instead would be a different, much easier failure, one the app could at
  // least in principle notice.
  await context.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (deaf && isRowChangeFrame(String(message))) {
        return;
      }
      ws.send(message);
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
  return {
    context,
    page,
    goDeaf() {
      deaf = true;
    },
  };
}

test("a client whose channel stops delivering still converges", async ({ browser, seed }) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    // Far from the Frame: this is about synchronisation, so nothing here
    // should fuse or place.
    pieces: { "1,1": { at: { x: -250, y: -250 } } },
  });
  const pieceId = room.pieceId(1, 1);

  const alice = await openRoomIn(browser, room);
  const bob = await openRoomIn(browser, room);

  try {
    expect(await pieceVersion(alice.page, pieceId)).toBe(0);

    // Bob moves the piece while Alice is still listening — she must receive
    // this one, so that what follows cannot be "Alice never worked at all".
    await dragPieceToWorld(bob.page, pieceId, { x: 200, y: -250 });
    await waitForVersionAbove(bob.page, pieceId, 0);
    await waitForVersionAbove(alice.page, pieceId, 0);

    // From here Alice's channel is deaf: still connected, still subscribed,
    // delivering nothing.
    alice.goDeaf();

    const cursor = openCursor();
    const before = await readPiece(pieceId);
    await dragPieceToWorld(alice.page, pieceId, { x: -100, y: 200 });

    // Half one: the server takes the write. Read from the database, since
    // what is in doubt is whether Alice's browser is told anything at all.
    const dbVersion = await waitForDbVersionAbove(pieceId, before.version);
    expect(
      dbVersion,
      `Alice's move never reached the database.\nServer log:\n${logTail(cursor)}`,
    ).not.toBeNull();
    const landed = await readPiece(pieceId);
    expect(
      Math.hypot(landed.scatter_x + 100, landed.scatter_y - 200),
      "the write landed, but not where Alice dropped the piece",
    ).toBeLessThan(2);

    // Half two: Alice finds out anyway. Her confirmation was thrown away, so
    // this can only happen because something noticed and went to look. Left
    // to itself, the optimistic move is rolled back onto a stale row and the
    // piece visibly jumps home while the server holds it exactly where she
    // put it.
    const converged = await alice.page
      .waitForFunction(
        ([id, target]) =>
          (window.__jigsawE2E?.pieceVersion(id as string) ?? -1) >= (target as number),
        [pieceId, dbVersion] as const,
        // Comfortably past AWAIT_VERSION_TIMEOUT_MS (15s), which is what
        // triggers the repair.
        { timeout: 25_000 },
      )
      .then(() => true)
      .catch(() => false);

    expect(
      converged,
      `Alice's own write reached the database (version ${before.version} -> ${dbVersion}) but her ` +
        "client never caught up. Her cached version stays behind, the optimistic move rolls back so " +
        "the piece jumps home, and every later move on it is rejected as STALE_WRITE — which produces " +
        "no event either, so nothing repairs it. Only a reload does.\n" +
        `Server log:\n${logTail(cursor)}`,
    ).toBe(true);

    // And the loop is genuinely broken rather than merely delayed: she can
    // move the piece again straight away, which is what the report said was
    // impossible short of reloading.
    await dragPieceToWorld(alice.page, pieceId, { x: 150, y: 150 });
    const secondVersion = await waitForDbVersionAbove(pieceId, dbVersion!);
    expect(
      secondVersion,
      "Alice's next move was rejected — the stale-version loop is still closed.\n" +
        `Server log:\n${logTail(cursor)}`,
    ).not.toBeNull();
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
