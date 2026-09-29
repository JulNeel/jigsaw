/**
 * Where to send someone after they sign in, when they were interrupted.
 *
 * **This is an open-redirect guard, and it is the whole reason this is a
 * separate, tested function rather than three lines in a Server Action.** A
 * `next` parameter that is handed to `redirect()` without checking is one of
 * the oldest ways to turn a trusted domain into a phishing hop: a link to
 * `…/sign-in?next=https://evil.example` shows your sign-in page and then
 * drops the person somewhere else entirely, with your domain in the history
 * as the referrer.
 *
 * So this returns a *relative in-app path or nothing*. Never a URL, never a
 * host, never the caller's string passed through.
 *
 * Rejected, and each for its own reason:
 * - anything with a scheme (`https:`, `javascript:`, `data:`)
 * - protocol-relative `//evil.example`, which browsers treat as absolute
 *   despite starting with a slash — the case a naive `startsWith("/")`
 *   check misses
 * - backslashes, which some browsers normalise to `/` (`/\evil.example`)
 * - anything not starting with `/`, which would resolve relative to the
 *   current path and is never what a caller means
 *
 * Returns `null` rather than a fallback, so the caller decides what "no
 * destination" means. Today that is Home.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  // A path is at most this long before it stops being a destination and
  // starts being a payload.
  if (raw.length > 512) {
    return null;
  }
  if (!raw.startsWith("/")) {
    return null;
  }
  // `//host` and `/\host` are absolute to a browser despite the leading
  // slash. This is the check a "starts with /" guard is missing.
  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return null;
  }
  if (raw.includes("\\")) {
    return null;
  }
  // Control characters, including the newline that would let a value split a
  // header if this were ever used somewhere other than `redirect()`.
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }
  return raw;
}
