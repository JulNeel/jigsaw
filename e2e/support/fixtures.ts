import { test as base, expect } from "@playwright/test";
import { openCursor, type LogCursor } from "./server-log";
import { seedRoom, type SeedSpec, type SeededRoom } from "./seed";
import { waitForCanvasReady } from "./wait";

/**
 * Console noise that is expected and harmless.
 *
 * Deliberately narrow. Seeded pieces reference Storage objects that don't
 * exist, so the browser logs failed image loads — that is the whole point of
 * not uploading real tiles. Anything else (React errors, TanStack DB
 * rollbacks, unhandled rejections) is exactly the class of signal this
 * harness exists to surface, so it must fail the test.
 */
const EXPECTED_CONSOLE_NOISE = [
  /Failed to load resource/i,
  /net::ERR_/i,
  /the server responded with a status of 4\d\d/i,
  /storage\/v1\/object/i,
];

type Fixtures = {
  /** Seeds a room and guarantees its removal, even when the test fails. */
  seed: (spec: SeedSpec) => Promise<SeededRoom>;
  /** Byte offset into the dev-server log, taken when the test starts. */
  logCursor: LogCursor;
  /** Everything the page logged as an error, minus the expected noise. */
  clientErrors: string[];
  /** Opens a seeded room with the first-run tutorial pre-dismissed. */
  openRoom: (room: SeededRoom) => Promise<void>;
  /**
   * Makes every Server Action *response* reach the page late, so a test can
   * assert on what the client predicted before it could possibly have been
   * told anything.
   *
   * Only the response is held. The request reaches the server untouched, the
   * transaction commits, Postgres emits and Realtime delivers — so this
   * reproduces the ordering a deployed app gets, and nothing about the
   * server's own behaviour is simulated.
   *
   * A fixture rather than a helper because the hold has to be released
   * before the page is torn down: a route handler still sleeping when the
   * test body returns fails with "route.fetch: Test ended", which aborts the
   * whole run and leaves later tests unexecuted. Teardown releases every
   * pending hold and waits for it to drain.
   */
  holdServerActionResponses: (delayMs: number) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  seed: async ({}, use) => {
    const seeded: SeededRoom[] = [];
    await use(async (spec) => {
      const room = await seedRoom(spec);
      seeded.push(room);
      return room;
    });
    for (const room of seeded) {
      await room.cleanup();
    }
  },

  // Opened per test so `assertNoLogLine` means "during this test" — the dev
  // server is shared and long-lived, so an unscoped read would see every
  // other test's rejections.
  logCursor: async ({}, use) => {
    await use(openCursor());
  },

  clientErrors: async ({ page }, use) => {
    const errors: string[] = [];
    const record = (text: string) => {
      if (!EXPECTED_CONSOLE_NOISE.some((pattern) => pattern.test(text))) {
        errors.push(text);
      }
    };
    page.on("console", (message) => {
      if (message.type() === "error") {
        record(message.text());
      }
    });
    page.on("pageerror", (error) => record(`pageerror: ${error.message}`));
    await use(errors);
  },

  openRoom: async ({ page }, use) => {
    await use(async (room) => {
      // The first-run tutorial is a modal dialog shown to guests, and it
      // covers the canvas. Seeding its sessionStorage key before navigation
      // is cleaner than dismissing it afterwards — no race, and no reliance
      // on the dialog's markup.
      await page.addInitScript((slug) => {
        try {
          window.sessionStorage.setItem(`jigsaw:tutorial-seen:${slug}`, "1");
          // Story 4.1: a second first-load dialog. Without a stored name the
          // prompt opens over the canvas and every drag in the suite fails
          // on a blocked click — a symptom that points nowhere near its
          // cause, which is why it is seeded here rather than dismissed.
          window.localStorage.setItem("jigsaw:display-name", "E2E");
        } catch {
          // A storage-less context just shows both dialogs; the test will
          // fail on a blocked click, which is a clear enough symptom.
        }
      }, room.slug);
      await page.goto(room.path);
      await waitForCanvasReady(page);
    });
  },

  holdServerActionResponses: async ({ page }, use) => {
    let released = false;
    let inFlight = 0;

    await use(async (delayMs: number) => {
      await page.route("**/room/**", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        inFlight++;
        try {
          const response = await route.fetch();
          const until = Date.now() + delayMs;
          // Polled rather than one long sleep, so teardown can cut it short
          // instead of waiting out a hold nobody is watching any more.
          while (!released && Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await route.fulfill({ response });
        } finally {
          inFlight--;
        }
      });
    });

    released = true;
    const drainBy = Date.now() + 5_000;
    while (inFlight > 0 && Date.now() < drainBy) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  },
});

export { expect };
