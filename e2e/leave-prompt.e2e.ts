import { expect, test } from "./support/fixtures";
import { dragPieceToWorld } from "./support/drag";
import { readContributions } from "./support/db";
import { waitForVersionAbove } from "./support/wait";

/**
 * Story 4.3 — the last moment to offer a Guest their contributions back.
 *
 * What a browser can prove here is the offer: that it appears for someone
 * who contributed, stays away from someone who did not, and costs nothing
 * to refuse. What it cannot prove is the claim itself — that needs a real
 * account, and this harness never writes to `auth.users`. That rule is
 * worth more than the coverage, so the claim's own correctness rests on
 * `guest-key.test.ts` (the hash both sides must agree on) and on the
 * action's `where user_id is null` predicate, rather than on a test that
 * would have to create a user to exist.
 *
 * AC #2 — the same offer on tab close — is deliberately not implemented and
 * therefore deliberately not tested. No browser lets a page put its own
 * content in the unload dialog, and the generic one would claim work might
 * be lost when every contribution was committed as it happened.
 */

const exitLink = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: /se connecter ou créer un compte/i });

test("a Guest who contributed is asked before leaving", async ({ page, seed, openRoom }) => {
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: {
      "1,1": { at: { x: -250, y: 0 } },
      "1,2": { placed: { row: 1, col: 2 } },
      "2,1": { placed: { row: 2, col: 1 } },
    },
  });
  const movingId = room.pieceId(1, 1);

  await openRoom(room);
  await dragPieceToWorld(page, movingId, room.slotWorld(1, 1));
  await waitForVersionAbove(page, movingId, 0);

  await exitLink(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/garder/i);

  // Refusing is a real option, not a grey escape hatch, and it must cost
  // nothing: the contribution stays in the Room, it simply stops being
  // attributable (AC #4).
  const before = await readContributions(room.roomId);
  expect(before).toHaveLength(1);

  await dialog.getByRole("link", { name: /partir sans garder/i }).click();
  await page.waitForURL(/\/sign-in/);

  const after = await readContributions(room.roomId);
  expect(after).toHaveLength(1);
  expect(after[0].user_id).toBeNull();
  expect(after[0].guest_key).toBe(before[0].guest_key);
});

test("a Guest who only looked around is not asked anything", async ({
  page,
  seed,
  openRoom,
}) => {
  // The distinction that keeps this dialog trustworthy. Someone who watched
  // for thirty seconds and left has nothing to keep, and asking them anyway
  // is how a product teaches people to dismiss its dialogs unread.
  const room = await seed({
    gridRows: 3,
    gridCols: 3,
    pieces: { "1,1": { at: { x: -250, y: 0 } } },
  });
  const movingId = room.pieceId(1, 1);

  await openRoom(room);

  // A plain reposition is not a contribution — same rule the history uses.
  await dragPieceToWorld(page, movingId, { x: -100, y: 200 });
  await waitForVersionAbove(page, movingId, 0);
  expect(await readContributions(room.roomId)).toHaveLength(0);

  await exitLink(page).click();
  await page.waitForURL(/\/sign-in/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
