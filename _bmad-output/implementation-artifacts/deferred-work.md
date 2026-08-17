# Deferred Work

## Deferred from: code review of story-1-1-project-bootstrap (2026-08-09)

- `.dark` block never updates `--brand-accent`, so its contrast against dark backgrounds is unverified (`src/app/globals.css`) — dark mode is explicitly out of scope for V1 (DESIGN.md assumption), nothing consumes `.dark` yet.
- No code-level guard (e.g. `server-only` import) stops `SUPABASE_SECRET_KEY` from being imported into client code by accident — the network-gateway rejection is the only current protection. No file in this diff actually imports the secret key yet; establish the guard convention when the first Server Action does.
- No `error.tsx` boundary exists for `room/[id]` (or the other route segments) — low risk for a static placeholder with no real logic yet.
- ElectricSQL sync engine provisioning — decided: **Electric Cloud** (managed), not self-hosted. Deferred to Epic 3 (where real-time sync first becomes load-bearing) rather than provisioning another account/service now. When picked up: create the Electric Cloud project, add `ELECTRIC_URL`/token to `.env.example` and Vercel env vars, and wire `src/lib/db/collections.ts` to actually use `@tanstack/electric-db-collection`.
- No CI/automated gate (lint/build/test) enforces anything going forward — nothing in `.github/` runs on this repo yet. Separate infrastructure decision outside Story 1.1's scope.

## Deferred from: code review of story-1-2-sign-up (2026-08-10)

- No rate limiting or bot protection on the sign-up Server Action (`src/lib/auth/actions.ts`) — Supabase Auth has its own baseline server-side rate limits; revisit with a dedicated hardening pass if abuse becomes a real problem.
- `src/proxy.ts`'s matcher doesn't specifically exclude API/route-handler paths from the session-refresh call — no API routes exist yet (Server Actions are the write-path per Architecture AD-2), so nothing to exclude today; revisit if/when a Route Handler with different auth needs is added.

## Deferred from: code review of story-1-3-sign-in (2026-08-13)

- `createClient()` and `supabase.auth.signInWithPassword()` are both unguarded against a thrown/rejected promise — pre-existing pattern shared with `signUp` (Story 1.2), not introduced by Story 1.3; a fix should cover both actions together rather than diverging between them [src/lib/auth/actions.ts]
- No timeout on the Supabase network call in either `signIn` or `signUp` — a stalled network leaves the pending state hanging indefinitely; no story-wide timeout strategy exists yet [src/lib/auth/actions.ts]
- Potential timing side-channel: `signInWithPassword` likely takes measurably longer for a real account (password hash comparison) than an unknown email, theoretically distinguishing the two despite the identical error message — mitigating this is an architecture-level decision (e.g. constant-time padding), out of scope for a single story [src/lib/auth/actions.ts]

## Deferred from: code review of story-1-4-home (2026-08-13)

- No error boundary (`error.tsx`) or try/catch covers a failure of the Room-list data fetch — premature to build against `getRoomsForUser`'s current stub, which cannot throw; revisit once Epic 2 replaces it with a real (fallible) query [src/app/room-list.tsx]
- `formatRoomProgress` has no handling for `piecesPlaced > pieceCount`, negative values, or non-integer input — no real data source can produce these yet (stub only returns `[]`); Epic 2's real `Room` table should define these invariants at the DB level rather than requiring speculative UI-side clamping now [src/lib/rooms/format-room-progress.ts]

## Deferred from: code review of story-2-1-gate-room-creation-to-registered-participants (2026-08-13)

