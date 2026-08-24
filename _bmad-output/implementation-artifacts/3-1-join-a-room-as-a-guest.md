---
baseline_commit: bc1ad9b
---

# Story 3.1: Join a Room as a Guest

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a person with a Room's invite link,
I want to open it and land directly inside the Room,
so that I can start contributing without any signup friction.

## Acceptance Criteria

1. A valid Room invite link opens directly, with no account-creation step and no auth gate — the visitor enters as a Guest (a session with no account, per Architecture's Consistency Conventions).
2. The Canvas renders the Frame and every Piece at its current position, reflecting the Room's actual state (for every Room created so far, that means the Frame is empty and every Piece sits at its scattered position — no placement mechanism exists yet, that's Story 3.5).
3. An invalid or expired invite link (no matching `invite_slug`) shows a clear error message instead of a broken/blank Canvas.

## User-confirmed scope decision (2026-08-20)

**Simple server-side read first, no ElectricSQL/TanStack DB yet.** Architecture's Electric Cloud provisioning was explicitly deferred (Story 1.1) to "whenever Epic 3 actually needs it." This story's ACs only require showing the Room's state *at load time* — no live update requirement appears until concurrent multi-Participant editing matters (Story 3.5 onward). This story therefore reads Room/Piece data via a direct Postgres query in a Server Component (the same pattern already established by `getRoomsForUser`), not a TanStack DB collection synced through an Electric Shape. Wiring real-time sync is deferred to whichever story first genuinely requires it (almost certainly Story 3.5, where the Frame must update for every Participant "with no perceptible delay").

## Tasks / Subtasks

