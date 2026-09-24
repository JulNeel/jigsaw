import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { dragPieceToWorld } from "./support/drag";
import { waitForCanvasReady } from "./support/wait";
import { waitForDbVersionAbove } from "./support/db";
import type { SeededRoom } from "./support/seed";

/**
 * Story 4.1 — who else is in the Room.
 *
 * Presence rides the Room's one Realtime channel (NFR5), carries no database
 * state at all, and expires on a five-minute activity window. Only the first
 * two of those are worth a browser: the window is a pure function of a
 * timestamp and a clock, proved exactly in `presence.test.ts`, and asserting
 * it here would mean a five-minute wall-clock wait for a weaker result.
 *
 * What a browser is needed for is the part no unit test can reach: that two
 * real clients on two real sockets actually see each other.
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
        // Both seeded, unlike elsewhere in the suite: two contexts sharing a
        // participant id would collapse into one presence entry, and the
        // test would pass for the wrong reason.
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

const overlay = (page: Page) => page.getByRole("list", { name: /participants actifs/i });
/** The label that says what the avatars *are* — user feedback, 2026-09-24. */
const onlineLabel = (page: Page) => page.getByText(/\d+ en ligne/);

test("each Participant sees the other, and not themselves", async ({ browser, seed }) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: { "1,1": { at: { x: -250, y: 0 } } },
  });

  const alice = await openRoomAs(browser, room, ALICE);
  try {
    // Alone in the Room, there is nothing to draw — and an empty box saying
    // so would be worse than nothing.
    await expect(overlay(alice.page)).toHaveCount(0);
    await expect(onlineLabel(alice.page)).toHaveCount(0);

    const bob = await openRoomAs(browser, room, BOB);
    try {
      // Joining is itself activity, so neither has to touch a piece first.
      await expect(overlay(alice.page).getByText("Bob")).toBeVisible({ timeout: 15_000 });
      await expect(overlay(bob.page).getByText("Alice")).toBeVisible({ timeout: 15_000 });

      // A row of coloured initials means nothing on its own. The count and
      // the presence dot are what say these are people, and that they are
      // here now — reusing Home's own wording so the phrase is already
      // familiar.
      await expect(onlineLabel(alice.page)).toHaveText("1 en ligne");

      // The AC asks for "who **else**": seeing your own avatar would be
      // noise, and would make a solo Room look occupied.
      await expect(overlay(alice.page).getByText("Alice")).toHaveCount(0);
      await expect(overlay(bob.page).getByText("Bob")).toHaveCount(0);
    } finally {
      await bob.close();
    }

    // And leaving is immediate — a closed tab drops the socket and Supabase
    // emits a presence `leave`, so the five-minute window never applies to
    // someone who has actually gone (AC #2b).
    await expect(overlay(alice.page)).toHaveCount(0, { timeout: 20_000 });
  } finally {
    await alice.close();
  }
});

test("presence survives a Participant actually playing", async ({ browser, seed }) => {
  // Guards the wiring that is easiest to get wrong: activity is reported
  // from `onUpdate`, the same path a move takes, and re-`track()` replaces
  // this client's payload. A mistake there would drop the Participant from
  // everyone's overlay the moment they touched a piece — the exact opposite
  // of what the feature is for.
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: { "1,1": { at: { x: -250, y: 0 } } },
  });
  const pieceId = room.pieceId(1, 1);

  const alice = await openRoomAs(browser, room, ALICE);
  const bob = await openRoomAs(browser, room, BOB);
  try {
    await expect(overlay(bob.page).getByText("Alice")).toBeVisible({ timeout: 15_000 });

    await dragPieceToWorld(alice.page, pieceId, { x: 100, y: 200 });
    expect(await waitForDbVersionAbove(pieceId, 0)).not.toBeNull();

    await expect(overlay(bob.page).getByText("Alice")).toBeVisible();
    // Still exactly one of her, not a second entry from the re-track.
    await expect(overlay(bob.page).locator("li")).toHaveCount(1);
  } finally {
    await bob.close();
    await alice.close();
  }
});
