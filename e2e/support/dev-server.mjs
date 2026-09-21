/**
 * Runs the app under test and tees its output to a file.
 *
 * Why a wrapper rather than pointing Playwright's `webServer` straight at
 * `next dev`:
 *
 * - The server's stdout is *evidence*. `piece-actions.ts` prints
 *   `[move-reject] …` and `[no-fusion] …` lines that name exactly which
 *   branch rejected a drop — far more precise than anything observable from
 *   the browser. Playwright's `webServer` can print that output into the
 *   reporter but gives no programmatic handle on it, and test bodies run in
 *   worker processes that can't reach a buffer held by the config. A file is
 *   the simplest channel that crosses that boundary.
 * - Both stdout *and* stderr are captured: `console.warn` writes to stderr,
 *   and how Next 16 relays Server Action output is not something to assume.
 *
 * Runs `next dev` deliberately — those diagnostics are gated on
 * `NODE_ENV !== "production"`, so a production build would silently lose the
 * single most useful signal this harness has.
 */
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(here, "..", ".artifacts");
export const DEV_SERVER_LOG = join(artifactsDir, "dev-server.log");
const PORT = process.env.E2E_PORT ?? "3100";

mkdirSync(artifactsDir, { recursive: true });
// Truncated on every start so a run's log never begins with a previous
// run's rejections. Tests additionally scope their reads to a byte offset
// taken when the test starts.
const log = createWriteStream(DEV_SERVER_LOG, { flags: "w" });

const child = spawn("pnpm", ["exec", "next", "dev", "-p", PORT], {
  cwd: join(here, "..", ".."),
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    // Arms the dev-only stage hook the drag primitives read coordinates
    // from. Scoped to this process, so the maintainer's own `pnpm dev` on
    // port 3000 never exposes it.
    NEXT_PUBLIC_E2E_HOOKS: "1",
    // Next 16 allows only one `next dev` per build directory (an exclusive
    // lock on `<distDir>/dev/lock`, enforced regardless of port). A separate
    // distDir lets this server coexist with a dev server already running on
    // 3000 — and keeps that server's build cache intact.
    NEXT_DIST_DIR: ".next-e2e",
  },
});

for (const stream of [child.stdout, child.stderr]) {
  stream.pipe(log, { end: false });
  // Still relayed to the parent so Playwright can detect readiness and a
  // human watching the shell sees a normal dev server.
  stream.pipe(process.stdout);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  log.end();
  process.exit(code ?? (signal ? 1 : 0));
});
