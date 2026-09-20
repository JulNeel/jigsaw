import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Resolved from the repo root rather than `import.meta.url`: Playwright
// transpiles these modules to CommonJS, where `import.meta` is a syntax
// error. Playwright always runs from the project root, and so does the
// `tsx`-driven CLI.
export const DEV_SERVER_LOG = join(process.cwd(), "e2e", ".artifacts", "dev-server.log");

/**
 * A byte offset into the dev server's log.
 *
 * The server is long-lived and shared across every test in a run, so a test
 * that asserted against the whole file would see other tests' rejections.
 * Opening a cursor at the start of each test scopes every read to "lines
 * this test caused", which is what makes `assertNoLogLine` meaningful.
 */
export type LogCursor = { offset: number };

function currentSize(): number {
  try {
    return statSync(DEV_SERVER_LOG).size;
  } catch {
    return 0;
  }
}

export function openCursor(): LogCursor {
  return { offset: currentSize() };
}

export function readSince(cursor: LogCursor): string {
  try {
    const buf = readFileSync(DEV_SERVER_LOG);
    return buf.subarray(Math.min(cursor.offset, buf.length)).toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Resolves with the first match for `pattern` written after `cursor`.
 *
 * Polled rather than watched: `fs.watch` misses appends on some platforms
 * and the log is tiny, so a 50ms poll is both simpler and more reliable.
 */
export async function waitForLogLine(
  cursor: LogCursor,
  pattern: RegExp,
  timeoutMs = 10_000,
): Promise<RegExpMatchArray> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const match = readSince(cursor).match(pattern);
    if (match) {
      return match;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `e2e: no dev-server log line matching ${pattern} within ${timeoutMs}ms.\n` +
          `--- log since cursor ---\n${readSince(cursor).slice(-2000)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Fails if `pattern` appeared since `cursor`.
 *
 * Used on happy paths: a test that passes while the server was quietly
 * rejecting writes is not actually passing. The matched line is included in
 * the failure so the diagnosis is in the test output rather than something
 * to go reproduce by hand.
 */
export function assertNoLogLine(cursor: LogCursor, pattern: RegExp, context: string): void {
  const match = readSince(cursor).match(pattern);
  if (match) {
    throw new Error(`e2e: ${context} — unexpected server log line:\n  ${match[0]}`);
  }
}

/** Convenience for failure messages: everything this test provoked. */
export function logTail(cursor: LogCursor, maxChars = 2000): string {
  return readSince(cursor).slice(-maxChars);
}
