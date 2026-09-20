import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";

// Next loads `.env.local` itself; Playwright does not. The seeding layer
// needs DATABASE_URL in this process, so load it before anything reads it.
dotenv.config({ path: ".env.local", quiet: true });

const PORT = process.env.E2E_PORT ?? "3100";

export default defineConfig({
  testDir: "./e2e",
  // `*.e2e.ts`, never `*.spec.ts` — the latter is Vitest's default pattern
  // and the two runners share this repo.
  testMatch: /.*\.e2e\.ts$/,
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",

  // One worker, no parallelism: every test seeds into a shared hosted
  // Supabase project over scarce direct connections, and they share one dev
  // server whose log is an evidence source scoped by byte offset.
  workers: 1,
  fullyParallel: false,
  // Deliberately zero. The bugs this harness exists to find are intermittent;
  // a retry would launder exactly the signal worth seeing.
  retries: 0,

  expect: {
    // Above AWAIT_VERSION_TIMEOUT_MS (15s, src/lib/db/collections.ts) so a
    // genuine client-side rollback is observed rather than cut short by the
    // runner and misreported as a timeout.
    timeout: 20_000,
  },
  timeout: 90_000,
  reporter: [["list"]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Fixed so the stage's fit-to-content scale is reproducible between runs.
    viewport: { width: 1280, height: 900 },
  },

  webServer: {
    command: "node e2e/support/dev-server.mjs",
    url: `http://localhost:${PORT}/`,
    // Turbopack's cold compile of /room/[id] is slow, and it happens inside
    // this window rather than inside a test's.
    timeout: 240_000,
    // The working loop is one long-lived `pnpm e2e:server` plus many fast
    // `pnpm e2e` runs, paying that compile once. Reuse only ever attaches to
    // our own wrapper on this port, so the log file is always live.
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
  },
});
