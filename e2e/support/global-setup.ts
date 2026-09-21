import { statSync } from "node:fs";
import { DEV_SERVER_LOG } from "./server-log";
import { seedRoom, sweepSeededRooms } from "./seed";

const PORT = process.env.E2E_PORT ?? "3100";

/**
 * Fails fast when the dev server wasn't started through our wrapper.
 *
 * With `reuseExistingServer`, Playwright happily attaches to whatever is
 * listening on the port — including a plain `next dev` someone started by
 * hand. That server's output goes nowhere we can read, so every log-based
 * assertion would silently degrade into "no line found". Better to say so.
 */
function assertLogIsLive(): void {
  let age: number;
  try {
    age = Date.now() - statSync(DEV_SERVER_LOG).mtimeMs;
  } catch {
    throw new Error(
      `e2e: ${DEV_SERVER_LOG} does not exist.\n` +
        "The dev server must be started through the wrapper so its output can be captured:\n" +
        "  pnpm e2e:server\n" +
        `(or stop whatever else is listening on :${PORT} and let Playwright start it)`,
    );
  }
  const TEN_MINUTES = 10 * 60 * 1000;
  if (age > TEN_MINUTES) {
    throw new Error(
      `e2e: ${DEV_SERVER_LOG} hasn't been written to in ${Math.round(age / 60000)} minutes — it is stale.\n` +
        `Something other than our wrapper is probably serving :${PORT}. Restart with: pnpm e2e:server`,
    );
  }
}

async function globalSetup() {
  // Reclaim rooms from crashed runs, but only old ones — a 2h floor means a
  // run starting now can never delete a room another session is looking at.
  const swept = await sweepSeededRooms(2);
  if (swept > 0) {
    console.log(`[e2e] swept ${swept} stale seeded room(s)`);
  }

  assertLogIsLive();

  // Compile /room/[id] before the first test's clock starts. Turbopack's
  // first render of that route costs tens of seconds, which would otherwise
  // be charged to whichever test happens to run first.
  const warmup = await seedRoom({ gridRows: 2, gridCols: 2 });
  try {
    const response = await fetch(`http://localhost:${PORT}${warmup.path}`);
    if (!response.ok) {
      throw new Error(`e2e: warm-up request returned ${response.status}`);
    }
    await response.text();
  } finally {
    await warmup.cleanup();
  }
}

export default globalSetup;
