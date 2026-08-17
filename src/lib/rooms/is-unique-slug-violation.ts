/**
 * Detects a Postgres unique_violation (23505) on `room.invite_slug`
 * specifically, so the caller can retry with a new slug rather than
 * treating it as a generic failure. Extracted from `actions.ts` (a
 * `"use server"` file that transitively imports `server-only`/`pg`, which
 * can't be unit-tested outside Next's bundler) so this pure logic stays
 * testable in isolation.
 */
export function isUniqueSlugViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505" &&
    "constraint" in err &&
    (err as { constraint?: string }).constraint === "room_invite_slug_key"
  );
}
