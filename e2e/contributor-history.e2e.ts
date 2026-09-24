import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { dragPieceToWorld } from "./support/drag";
import { readContributions } from "./support/db";
import { waitForCanvasReady, waitForVersionAbove } from "./support/wait";
import type { SeededRoom } from "./support/seed";

/**
 * Story 4.2 — the Room remembers who did what.
 *
 * The part worth a browser is AC #2: the list updating *for someone else*,
 * live, with no refresh. That crosses a write inside a Postgres transaction,
 * a Realtime publication, the Room's one shared channel, and a panel that
 * was already open when it happened — none of which a unit test reaches.
 *
 * The write itself is checked against the database rather than through the
 * panel, because "the line says Julien" and "the row credits the right
 * browser" are different claims and only the second survives a UI change.
 */

async function openRoomAs(
  browser: Browser,
  room: SeededRoom,
  identity: { id: string; name: string },
): Promise<{ close: () => Promise<void>; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(
    ({ slug, id, name }) => {
      try {
        window.sessionStorage.setItem(`jigsaw:tutorial-seen:${slug}`, "1");
        window.localStorage.setItem("jigsaw:participant-id", id);
        window.localStorage.setItem("jigsaw:display-name", name);
      } catch {
        /* a storage-less context shows both dialogs and fails visibly */
      }
    },
    { slug: room.slug, id: identity.id, name: identity.name },
  );
  const page = await context.newPage();
  await page.goto(`http://localhost:${process.env.E2E_PORT ?? "3100"}${room.path}`);
  await waitForCanvasReady(page);
  return { page, close: () => context.close() };
}

const ALICE = { id: "11111111-1111-4111-8111-111111111111", name: "Alice" };
const BOB = { id: "22222222-2222-4222-8222-222222222222", name: "Bob" };

const openHistory = (page: Page) =>
  page.getByRole("button", { name: /historique des contributions/i }).click();
const historyLines = (page: Page) => page.getByRole("dialog").getByRole("listitem");

test("a placement appears in another Participant's open history, without a refresh", async ({
  browser,
  seed,
}) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      // Two already locked in, so dropping (1,1) on its slot places it by
      // contagion rather than needing a corner.
      "1,1": { at: { x: -250, y: 0 } },
      "1,2": { placed: { row: 1, col: 2 } },
      "2,1": { placed: { row: 2, col: 1 } },
    },
  });
  const movingId = room.pieceId(1, 1);

  const alice = await openRoomAs(browser, room, ALICE);
  const bob = await openRoomAs(browser, room, BOB);

  try {
    // Bob is looking at an empty history *before* anything happens, so what
    // follows cannot be "he opened it afterwards and read a fetch".
    await openHistory(bob.page);
    await expect(bob.page.getByRole("dialog")).toBeVisible();
    await expect(historyLines(bob.page)).toHaveCount(0);

    await dragPieceToWorld(alice.page, movingId, room.slotWorld(1, 1));
    await waitForVersionAbove(alice.page, movingId, 0);

    // The panel was already open. Nothing re-fetched it.
    await expect(historyLines(bob.page)).toHaveCount(1, { timeout: 15_000 });
    await expect(historyLines(bob.page).first()).toContainText("Alice");

    // And the row itself credits the right browser, which is what Story 4.3
    // will convert on. The panel could render anything; this cannot.
    const rows = await readContributions(room.roomId);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("placed");
    expect(rows[0].piece_id).toBe(movingId);
    expect(rows[0].pseudo).toBe("Alice");
    expect(rows[0].guest_participant_id).toBe(ALICE.id);
    // A Guest has no account, and inventing one would be the worst possible
    // failure here.
    expect(rows[0].user_id).toBeNull();
  } finally {
    await bob.close();
    await alice.close();
  }
});

test("a fusion is one line, and a plain move is none at all", async ({
  page,
  seed,
  openRoom,
  clientErrors,
}) => {
  // The distinction the schema's `kind` check exists to keep: sliding a
  // piece around the mat is not contributing, and a history that counted it
  // would be unreadable within a minute of play.
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      "1,1": { at: { x: -300, y: 260 } },
      "1,2": { at: { x: 100, y: 260 } },
      "0,0": { at: { x: 300, y: 0 } },
      "0,1": { at: { x: 212, y: 212 } },
      "0,2": { at: { x: 0, y: 300 } },
      "1,0": { at: { x: -212, y: 212 } },
      "2,0": { at: { x: -300, y: 0 } },
      "2,1": { at: { x: -212, y: -212 } },
      "2,2": { at: { x: 0, y: -300 } },
    },
  });
  const movingId = room.pieceId(1, 1);

  await openRoom(room);

  // Nowhere near anything: a reposition and nothing more.
  await dragPieceToWorld(page, movingId, { x: -280, y: 120 });
  await waitForVersionAbove(page, movingId, 0);
  expect(await readContributions(room.roomId)).toHaveLength(0);

  // Now against its true neighbour: one fusion, one line.
  await dragPieceToWorld(page, movingId, { x: 0, y: 260 });
  await waitForVersionAbove(page, movingId, 1);

  const rows = await readContributions(room.roomId);
  expect(rows).toHaveLength(1);
  expect(rows[0].kind).toBe("fused");
  expect(rows[0].piece_id).toBe(movingId);

  // Opening the panel is part of this test purely so the console is watched
  // while it renders. `relativeTime` without an explicit `now` raises an
  // `IntlError` that nothing failed on — it was found by noticing the dev
  // overlay's badge in a screenshot, which is not a process anyone should
  // rely on twice.
  await page.getByRole("button", { name: /historique des contributions/i }).click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(1);
  expect(clientErrors).toEqual([]);
});
