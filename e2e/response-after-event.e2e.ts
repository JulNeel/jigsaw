import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { readPiece, waitForDbVersionAbove } from "./support/db";
import { dragPieceToWorld } from "./support/drag";
import { assertNoLogLine, logTail } from "./support/server-log";
import { waitForVersionAbove } from "./support/wait";

/**
 * A write whose Realtime event beats its own Server Action response must
 * still settle.
 *
 * This is the ordering a *deployed* app gets and a local one almost never
 * does — which is exactly how it was reported: "j'ai l'impression qu'ils sont
 * beaucoup plus fréquents quand je ne suis pas en local". Under `next dev` on
 * your own machine the Server Action's response comes back over loopback in
 * about a millisecond, so it wins the race essentially always. Deployed, it
 * crosses the network from the app region while Realtime pushes straight out
 * of Postgres on an already-open socket — so the event arrives first,
 * routinely.
 *
 * When it does, `awaitVersion` subscribes to a confirmation that has already
 * come and gone. That matters far more than one stalled promise, because the
 * mutation stays pending and a pending mutation *overlays* the collection:
 * `version` keeps reading back as the pre-move value even though the synced
 * row has advanced. The next drag therefore sends the old `expectedVersion`,
 * the server rejects it as STALE_WRITE, and the piece is rolled back onto its
 * last confirmed position — "une pièce revient systématiquement à sa place".
 *
 * The delay is applied to the *response* only: the request reaches the server
 * untouched, the transaction commits, Postgres emits, Realtime delivers, and
 * only then does the browser learn what the action returned. Nothing about
 * the server is simulated — only the order in which two real messages reach
 * one real browser.
 */

/** Makes every Server Action response reach the page late. */
async function delayServerActionResponses(page: Page, delayMs: number): Promise<void> {
  await page.route("**/room/**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ response });
  });
}

/**
 * Every one of the nine pieces is positioned by hand, which the other
 * fixtures don't bother with — and the reason is worth recording. The default
 * scatter parks unspecified pieces on a ring of radius 270, and the first
 * version of this test dropped its piece 20px from one of them: it fused, the
 * row's `scatter_x/y` stopped being the rendered position, and the failure
 * looked like an app bug. This test is about ordering alone, so the fixture
 * has to make fusion and placement impossible rather than unlikely: the other
 * eight sit on a radius-300 ring, the moved piece stays in the gap between
 * two of them, and every distance involved is comfortably past both the ±45px
 * contact window and the Frame.
 */
const RING: Record<string, { at: { x: number; y: number } }> = {
  "0,0": { at: { x: 300, y: 0 } },
  "0,1": { at: { x: 212, y: 212 } },
  "0,2": { at: { x: 0, y: 300 } },
  "1,0": { at: { x: -212, y: 212 } },
  "1,2": { at: { x: -300, y: 0 } },
  "2,0": { at: { x: -212, y: -212 } },
  "2,1": { at: { x: 0, y: -300 } },
  "2,2": { at: { x: 212, y: -212 } },
};

const START = { x: -60, y: 250 };
const FIRST_DROP = { x: 60, y: 250 };
const SECOND_DROP = { x: 120, y: 230 };

test("a move confirmed before its own response still settles", async ({
  page,
  seed,
  openRoom,
  logCursor,
  clientErrors,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: { ...RING, "1,1": { at: START } },
  });
  const pieceId = room.pieceId(1, 1);

  await openRoom(room);
  await delayServerActionResponses(page, 3_000);

  await dragPieceToWorld(page, pieceId, FIRST_DROP);

  // The server took it, and quickly — the round trip is not what is in doubt.
  const dbVersion = await waitForDbVersionAbove(pieceId, 0);
  expect(dbVersion, `the move never reached the database.\n${logTail(logCursor)}`).toBe(1);

  // The client has to catch up on its own timescale, not on the 15s
  // AWAIT_VERSION_TIMEOUT_MS backstop. 8s is comfortably past the 3s delay
  // and comfortably short of the timeout, so this can only pass if the
  // confirmation is recognised rather than waited for a second time.
  const clientVersion = await waitForVersionAbove(page, pieceId, 0, 8_000).catch(() => null);
  expect(
    clientVersion,
    "the database reached version 1, but the client still reports the pre-move version. Its " +
      "Realtime confirmation arrived before the Server Action's response, so nothing was waiting " +
      "for it; the mutation stays pending and masks the confirmed version.\n" +
      logTail(logCursor),
  ).toBe(1);

  // The symptom the bug actually presents as: the *next* drag. With a stale
  // version masked underneath a pending mutation, this is rejected and the
  // piece snaps back to where it came from.
  await dragPieceToWorld(page, pieceId, SECOND_DROP);
  const secondVersion = await waitForDbVersionAbove(pieceId, dbVersion!);
  expect(
    secondVersion,
    `the second move was rejected — the piece jumps back.\n${logTail(logCursor)}`,
  ).toBe(2);
  assertNoLogLine(logCursor, /\[move-reject\]/, "no move should have been rejected");

  const landed = await readPiece(pieceId);
  // Guards the fixture as much as the app: a fused piece is positioned by its
  // Cluster's anchor, so `scatter_x/y` would stop meaning what the next
  // assertion reads it as.
  expect(
    landed.cluster_id,
    "the piece fused — the fixture is no longer isolating a plain move",
  ).toBeNull();
  expect(
    Math.hypot(landed.scatter_x - SECOND_DROP.x, landed.scatter_y - SECOND_DROP.y),
  ).toBeLessThan(2);
  expect(clientErrors).toEqual([]);
});
