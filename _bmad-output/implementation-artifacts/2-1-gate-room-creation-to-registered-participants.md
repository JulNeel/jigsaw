---
baseline_commit: 9e90fbd
---

# Story 2.1: Gate Room creation to registered Participants

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Guest,
I want to be blocked from creating a Room,
so that only registered Participants (who can be held accountable and whose stats persist) originate new Rooms.

## Acceptance Criteria

1. An unauthenticated Guest who requests `/create` is redirected to `/sign-in` instead of seeing the Room-creation screen.
2. A signed-in registered Participant reaches `/create` directly (no redirect, no interstitial) when they click the "Create a Room" button on Home — this button already exists and links to `/create` (Story 1.4).

## Tasks / Subtasks

- [x] Task 1: Gate `/create` behind authentication (AC: #1, #2)
  - [x] Make `src/app/create/page.tsx` an `async` Server Component and call `requireUser()` (`src/lib/auth/require-user.ts`, built in Story 1.4) at the top — do **not** reimplement the auth check inline; this is exactly the reuse case Story 1.4's Dev Notes anticipated ("future protected pages (Story 2.1's Room-creation gate, etc.) should reuse this helper").
  - [x] Leave the page's placeholder body (`Create Room`) untouched — Story 2.2 builds the real Room-creation UI; this story's scope is strictly the auth gate, nothing else.
- [x] Task 2: Regression check
  - [x] `pnpm build` — zero TypeScript errors (`/create` now shows as a dynamic route `ƒ` in the build's route table, confirming the auth check is wired in)
  - [x] `pnpm lint` — clean
  - [x] `pnpm test` — all 24 existing tests still pass (no new pure logic introduced by this story — `requireUser()` is already unit-tested from Story 1.4, reused as-is, not modified)
  - [x] Verified via `pnpm dev` + `curl`: an unauthenticated request to `/create` returns `307 -> /sign-in`
  - [x] Authenticated path (AC #2) not independently re-verified live — same tooling limitation as Story 1.4 (no headless browser available). `requireUser()` is unchanged and already unit-tested (4 tests, Story 1.4) plus already empirically verified end-to-end for `/` in Story 1.4; this story introduces no new authenticated-path logic beyond calling the same already-verified function on a second route.

### Review Findings

- [x] [Review][Patch] No test guards against `CreateRoomPage` silently losing its `requireUser()` call in a future edit — this story exists specifically to close this gap, but nothing in the test suite would catch a regression of it [src/app/create/page.tsx]
- [x] [Review][Defer] The auth gate has no redirect-back mechanism (`?next=`) — a Guest bounced from `/create` to `/sign-in` loses their original destination and lands wherever `/sign-in`'s hardcoded post-auth redirect goes, not back at `/create`. Pre-existing gap in `requireUser()`/the sign-in flow since Story 1.4 (this story only adds a second call site to an already-existing helper); fixing it properly means touching the shared `signIn`/`signUp` Server Actions and both forms across three already-completed stories — a cross-cutting UX enhancement better scoped as its own story than folded silently into this one [src/lib/auth/require-user.ts, src/lib/auth/actions.ts, src/app/sign-in/*]

## Dev Notes

- **This is the smallest possible story in Epic 2 — resist scope creep.** The temptation is to start building the actual Room-creation form (image picker, piece-count selector) since `/create`'s stub is right there — don't. Stories 2.2 and 2.3 own that UI; this story's only job is the auth gate, per its own AC #1/#2.
- **`requireUser()` already exists and is already tested** (`src/lib/auth/require-user.ts`, `src/lib/auth/require-user.test.ts`, both from Story 1.4) — this story is purely a consumer of it, exactly the reuse Story 1.4's Dev Notes predicted. Do not modify `require-user.ts` in this story; if a genuine change to its behavior is needed, that's a signal the change belongs in a story that owns that file, not this one.
- **No new tests needed for this story's own code.** `page.tsx` after this change contains zero new logic — it's a one-line `await requireUser()` call plus the existing placeholder JSX. The behavior being gated is already covered by `require-user.test.ts`. Adding a new test that re-asserts "calling `requireUser()` redirects when unauthenticated" would just be testing `requireUser()` a second time under a different name — skip it, per the "don't test what's already tested" discipline.
- **`/create`'s current placeholder body is intentionally left alone.** Verified by reading `src/app/create/page.tsx`: it currently renders `<div>Create Room</div>` with no props, no data fetching, nothing that would conflict with adding an auth check above it.

### Project Structure Notes

- Only one file changes: `src/app/create/page.tsx` (Server Component conversion + `requireUser()` call).
- No new files, no new dependencies, no domain-table work — this story is architecturally inert beyond the auth gate itself.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.1-Gate-Room-creation-to-registered-Participants] — story statement and AC source
- [Source: _bmad-output/implementation-artifacts/1-4-home.md] — `requireUser()` origin and its explicit forward-reference to this story as the next consumer
- [Source: src/app/create/page.tsx] — current stub content, confirmed unchanged by this story except for the auth gate

## Previous Story Intelligence (from Story 1.4)

- `requireUser()` (`src/lib/auth/require-user.ts`) is the established, tested auth-gate helper — call it, don't reimplement it. It already fails closed (redirects) on both "no user" and any `getUser()` error/throw, per Story 1.4's code review.
- pnpm is the only package manager.
- Vitest is configured; 24 tests currently pass across `src/lib/**/*.test.ts`.
- Story 1.4's code review reinforced: don't add speculative tests for code with no real logic of its own — test the thing that has behavior, not the thing that calls it.

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- Same environment limitation as Story 1.4: no headless browser available to drive an authenticated `curl`/browser session, so AC #2 relies on `requireUser()`'s existing unit tests + its prior end-to-end verification on `/` (Story 1.4) rather than a fresh live check on `/create`.

### Completion Notes List

- `src/app/create/page.tsx` converted to an `async` Server Component calling `requireUser()`, reusing Story 1.4's helper unmodified.
- No new files, no new tests — deliberately minimal scope per Dev Notes (don't build Story 2.2's UI early, don't re-test already-tested logic).
- `pnpm build`/`pnpm lint`/`pnpm test` all clean; `/create` confirmed dynamic in the build route table; unauthenticated redirect confirmed live via `curl` (307 → `/sign-in`).
- **Code review round (2026-08-13):** 1 patch applied, 1 item deferred (logged in `deferred-work.md`), ~13 findings dismissed as noise — most were relitigating decisions already made and reasoned through in Story 1.4's own review (fail-closed on `getUser()` error, `console.warn`-level logging, `redirect()`'s 307 status), or raised speculative out-of-scope concerns (banned/suspended-account states that don't exist anywhere in the current domain model). Patch: added `src/app/create/page.test.ts`, a regression guard asserting `CreateRoomPage()` calls `requireUser()` — directly protects against silently reverting the exact gate this story adds. Verified via `pnpm build`, `pnpm lint`, `pnpm test` (25 tests, all clean).

### File List

**Modified:**
- `src/app/create/page.tsx` (added `requireUser()` auth gate)

**New:**
- `src/app/create/page.test.ts` (added during code review — regression guard)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | Story implemented: `/create` gated behind `requireUser()` (AC #1–#2) |
| 2026-08-13 | Code review: 1 patch applied, 1 item deferred to `deferred-work.md`. Status → done. |