- The auth gate has no redirect-back mechanism (`?next=`) — a Guest bounced from a protected route to `/sign-in` loses their original destination. Pre-existing gap since Story 1.4 introduced `requireUser()`; fixing it properly means touching the shared `signIn`/`signUp` Server Actions and both forms across three already-completed stories. Recommend scoping as its own future story (e.g. "Preserve destination through sign-in") rather than folding into whichever story next calls `requireUser()` [src/lib/auth/require-user.ts, src/lib/auth/actions.ts, src/app/sign-in/*]

## Deferred from: code review of story-2-2-choose-the-puzzle-image (2026-08-13)

- No automated test covers `create-room-form.tsx` itself (library selection, `aria-pressed` toggling, upload-rejection preserving prior selection) — only the pure `validateUploadedImage` function is unit-tested. Adding component tests would require introducing React Testing Library/jsdom, a testing-infrastructure decision similar to Story 1.2's Vitest adoption; better addressed deliberately in its own story than pulled in silently during a patch round [src/app/create/create-room-form.tsx]
- ~~The product's user-facing copy is inconsistently bilingual across already-completed stories~~ — **RESOLVED 2026-08-13**: `next-intl` adopted (fixed `fr` locale, no `[locale]` routing — single-language V1, matching PRD/UX's French-speaking target users). All hardcoded English strings in Sign-in/Sign-up converted to French via `messages/fr.json`. `formatRoomProgress`/`validateUploadedImage` now return translation keys instead of hardcoded text. 33 tests still passing, build/lint clean, verified live via `curl`.

## Deferred from: code review of story-2-3-choose-the-piece-count (2026-08-14)

- No unit test for `get-image-dimensions.ts` — would require mocking the global `createImageBitmap`, not used elsewhere in the test suite; consistent with the already-deferred component-testing-infra gap from Story 2.2's review [src/lib/rooms/get-image-dimensions.ts]
- `isResolutionSufficient`'s heuristic ignores aspect ratio entirely (a very thin/wide image with enough total pixels would incorrectly pass) — already an explicitly disclosed provisional simplification; revisit once Epic 3's real piece-cutting service exists [src/lib/rooms/is-resolution-sufficient.ts]

## Forward reference noted during story-2-4 creation (2026-08-14)

- Unauthenticated (Guest) read access to `piece-tiles` Storage objects is unsolved — the bucket is private, and Story 2.4 only sets up authenticated INSERT access for the Participant creating the Room. Epic 3 (where Guests first need to actually see tile images) will need to solve this (a Storage read policy, or signed URLs) [supabase Storage: piece-tiles bucket policies]

## Deferred from: code review of story-2-4-create-the-room-and-get-a-shareable-invite-link (2026-08-17)

- The `piece-tiles` Storage upload policy has no per-room ownership scoping (`bucket_id = 'piece-tiles'` only) — any authenticated user can write to any room's folder if they know/guess its UUID. Not currently exploitable (no page exposes another Room's raw UUID yet), but a real gap once Epic 3 builds Guest-facing pages. Fix requires a two-phase Room-creation flow (create the `room` row first so the Storage policy can check `created_by = auth.uid()`) or per-object ownership metadata — a genuine architecture decision [supabase/migrations/20260814000000_rooms.sql]
- `room`/`piece`/`piece_adjacency`'s RLS SELECT policies use `using (true)` with no role scoping — would make every Room fully enumerable via PostgREST if the Data API were ever enabled. Verified currently not exploitable (Data API confirmed disabled: `/rest/v1/room?select=*` returns `503 PGRST002`). Revisit if Data API is ever turned on [supabase/migrations/20260814000000_rooms.sql]
- `pg.Pool` has no configured size/idle-timeout, and dev-only `globalThis` caching gives production a fresh pool per module evaluation with no documented lifecycle — operational tuning, premature for V1 traffic [src/lib/db/pg.ts]
- No DB-level constraint ties `room.grid_rows * grid_cols` to the actual `piece` row count, nor `piece_adjacency.room_id` to the `room_id` of the pieces it references — enforced only in application code today; would need trigger-level enforcement [supabase/migrations/20260814000000_rooms.sql]

## Deferred: Home thumbnail for upload-sourced Rooms (2026-08-17)

- Home now shows the real cover image for library-sourced Rooms (public static asset, trivial). Rooms created from a personal photo upload still show the gradient placeholder — no whole-image "cover" is persisted anywhere accessible (only sliced tiles exist, in the private `piece-tiles` bucket). Proper fix: upload an additional resized cover image (public or signed-URL-accessible) during Room creation (Story 2.4's pipeline) [src/app/room-list.tsx, src/lib/rooms/actions.ts]