- [x] Task 1: Schema addition — persist real tile dimensions, and open Storage read access to Guests (AC: #2)
  - [x] Add a migration `supabase/migrations/<timestamp>_room_tile_dimensions.sql`: `alter table room add column tile_width int not null, add column tile_height int not null` — every tile in a Room is the same size (computed once in `sliceImageIntoTiles`), so this belongs on `room`, not repeated per `piece`. Needed so the Frame's true pixel size (`grid_cols * tile_width` × `grid_rows * tile_height`) can be rendered accurately — Story 2.4 computed `tileWidth`/`tileHeight` in `sliceImageIntoTiles` but never persisted them, a gap this story closes.
  - [x] Update `src/lib/rooms/actions.ts`'s `createRoom` to accept and store `tileWidth`/`tileHeight` in the `room` insert; update `src/app/create/create-room-form.tsx` to pass them through (they're already computed locally in `handleSubmit`, just weren't threaded to the Server Action)
  - [x] Add a `storage.objects` `SELECT` policy for `piece-tiles` scoped `to anon, authenticated` (mirroring the read-open, write-locked-down model already used for `room`/`piece`/`piece_adjacency`'s RLS) — **this resolves the Story 2.4 deferred item** "Unauthenticated (Guest) read access to Storage tiles is unsolved." The bucket itself stays `private`; this policy only permits generating signed URLs for objects in it, not arbitrary public access.
  - [x] Apply both changes to the live Supabase project (same direct-connection method as Story 2.4) and verify
- [x] Task 2: Public Room lookup by invite slug (AC: #1, #2, #3)
  - [x] Create `src/lib/rooms/get-room-by-slug.ts` exporting `getRoomBySlug(slug: string): Promise<RoomDetail | null>` — queries `room` (by `invite_slug`) joined with all its `piece` rows via the existing `pgPool` (same direct-read pattern as `getRoomsForUser`, not a Server Action — this is a read, Architecture AD-2 governs writes). Returns `null` on no match (AC #3's trigger). For each piece, also generates a signed Storage URL (`supabase.storage.from('piece-tiles').createSignedUrl(imageAssetRef, ...)`, 1 hour expiry) via the browser-pattern Supabase client (works unauthenticated now that Task 1's policy is in place) — the Canvas needs a fetchable URL per tile, not just its raw storage path.
  - [x] Define `RoomDetail`'s shape: Room-level fields (`name`, `gridRows`, `gridCols`, `tileWidth`, `tileHeight`) plus `pieces: Array<{ id: string; row: number; col: number; shapeType: PieceShapeType; scatterX: number; scatterY: number; imageUrl: string }>`
- [x] Task 3: The Guest-facing Room page (AC: #1, #3)
  - [x] Rewrite `src/app/room/[id]/page.tsx` (Story 1.1's placeholder stub — its `[id]` segment conceptually holds the invite slug, per Story 2.4's Dev Notes): call `getRoomBySlug(params.id)`; if `null`, render an inline error state (AC #3) — no Canvas, no crash, a clear message and (reusing the established pattern) nothing else on the page attempts to render
  - [x] **No auth gate of any kind** — do not call `requireUser()` or any equivalent here. This route is intentionally the one exception to every prior story's "gate behind sign-in" pattern; a Guest must reach it with zero friction (AC #1)
  - [x] On a valid Room, render the real Canvas (Task 4) instead of the existing `<CanvasSmokeTest />` placeholder
- [x] Task 4: Build the real Canvas — Frame + scattered Pieces (AC: #2)
  - [x] Create `src/components/canvas/room-canvas.tsx` (Client Component, replacing the Story 1.1 smoke test as the thing actually rendered on this page): a `react-konva` `Stage`/`Layer` rendering (a) the Frame as an outlined rectangle sized `gridCols * tileWidth` × `gridRows * tileHeight`, centered at the canvas origin `(0, 0)` (the same origin `seeded-scatter.ts`'s positions are centered on), and (b) each Piece as a Konva `Image` (loaded from its signed `imageUrl`) positioned at `(scatterX, scatterY)` relative to that same origin
  - [x] Load piece images via `use-image` or a small `useImage(url)` hook wrapping the standard `Image()`/`onload` pattern — whichever adds the least new surface area; if a piece's image fails to load, render its slot as an empty placeholder rather than crashing the whole Canvas (a single broken tile must not break the Room for everyone)
  - [x] Keep this story's Canvas **static** — no pan/zoom/drag yet (Story 3.3 owns navigation, Story 3.5 owns placement/dragging). A fixed initial view that fits the scattered pieces + Frame in the viewport (e.g. a starting scale computed from the scatter radius range, `SCATTER_RADIUS_RANGE` in `create-room-form.tsx`) is enough for this story's AC #2 ("see the Canvas... reflecting current state") — don't build interactivity this story doesn't require yet
  - [x] Update `src/components/canvas/canvas-smoke-test-loader.tsx`'s pattern (client-only dynamic import, `ssr: false` via a wrapper) for `RoomCanvas` too — Konva requires a browser environment, same constraint that shaped the original smoke test
- [x] Task 5: Regression check
  - [x] `pnpm build` — zero TypeScript errors
  - [x] `pnpm lint` — clean
  - [x] `pnpm test` — all 75 existing tests pass unchanged (no new pure logic beyond what's already covered; `getRoomBySlug`/the page/the Canvas component are all integration-level, same reasoning as `getRoomsForUser`/`createRoom`)
  - [x] Verified end-to-end against the real Supabase project (throwaway script + `curl`, same discipline as every prior story): create a real Room (reusing Story 2.4's pipeline or a script mirroring it), confirm `/room/<its-real-invite-slug>` returns the Room's data via `getRoomBySlug` including working signed tile URLs (fetch one, confirm it resolves to real image bytes), confirm `/room/some-nonexistent-slug` resolves to the error state, not a crash
  - [x] **Limitation, documented honestly (same as every story since 1.4):** no headless browser available — the actual rendered Canvas (Frame outline, piece images loading and positioned correctly) can't be visually verified here. Recommend the user open a real Room's invite link in a browser (logged out, to genuinely exercise the Guest path) as a final check.

### Review Findings

- [x] [Review][Patch] `createRoom` trusts client-supplied `tileWidth`/`tileHeight` with zero server-side validation, inconsistent with the existing row/col bounds-checking discipline in the same function — a buggy/malicious client could submit a negative or absurd value, corrupting the Frame's rendered size for every future Guest [src/lib/rooms/actions.ts]
- [x] [Review][Patch] `room-canvas.tsx`'s `CONTENT_SPAN = 4400` is a hardcoded constant disconnected from the actual per-Room frame size or scatter radius — a Room with large tiles/few columns can have content whose extent exceeds this fixed span, silently clipping pieces off the visible Stage with no error or fallback [src/components/canvas/room-canvas.tsx]
- [x] [Review][Patch] `RoomPage` doesn't distinguish "Room not found" from "an error occurred while loading it" — `getRoomBySlug` only returns `null` on a genuine slug miss; any thrown exception (DB error, Storage API failure) is unhandled and would produce Next.js's generic error boundary instead of a Guest-friendly message [src/app/room/[id]/page.tsx, src/lib/rooms/get-room-by-slug.ts]
- [x] [Review][Patch] `usePieceImage` returns `null` for both "still loading" and "definitively broken" — `PieceSprite`'s dashed-outline fallback can't distinguish the two, so a slow-loading tile looks identical to a permanently broken one with no signal to the Guest either way. Related: `createSignedUrls`' per-entry `error` field is never checked before mapping into `urlByPath`, so a partial-failure response could silently misattribute a URL to the wrong path [src/components/canvas/room-canvas.tsx, src/lib/rooms/get-room-by-slug.ts]
- [x] [Review][Patch] `RoomDetailPiece` sends every piece's `row`/`col` (its exact position in the solved image) to the client, even though `room-canvas.tsx` never renders them — since the whole object is passed to a Client Component, Next.js serializes `row`/`col` into the page's data regardless of what's visually rendered, meaning any Guest who opens dev tools can read off the correct position of every piece before anyone has placed anything, undermining the "genuinely unsolved puzzle" premise (Story 2.4 AC #4) [src/lib/rooms/get-room-by-slug.ts, src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] No rate limiting or enumeration guard on `getRoomBySlug` — a public, unauthenticated, unthrottled lookup by slug. Consistent with the project's existing rate-limiting deferrals (Story 1.2's sign-up action); slug entropy (name + 6-char random suffix) makes brute-forcing impractical today, revisit if abuse becomes real [src/lib/rooms/get-room-by-slug.ts]
- [x] [Review][Defer] Signed tile URLs are regenerated on every page load with no caching, even within their 1-hour validity window — a single popular invite link hit repeatedly could add unnecessary Storage-API load. Premature optimization without real usage/cost data yet [src/lib/rooms/get-room-by-slug.ts]
- [x] [Review][Defer] The `storage.objects` `SELECT` policy scopes only by `bucket_id`, not by the requesting Guest's specific Room/invite-slug — anyone who obtains (or guesses) one Room's tile path could generate a signed URL for it directly via the Storage API without ever knowing that Room's invite slug. Mirrors the already-deferred Story 2.4 write-scoping gap (same underlying "Storage RLS isn't Room-aware" question); low real-world exploitability today since paths are keyed by unguessable UUIDs, but both read and write scoping should likely be resolved together in a dedicated Storage-security pass before Guest-facing features expand further [supabase/migrations/20260820000000_room_tile_dimensions.sql]

## Dev Notes

- **This story does not create any Guest identity/session record.** "Enter as a Guest" here means exactly one thing: *no auth gate blocks the route*. Architecture's Consistency Conventions describe a Guest as "une session sans compte" — Epic 4 (`RoomPresence`, Guest→Participant conversion) is where an actual Guest session concept gets built; this story doesn't need one to satisfy its own ACs.
- **`src/app/room/[id]/page.tsx`'s dynamic segment is the invite slug, not the Room's UUID** — this was already decided in Story 2.4's Dev Notes (the route existed as a stub before the concept of an invite slug existed) and is finalized here: `getRoomBySlug` is the only lookup this route performs. Nothing in this codebase looks up a Room by raw UUID from a URL.
- **Frame/Piece coordinate space**: `seeded-scatter.ts` (Story 2.4) generates `scatterX`/`scatterY` centered on `(0, 0)`, described at the time as "an arbitrary canvas-pixel space centered on the Frame's origin." This story is what actually establishes that convention concretely: the Frame rectangle is drawn centered on `(0, 0)` too, so a piece's stored scatter coordinates place it correctly relative to the Frame without any translation math. If a future story needs a different convention, it'll need to migrate stored `scatter_x`/`scatter_y` values, not just change rendering code.
- **Signed Storage URLs, not public ones — the bucket stays `private`.** Task 1's new RLS policy permits *generating* a signed URL for `anon`/`authenticated`, it does not make the bucket's contents world-reachable via a stable public path. Each page load calls `createSignedUrl` fresh; URLs expire (1 hour chosen here, arbitrary — revisit if that's too short/long once real usage patterns exist).
- **`tile_width`/`tile_height` retrofit touches already-shipped Story 2.4 code** (`actions.ts`, `create-room-form.tsx`) — this is an additive migration (`ALTER TABLE ... ADD COLUMN ... NOT NULL` needs a value for any existing rows; if any test/manual Rooms still exist in the live project from prior verification runs, either backfill them or confirm none remain before applying `NOT NULL` — check via a quick `SELECT count(*) FROM room` before running the migration).
- **No pan/zoom/drag in this story, on purpose.** EXPERIENCE.md's "Espace infini" (infinite Canvas) navigation is Story 3.3's job specifically; the "tutorial" Story 3.2 references dismisses on later visits, also not this story. Resist building ahead — a static, correctly-populated Canvas satisfies AC #2 as written.
- **A single broken/missing tile must not break the whole Canvas** — this echoes NFR1 ("no piece ever becomes permanently unreachable") in spirit, even though NFR1 itself is formally Story 3.3's concern; a defensive per-tile fallback costs little and avoids one bad Storage object taking down a whole family's Room.

### Project Structure Notes

- New: `supabase/migrations/<timestamp>_room_tile_dimensions.sql`, `src/lib/rooms/get-room-by-slug.ts`, `src/components/canvas/room-canvas.tsx` (+ a client-only loader wrapper, mirroring `canvas-smoke-test-loader.tsx`).
- Modified: `src/app/room/[id]/page.tsx` (real content replacing the Story 1.1 stub), `src/lib/rooms/actions.ts` and `src/app/create/create-room-form.tsx` (thread `tileWidth`/`tileHeight` through to storage).
- `src/components/canvas/canvas-smoke-test.tsx`/`canvas-smoke-test-loader.tsx` are superseded on this route but not deleted outright unless nothing else references them — check before removing.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.1-Join-a-Room-as-a-Guest] — story statement and AC source
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#Consistency-Conventions] — "un Guest est une session sans compte, promue en Participant authentifié sur inscription"
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md] — "Salon (Espace infini + Cadre)" IA entry; State Patterns "Invité, accès suivant (même session)" (tutorial doesn't reappear — Story 3.2, noted for context)
- [Source: _bmad-output/implementation-artifacts/2-4-create-the-room-and-get-a-shareable-invite-link.md] — `room`/`piece`/`piece_adjacency` schema, `invite_slug` lookup convention, the deferred Guest-Storage-read-access item this story resolves
- [Source: _bmad-output/implementation-artifacts/1-1-project-bootstrap.md] — Electric Cloud deferral decision, Konva/react-konva smoke test this story's real Canvas replaces

## Previous Story Intelligence (from Story 2.4 and Epic 2 generally)

- `pgPool` (`src/lib/db/pg.ts`, `server-only` guarded) is the established direct-read/write Postgres client — `getRoomBySlug` reuses it exactly like `getRoomsForUser` does.
- `LIBRARY_IMAGES`/library-sourced Room thumbnails were just wired on Home (2026-08-17 fix) — a reminder that this codebase already has two different "how do we display a Room's image" code paths (Home's single cover thumbnail vs. this story's full per-piece tile rendering); they're solving different problems, not a duplication to consolidate.
- `messages/fr.json` (`next-intl`, fixed `fr` locale) is still the single source of UI copy — this story's error-state message and any Canvas-adjacent labels belong there.
- pnpm is the only package manager; Vitest is configured with 75 existing tests. No new pure/testable logic is anticipated in this story (everything new is either DB-integration or browser-rendering code), consistent with how `createRoom`/`getRoomsForUser` were treated.
- The direct Postgres connection requires IPv6 — if applying this story's migration hits `ENOTFOUND` again, check for an active VPN first (this exact issue recurred once already, Story 2.4).

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- Direct Postgres connection failed with `ENOTFOUND` again at the start of this story (same IPv6/ProtonVPN issue as Story 2.4) — same fix, disable the VPN.
- `room-canvas.tsx`'s first `usePieceImage` implementation called `setImage(null)` synchronously in the effect body's early-return branch — rejected by `react-hooks/set-state-in-effect` (same rule Story 2.3 hit). Fixed by keying the returned image on the URL it was loaded for (`{ url, image }`) instead of resetting state directly; `setState` now only ever happens inside the async `onload`/`onerror` callbacks.
- A stale `next dev` process from an earlier verification round (this session) was still running on port 3000 with pre-edit code, briefly making a fresh French translation ("RoomView.notFoundBody") appear to render as a raw untranslated key. Killed the stale process and re-verified — not a real i18n bug.
- 3 Rooms already existed in the live project from Story 2.4's manual testing — `tile_width`/`tile_height` couldn't be added as `NOT NULL` without a backfill. Recomputed the exact values from the known `office-workstation` image dimensions (1587×1123) and each Room's stored `grid_rows`/`grid_cols`, using the same formula `sliceImageIntoTiles` uses — not fabricated data.

### Completion Notes List

- Added `room.tile_width`/`tile_height` (backfilled for 3 pre-existing Rooms, then set `NOT NULL`) so the Frame can be rendered at its true pixel size; threaded through from `sliceImageIntoTiles` → `create-room-form.tsx` → `createRoom`.
- Added a `storage.objects` `SELECT` policy (`anon, authenticated`) for the `piece-tiles` bucket — resolves the Story 2.4 deferred item on Guest Storage read access. Bucket stays `private`; only signed-URL generation is permitted, not public access.
- `getRoomBySlug()` — public, unauthenticated Room lookup by `invite_slug`, reusing the `pgPool` direct-read pattern (`getRoomsForUser`'s precedent) rather than a Server Action, since this is a read. Uses a plain `@supabase/supabase-js` client (not the `@supabase/ssr` browser/server wrappers, which manage cookie-based sessions irrelevant to a sessionless Guest) to generate signed tile URLs.
- `/room/[id]/page.tsx` rewritten: no auth gate (intentional, the one exception to every prior story's sign-in gate), renders the error state on an unmatched slug, otherwise the real Canvas.
- `room-canvas.tsx` — first real Canvas content (Frame outline + pieces at their scatter positions), replacing the Story 1.1 Konva smoke test, which is now deleted (nothing else referenced it).
- Canvas is deliberately static — no pan/zoom/drag; that's Stories 3.3/3.5's scope, not this one's.
- Verified end-to-end against the real Supabase project: fetched a real signed tile URL as a genuinely anonymous (no-session) client and confirmed it resolves to real `image/webp` bytes; confirmed a valid invite slug returns 200 and an invalid one renders the French error copy, not a crash; confirmed no auth redirect occurs on the Room route.
- `pnpm build`/`pnpm lint`/`pnpm test` all clean (75 tests, unchanged — no new pure logic in this story).
- **Code review round (2026-08-21):** 5 patches applied, 3 items deferred (logged in `deferred-work.md` — Storage RLS path-scoping mirrors an already-deferred Story 2.4 gap; rate limiting and signed-URL caching are both premature without real usage data). Most consequential fix: `RoomDetailPiece` no longer sends `row`/`col` to the client at all — those fields are each piece's exact position in the solved image, and since the whole object serializes into the Client Component's props regardless of what's rendered, a curious Guest could have read the answer straight out of dev tools before anyone placed a single piece. Also fixed: `createRoom` now validates `tileWidth`/`tileHeight` are positive integers instead of trusting the client verbatim; the Canvas's view span is now derived from the Room's actual Frame size and every piece's real scatter position instead of a hardcoded constant (so nothing is clipped regardless of how a Room was seeded); `RoomPage` now distinguishes a genuine DB/Storage error from an unmatched invite slug, each with its own French message; `usePieceImage` now tracks an explicit loading/loaded/error state so a slow-loading tile no longer looks identical to a permanently broken one, and `createSignedUrls`' per-entry errors are now checked before use. Verified via `pnpm build`, `pnpm lint`, `pnpm test` (75 tests, unchanged), plus a fresh live `curl` check of both the valid and invalid invite-link paths.

### File List

**New:**
- `supabase/migrations/20260820000000_room_tile_dimensions.sql`
- `src/lib/rooms/get-room-by-slug.ts`
- `src/components/canvas/room-canvas.tsx`
- `src/components/canvas/room-canvas-loader.tsx`

**Modified:**
- `src/lib/rooms/actions.ts` (added `tileWidth`/`tileHeight` to `CreateRoomInput` and the `room` insert; code review added positive-integer validation for both)
- `src/app/create/create-room-form.tsx` (threads `tileWidth`/`tileHeight` from `sliceImageIntoTiles` to `createRoom`)
- `src/lib/piece-cutting/slice-image.ts` (returns `{ tiles, tileWidth, tileHeight }` instead of a bare `Blob[]`)
- `src/app/room/[id]/page.tsx` (real content: `getRoomBySlug` lookup, error state, real Canvas — replaces the Story 1.1 stub; code review added a distinct error state for thrown exceptions)
- `messages/fr.json` (added `RoomView.notFoundTitle`, `notFoundBody`; code review added `errorTitle`, `errorBody`)
- `src/lib/rooms/get-room-by-slug.ts` (code review: dropped `row`/`col` from `RoomDetailPiece`, added per-entry signed-URL error filtering)
- `src/components/canvas/room-canvas.tsx` (code review: dynamic content-span calculation, `usePieceImage` loading/loaded/error tri-state)

**Removed:**
- `src/components/canvas/canvas-smoke-test.tsx`, `src/components/canvas/canvas-smoke-test-loader.tsx` (Story 1.1 smoke test, superseded by `room-canvas.tsx`, no other references remained)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-20 | Story implemented: public Room lookup, Guest-accessible route, real Canvas (Frame + scattered pieces), Storage read access for Guests (AC #1–#3) |
| 2026-08-21 | Code review: 5 patches applied (including removing a puzzle-solution data leak), 3 items deferred to `deferred-work.md`. Status → done. |
