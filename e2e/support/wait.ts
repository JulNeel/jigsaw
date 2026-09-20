import type { Page } from "@playwright/test";
import { waitForLogLine, type LogCursor } from "./server-log";

/**
 * Waits until the canvas is mounted and the test hook is live.
 *
 * Stronger than waiting for the loading placeholder to disappear: it proves
 * the Konva stage exists and coordinates can be resolved, which is the only
 * thing the next line of any test actually depends on.
 */
export async function waitForCanvasReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__jigsawE2E?.ready === true, undefined, {
    timeout: 30_000,
  });
}

export async function pieceVersion(page: Page, pieceId: string): Promise<number | null> {
  return page.evaluate((id) => window.__jigsawE2E?.pieceVersion(id) ?? null, pieceId);
}

/**
 * Waits for the client's *confirmed* version to pass `baseline`.
 *
 * Optimistic mutations never touch `version` — it advances only when a
 * Realtime event lands. So this is a genuine "the server wrote it and this
 * client has seen it" signal, not a guess with a sleep attached.
 */
export async function waitForVersionAbove(
  page: Page,
  pieceId: string,
  baseline: number,
  timeout = 20_000,
): Promise<number> {
  const handle = await page.waitForFunction(
    ([id, base]) => {
      const version = window.__jigsawE2E?.pieceVersion(id as string) ?? null;
      return version !== null && version > (base as number) ? version : false;
    },
    [pieceId, baseline] as const,
    { timeout },
  );
  return handle.jsonValue() as Promise<number>;
}

export type MoveOutcome =
  | { kind: "confirmed"; version: number }
  | { kind: "rejected"; code: string; line: string };

/**
 * Waits for a move to *resolve*, either way.
 *
 * A rejected move never bumps the version, so waiting on the version alone
 * would hang for the full timeout on precisely the bug worth catching. The
 * race means a rejection is observed in milliseconds — and which branch won
 * is itself the assertion the test then makes.
 */
export async function waitForMoveOutcome(
  page: Page,
  pieceId: string,
  baseline: number,
  cursor: LogCursor,
  timeout = 20_000,
): Promise<MoveOutcome> {
  const confirmed = waitForVersionAbove(page, pieceId, baseline, timeout).then(
    (version): MoveOutcome => ({ kind: "confirmed", version }),
  );
  const rejected = waitForLogLine(
    cursor,
    new RegExp(`\\[move-reject\\] (\\w+) piece=${pieceId}[^\\n]*`),
    timeout,
  ).then((match): MoveOutcome => ({ kind: "rejected", code: match[1], line: match[0] }));

  // A losing branch must not settle the race: whichever one times out first
  // would otherwise be reported as "the outcome". So failures are parked,
  // and a single outer deadline — comfortably after both — is what actually
  // fails the test, with a message naming both things that didn't happen.
  const park = () => new Promise<MoveOutcome>(() => {});
  let deadline: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    deadline = setTimeout(
      () =>
        reject(
          new Error(
            `e2e: move on ${pieceId} neither confirmed (version > ${baseline}) nor rejected within ${timeout}ms`,
          ),
        ),
      timeout + 1_000,
    );
  });

  try {
    return await Promise.race([confirmed.catch(park), rejected.catch(park), expired]);
  } finally {
    clearTimeout(deadline);
  }
}
