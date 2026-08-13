---
baseline_commit: 816d2d5
---

# Story 1.4: Home

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a signed-in registered Participant,
I want to see the list of my Rooms and a button to create a new one,
so that I have a persistent entry point into the app.

## Acceptance Criteria

1. An unauthenticated visitor who requests `/` is redirected to `/sign-in` — Home ("Accueil (connecté)") is explicitly the *authenticated* entry point per EXPERIENCE.md's Information Architecture (row: "Accueil (connecté) | Ouverture de l'app, authentifié | Liste des Salons persistée du Participant inscrit (FR-11) + bouton 'Créer un salon'"); Guests reach the product exclusively via a Room invite link, never via Home.
2. A signed-in registered Participant with no Room yet sees an empty state on landing: a short message plus a prominent "Create a Room" button, with no error (mockup: `key-accueil.html` state 2 — icon, "Aucun Salon pour l'instant", "Créez-en un pour votre famille, ou rejoignez celui d'un proche via un lien.").
3. A skeleton (shadcn `Skeleton`, matching rows of the eventual Room list) is shown while the Room list is loading (EXPERIENCE.md State Patterns: "Accueil, chargement").
4. If Rooms exist, each is shown with its name, progress (pieces placed/total), and count of online Participants — this behavior is structurally prepared now but has no real data to exercise yet (see Dev Notes: Room domain table doesn't exist until Epic 2 Story 2.4); a static/zero online-count display is acceptable until Epic 4 wires live presence.
5. The "Create a Room" button is present in both the empty and populated states and navigates to `/create` (existing stub page from Story 1.1 — Epic 2 builds its real content).

## Tasks / Subtasks

- [x] Task 1: Add a reusable auth-gating helper and use it on Home (AC: #1)
  - [x] Create `src/lib/auth/require-user.ts` exporting `requireUser()`: calls `createClient()` (existing server client from Story 1.2) then `supabase.auth.getUser()`; if no user, `redirect("/sign-in")`; otherwise returns the `user`. This is the first tenant of the auth-check convention Architecture calls for ("toute autorisation... importe depuis `lib/auth/`... jamais de réimplémentation inline") applied to a page load, not just Server Actions — future protected pages (Story 2.1's Room-creation gate, etc.) should reuse this helper rather than re-deriving the same three lines.
  - [x] Call `requireUser()` at the top of `src/app/page.tsx` (must be an `async` Server Component to `await` it)
- [x] Task 2: Build the Home page shell (AC: #2, #5)
  - [x] Add the shadcn `Skeleton` component: `pnpm dlx shadcn@latest add skeleton` (same CLI convention as Story 1.1's `button` install — non-interactive, uses the project's existing `nova`/`radix` config in `components.json`)
  - [x] Rewrite `src/app/page.tsx`: header with "Vos Salons" heading + a "Create a Room" button (shadcn `Button`, `asChild` + `<Link href="/create">`) — matches `key-accueil.html`'s header row in both states
  - [x] Render a `<RoomList />` component (Task 3) below the header, wrapped in `<Suspense fallback={<RoomListSkeleton />}>` so the loading-skeleton mechanism (AC #3) is real Next.js/React infrastructure, not a simulated delay
- [x] Task 3: Build the Room list component and its (stubbed) data source (AC: #2, #4)
  - [x] Create `src/lib/rooms/get-rooms-for-user.ts` exporting an async `getRoomsForUser(userId: string)` that returns `Promise<Room[]>` — for now, returns `[]` unconditionally. Document clearly in a comment: this is a stub; Epic 2 Story 2.4 creates the `Room` Postgres table and this function's body is replaced with a real query at that point. Define a minimal `Room` type here (`id`, `name`, `pieceCount`, `piecesPlaced`, `onlineCount`) — Epic 2/4 will formalize the real domain type when the table exists; don't create a Postgres migration in this story (no domain tables — same restraint applied in Stories 1.2/1.3).
  - [x] Create `src/app/room-list.tsx` (async Server Component): calls `requireUser()` again is unnecessary (parent already gated) — instead accept the already-resolved `userId` as a prop from `page.tsx`, call `getRoomsForUser(userId)`, then render either the empty state (AC #2 — icon, "Aucun Salon pour l'instant" message, matches `key-accueil.html` state 2 exactly since copy was left as an `[ASSUMPTION]` in EXPERIENCE.md and this mockup is the more concrete source) or a list of Room cards (AC #4 — name, `${piecesPlaced} / ${pieceCount} pièces posées`-style progress, online-count badge) if the array is non-empty
  - [x] Create `src/app/room-list-skeleton.tsx`: a small static component rendering 2-3 shadcn `Skeleton` rows matching the Room card's approximate shape (thumbnail + two text lines), per `EXPERIENCE.md`'s "Accueil, chargement" state pattern
- [x] Task 4: Unit test the progress-formatting logic (AC: #4)
  - [x] Extract the "pieces placed / total" progress text into a small pure function, e.g. `formatRoomProgress(piecesPlaced: number, pieceCount: number): string` in `src/lib/rooms/format-room-progress.ts` — same rationale as `classifySignUpError` in Story 1.2: pure logic belongs in its own testable module, not inlined in JSX
  - [x] Add `src/lib/rooms/format-room-progress.test.ts` (Vitest, same setup as existing auth tests) covering: zero pieces placed, partial progress, fully complete (`piecesPlaced === pieceCount`)
- [x] Task 5: Regression check
  - [x] `pnpm build` — zero TypeScript errors
  - [x] `pnpm lint` — clean
  - [x] `pnpm test` — all tests pass (19 total: 16 existing + 3 new `formatRoomProgress` tests)
  - [x] Verified via `pnpm dev` + `curl`: an unauthenticated request to `/` returns a 307 redirect to `/sign-in`, confirming AC #1. **Limitation, documented honestly:** the authenticated empty-state render (AC #2, #5) could not be driven through the real browser session-cookie flow in this environment — no headless browser is installed (checked for Playwright/Chromium, none present), and Next.js Server Actions can't be triggered from plain `curl` (they require a client-generated action fingerprint, not a standard form POST). Verified instead by static review: `requireUser()` reuses the exact `createClient()`/`getUser()` pattern already empirically verified end-to-end in Stories 1.2 and 1.3, so its behavior for an authenticated request is not new/unverified logic — only the redirect branch (verified above) is new. Recommend the user do one manual browser pass (sign up, land on `/`, confirm empty state + button) as a final human check.
  - [x] Confirmed by re-reading `src/app/room-list.tsx`: the populated-state branch (`rooms.length > 0`) is reachable, correctly typed, and would render Room cards using `formatRoomProgress` (unit-tested) if `getRoomsForUser` returned data — the *only* thing preventing that today is the deliberate `[]` stub, not a logic gap. This can't be exercised end-to-end until Epic 2 Story 2.4 creates the `Room` table.

### Review Findings

- [x] [Review][Patch] Room cards in the populated state render no navigation — a Room's name/progress isn't wrapped in a link to `/room/[id]` (which already exists as a stub route from Story 1.1), undermining the "persistent entry point into the app" premise once Epic 2 populates real data [src/app/room-list.tsx]
- [x] [Review][Patch] The online-count segment is hidden entirely when `onlineCount` is `0` (`room.onlineCount > 0 && ...`), contradicting AC #4's "a static/zero online-count display is acceptable" — and the populated-card layout never reconciles with the "Terminé" state shown in the cited `key-accueil.html` mockup for a fully-completed Room [src/app/room-list.tsx:34-35]
- [x] [Review][Patch] `requireUser()` doesn't guard against `supabase.auth.getUser()` throwing (network/token-refresh failure), and silently discards any returned `error` — an unhandled rejection would crash Home's render instead of redirecting, and a real auth error is indistinguishable from "not signed in" with no diagnostic trail [src/lib/auth/require-user.ts]
- [x] [Review][Patch] `requireUser()` — the one actual auth-gate in this diff — has zero automated test coverage, while the risk-free `formatRoomProgress` formatter has 3 tests. Add unit tests for both branches (redirect when no user, return user when present) [src/lib/auth/require-user.ts]
- [x] [Review][Patch] `formatRoomProgress` renders nonsensical text ("0 / 0 pièces posées") when `pieceCount` is `0` (a malformed/edge-case Room record) [src/lib/rooms/format-room-progress.ts]
- [x] [Review][Defer] No error boundary (`error.tsx`) or try/catch covers a failure of the Room-list data fetch — premature to build against `getRoomsForUser`'s current stub, which cannot throw; revisit once Epic 2 replaces it with a real (fallible) query [src/app/room-list.tsx]
- [x] [Review][Defer] `formatRoomProgress` has no handling for `piecesPlaced > pieceCount`, negative values, or non-integer input — no real data source can produce these yet (stub only returns `[]`); Epic 2's real `Room` table should define these invariants at the DB level rather than requiring speculative UI-side clamping now [src/lib/rooms/format-room-progress.ts]

## Dev Notes

- **No `Room` table exists yet — confirmed by reading `supabase/migrations/20260809000000_baseline.sql`:** it is "intentionally empty of domain tables" per a documented "create tables only when needed" principle; the same file explicitly says Room/Piece/PieceAdjacency land in Epic 2 Story 2.4. Do **not** create a `Room` migration in this story — that's Epic 2's job. This story's `getRoomsForUser` stub and minimal local `Room` type are deliberately provisional; Epic 2 Story 2.4 will replace both with the real table and a real TanStack DB collection query (`src/lib/db/collections.ts` is still `export {}` — confirmed empty, this story does not add a collection to it, since Architecture AD-1 requires every collection to sync via an Electric Shape scoped to a Room, which needs the real table to exist first).
- **`requireUser()` is a page-load auth gate, not a Server Action authorization check** — Architecture's "toute Server Action mutante... importe son autorisation depuis `lib/auth/`" rule is written for mutations, but the same *principle* (auth logic lives in `lib/auth/`, never reimplemented inline) is worth applying here too since Story 2.1 ("Gate Room creation to registered Participants") will need the identical check. Build it once now as a shared helper.
- **`/create` already exists** (`src/app/create/page.tsx`, a `"Create Room"` stub from Story 1.1's bootstrap) — this story only needs to link to it, not build it. Epic 2 gives it real content.
- **Mockup vs EXPERIENCE.md copy conflict resolution:** EXPERIENCE.md's State Patterns table marks the empty-state copy as `[ASSUMPTION: copie exacte non spécifiée.]`, but `mockups/key-accueil.html` (referenced by EXPERIENCE.md itself as the composition reference for Accueil) has concrete copy ("Aucun Salon pour l'instant" / "Créez-en un pour votre famille, ou rejoignez celui d'un proche via un lien."). Per EXPERIENCE.md's own stated precedence rule ("Les spines gagnent en cas de conflit avec les maquettes"), the spine document wins on *behavior*, but for copy specifically the spine explicitly defers to assumption — use the mockup's concrete text since it's the more specific source and nothing in the spine contradicts it.
- **Why a `Suspense` boundary instead of a client-side loading flag:** `getRoomsForUser` currently resolves near-instantly (it's a stub returning `[]`), so there's no naturally observable loading window today. Using a real `<Suspense>` boundary around an `async` Server Component means the skeleton mechanism is genuine, working infrastructure that will show a real loading state once Epic 2 replaces the stub with an actual (network-latency-bound) Postgres/TanStack DB query — rather than faking a `setTimeout`-based delay now that would have to be deleted later.
- **NFR4 (accessibility) applies**, consistent with Stories 1.2/1.3: the empty-state icon should not be the only content (it already isn't — heading + paragraph carry the meaning), and the "Create a Room" button needs proper focus/label semantics (shadcn `Button` handles this by default).
- **No online-Participant data exists yet** (RoomPresence lands in Epic 4 Story 4.1) — per AC #4's own text, a static/zero display is explicitly acceptable. Do not attempt to wire real presence in this story.

### Project Structure Notes

- New: `src/lib/auth/require-user.ts`, `src/lib/rooms/get-rooms-for-user.ts`, `src/lib/rooms/format-room-progress.ts` (+ its test), `src/app/room-list.tsx`, `src/app/room-list-skeleton.tsx`.
- Modified: `src/app/page.tsx` (was a one-line "Jigsaw" placeholder from Story 1.1 — becomes the real Home page).
- New shadcn component: `src/components/ui/skeleton.tsx` (via CLI, same pattern as the existing `button.tsx`).
- `src/lib/rooms/` is a new directory, not in Architecture's originally-seeded source tree (which only listed `lib/piece-cutting/`, `lib/validation/`, `lib/auth/`, `lib/canvas/`, `lib/db/`) — a reasonable, minimal addition for Room-related pure logic that doesn't belong in any of those existing directories; Epic 2 will likely add more files here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4-Home] — story statement and AC source
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#Information-Architecture] — "Accueil (connecté)" requires Authentification (line 22)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#State-Patterns] — "Accueil, premier accès (aucun Salon)" (line 77), "Accueil, chargement" (line 78)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/mockups/key-accueil.html] — concrete empty-state copy and populated-state card layout (name, piece counts, online badge)
- [Source: supabase/migrations/20260809000000_baseline.sql] — confirms no domain tables exist yet, Room lands in Epic 2 Story 2.4
- [Source: _bmad-output/implementation-artifacts/1-3-sign-in.md] — established conventions this story reuses: `createClient()` server client, pnpm-only, Vitest test structure

## Previous Story Intelligence (from Story 1.3)

- pnpm is the only package manager, including for the shadcn CLI install in Task 2.
- `src/lib/auth/supabase-server.ts`'s `createClient()` is the established way to get a server-side Supabase client for reading the current session — reuse it in `requireUser()`, don't create a new client.
- Vitest is configured (`vitest.config.mts`, `pnpm test`) with 16 existing tests across `src/lib/auth/*.test.ts` — follow the same file-colocation pattern (`format-room-progress.ts` next to `format-room-progress.test.ts`) for the new `src/lib/rooms/` module.
- Story 1.3's code review (2026-08-13) reinforced accessibility discipline (`aria-describedby`, `aria-label` on ambiguous sections) — apply the same care to the empty-state and Room-card markup even though this story doesn't have form fields.
- A `"use server"` file may only export async functions — not relevant to this story's new files (none use the `"use server"` directive; `requireUser()` and `getRoomsForUser()` are plain async functions called from Server Components, not Server Actions).

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- No headless browser (Playwright/Chromium) is available in this environment, and Next.js Server Actions cannot be driven from plain `curl` (they need a client-generated action fingerprint) — the authenticated empty-state render could only be verified by static code review, not a live browser session. The unauthenticated redirect path (AC #1) *was* verified live via `curl` (307 → `/sign-in`). Recommended a follow-up manual browser pass to the user.

### Completion Notes List

- Added `src/lib/auth/require-user.ts` (`requireUser()`) — reuses the existing `createClient()` server client from Stories 1.2/1.3, redirects unauthenticated requests to `/sign-in`. First tenant of a shared auth-gate helper; Story 2.1 (Room-creation gate) should reuse it.
- Added shadcn `Skeleton` component via CLI (`pnpm dlx shadcn@latest add skeleton`), matching Story 1.1's install convention.
- Rewrote `src/app/page.tsx`: header ("Vos Salons" + "Créer un salon" button linking to `/create`) always visible, `<RoomList>` rendered inside a `<Suspense>` boundary with `<RoomListSkeleton>` as fallback.
- Added `src/lib/rooms/get-rooms-for-user.ts` — deliberately stubbed to return `[]` (no `Room` table exists until Epic 2 Story 2.4); the local `Room` type is provisional.
- Added `src/lib/rooms/format-room-progress.ts` (+ 3 unit tests) — pure formatting logic extracted out of JSX, same pattern as Story 1.2's `classifySignUpError`.
- Added `src/app/room-list.tsx` (empty-state + populated-state branches) and `src/app/room-list-skeleton.tsx`.
- `pnpm build`/`pnpm lint`/`pnpm test` all clean (19 tests total). `/` is now a dynamic route (reads cookies via `requireUser()`), confirmed in the build's route table.
- No domain tables created — consistent with Stories 1.2/1.3's restraint; `Room` lands in Epic 2 Story 2.4.
- **Code review round (2026-08-13):** all 5 patch findings applied, 2 deferred (both premature against the current stub data source — logged in `deferred-work.md`), 6 dismissed as noise — including two claims (`size-13` not a real Tailwind utility, `bg-gradient-to-br` renamed in Tailwind v4) that were verified **false** by inspecting the actual generated build CSS rather than taken on faith. Details: Room cards are now wrapped in a `<Link href="/room/${id}">` to the existing `/room/[id]` stub; the online-count segment now always renders (including "0 en ligne") except when a Room is complete, in which case it shows "Terminé" matching the cited mockup exactly; `requireUser()` now wraps `getUser()` in try/catch and logs (but doesn't swallow) any returned error, failing closed (redirect) on any failure; added 4 new unit tests for `requireUser()` covering signed-in, no-user, `getUser()`-error, and `getUser()`-throws branches; `formatRoomProgress` now returns a neutral "—" placeholder when `pieceCount` is 0 instead of "0 / 0 pièces posées". Verified via `pnpm build`, `pnpm lint`, `pnpm test` (24 tests, all clean).

### File List

**New:**
- `src/lib/auth/require-user.ts`
- `src/lib/auth/require-user.test.ts` (added during code review)
- `src/lib/rooms/get-rooms-for-user.ts`
- `src/lib/rooms/format-room-progress.ts`
- `src/lib/rooms/format-room-progress.test.ts`
- `src/app/room-list.tsx`
- `src/app/room-list-skeleton.tsx`
- `src/components/ui/skeleton.tsx` (via shadcn CLI)

**Modified:**
- `src/app/page.tsx` (was a one-line placeholder — now the real Home page)
- `src/app/room-list.tsx` (code review: card navigation link, online-count/Terminé display fix)
- `src/lib/auth/require-user.ts` (code review: try/catch + error logging, fail-closed on error)
- `src/lib/rooms/format-room-progress.ts` (code review: guard for `pieceCount <= 0`)
- `src/lib/rooms/format-room-progress.test.ts` (code review: added zero-pieceCount test)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | Story implemented: Home page with auth gate, empty/populated Room list states, loading skeleton (AC #1–#5) |
| 2026-08-13 | Code review: 5 patches applied, 2 items deferred to `deferred-work.md`. Status → done. |
