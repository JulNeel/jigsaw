---
baseline_commit: NO_VCS
---

# Story 3.11: Instant client-side placement prediction

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Participant placing or fusing a piece,
I want to know immediately and reliably whether my drop worked,
so that the Frame/Cluster feedback (Story 3.6) never has to snap into place and then bounce back once the server disagrees.

## Acceptance Criteria

1. Given a piece (or Cluster) dropped near a Frame slot, when the client evaluates the drop locally — using the same pure validation logic the Server Action itself uses (`validatePieceOrientationAndShape`/`validatePlacementNeighbors`/`canBootstrapWithoutNeighbor`/`overlapsAnyFreePiece`, imported verbatim) against each piece's `gridRow`/`gridCol` now included in the Room's client payload, plus a new pure `true-neighbors.ts` derivation (see amendment below) — then a predicted-valid drop animates directly and confidently into its final position: no optimistic snap followed by a visible bounce-back for the common case. (A drop brought into genuine contact away from the Frame — a fusion — never needed this treatment at all: verified during implementation that the anchor-recovery math already reproduces the dropped piece's exact position whether or not the fuse succeeds, so there was never a bounce-back to fix there in the first place; `findContactCandidates`/`validateFusion` stay server-only.)
2. A predicted-invalid drop (shape/edges don't genuinely match, nothing to test against yet per the corner-only bootstrap rule, or it would bury a loose piece) visibly rests exactly at the drop point immediately, without ever snapping toward a slot or fusion it was never going to keep.
3. The server remains the sole and unconditional authority for the actual write in every case (AD-2, NFR6 unchanged) — this story only extends what the client is allowed to *know* ahead of time, never what it's allowed to *decide*. **Amendment (2026-09-02, code review):** enforced structurally, not just by convention — `placePiece` is always called whenever a drop lands near a Frame slot, regardless of what `predictFrameLock` returned; the prediction only ever controls a local, purely-visual render override (never which Server Action fires). An earlier version of this story gated the Server Action choice itself on the client's prediction, which would have let a false-negative prediction silently prevent a genuinely valid placement from ever reaching the server — caught by the Acceptance Auditor layer of this story's own code review before shipping.
4. On the rare occasion the client's prediction was correct but a genuine concurrent write beat it to the same slot/edge server-side, the rejection is presented as an in-fiction, factual-but-warm moment (Voice and Tone, UX-DR16 — e.g. "Un autre Participant vient de la poser juste avant vous"), never a technical error message, and the piece settles at the last confirmed position rather than disappearing (NFR1).

## User-confirmed scope decisions (2026-09-02)

- **Deliberate, explicit relaxation of NFR6's data-secrecy implication, not a security fix.** NFR6 was written assuming a client should never see enough to reconstruct the puzzle's solution (anti-cheat). Revisited for this product's family/collaborative context: a Participant reading the network tab to see grid positions is an accepted, non-concerning outcome — a conscious product call. What NFR6 actually protects — the server as sole authority for every write, no client-side bypass of real validation (AD-2) — is fully preserved; only the *visibility* of previously-withheld data changes. See epics.md's Story 3.11 note for the full record.
- **Ship `gridRow`/`gridCol`, not a separate adjacency edge list.** `src/lib/piece-cutting/compute-adjacency.ts` proves true-neighbor ⟺ plain orthogonal grid adjacency for this app's cutting algorithm, with zero exceptions (no scrambling, no "looks adjacent but isn't" case) — so the client never needs `piece_adjacency` itself, only each piece's `gridRow`/`gridCol`, to derive an identical result locally. A regression test (Task 2) pins this equivalence down so a future change to the cutting algorithm can't silently break client/server agreement without a failing test surfacing it first.
- **This data is already technically reachable today, RLS-wise — this story only formalizes intended access.** `piece.grid_row`/`grid_col` and `piece_adjacency` both already carry a `for select using (true)` RLS policy (`supabase/migrations/20260814000000_rooms.sql`) — a sufficiently curious Participant could already query them directly via the Supabase JS SDK and the public anon key, bypassing `getRoomBySlug`'s deliberate omission entirely. This story doesn't "unlock" new access so much as it stops relying on obscurity that was never actually enforced at the data layer.
- **Use shadcn's Toast, per this project's own UX doc — not yet actually installed.** `EXPERIENCE.md`'s State Patterns table already calls for "Toast shadcn" for transient messages (offline/reconnect, link-copied) — but no toast component exists in `src/components/ui/` yet, and the existing "Lien copié" moment (`create-room-form.tsx`) is actually just an inline label swap, not a real toast. This story is the first to introduce it for real. **Adding it pulls in a new dependency** (shadcn's Toast primitive, typically backed by `sonner` or Radix `Toast`) — flag this to the user for approval before installing, per this workflow's own dependency-approval gate, rather than assuming it's pre-cleared.
- **The narrative copy is a placeholder, not final.** "Un autre Participant vient de la poser juste avant vous" follows the factual-but-warm register (UX-DR16) rather than the more playful "Player B beat you to it!" phrasing floated during scoping — adjust wording freely as long as it stays factual/warm, never gamified, never a raw error code.

## Tasks / Subtasks

- [x] Task 1: Expose each piece's true grid position to the client (AC: #1, #3)
  - [x] `src/lib/rooms/get-room-by-slug.ts`: added `grid_row`, `grid_col` to the `piece` SELECT and to `RoomDetailPiece` as `gridRow`/`gridCol`. Replaced the old "deliberately does NOT include grid_row/grid_col" comment with one explaining the reversal, referencing this story.
  - [x] `src/lib/db/collections.ts`: `pieceHandler`'s Realtime row → `RoomDetailPiece` mapping now also carries `gridRow`/`gridCol`.
- [x] Task 2: Pure, grid-position-based true-neighbor derivation, shared and client-safe (AC: #1)
  - [x] New `src/lib/validation/true-neighbors.ts` — `computeTrueNeighborsByDirection`/`computeTrueNeighborIds`, pure, no Postgres/`server-only` import.
  - [x] `true-neighbors.test.ts`: equivalence test against `compute-adjacency.ts`'s pairs for a 4×5 grid, plus edge cases (1×1 grid, unknown piece id, per-direction assignment).
- [x] Task 3: Predict before the optimistic mutation (AC: #1, #2)
  - [x] New `src/lib/validation/predict-frame-lock.ts` — `predictFrameLock(...)`, replicating `placePiece`'s own cascade (bounds → exact-slot-occupied → overlap-with-free-piece → orientation/shape → bootstrap-or-neighbor), reusing `validatePieceOrientationAndShape`/`validatePlacementNeighbors`/`canBootstrapWithoutNeighbor`/`overlapsAnyFreePiece`/`computeTrueNeighborsByDirection` verbatim.
  - [x] `room-canvas.tsx`: `SoloPieceSprite.handleDragEnd` and `ClusterGroupSprite.handleDragEnd` both call `predictFrameLock` before `collection.update(...)`; predicted-valid keeps the confident optimistic snap, predicted-invalid updates only `scatterX`/`scatterY`.
  - [x] `predict-frame-lock.test.ts`: 9 tests covering corner bootstrap, interior-without-neighbor rejection, true-neighbor-in-correct-direction acceptance, wrong-direction/imposter rejection, out-of-bounds, exact-slot-occupied, burial-overlap, shape mismatch, rotation rejection.
- [x] Task 4: Narrative surface for a genuine predicted-valid-but-server-disagreed conflict (AC: #4)
  - [x] `placePiece`'s success result now carries `placed: boolean` (`true` only on the real lock-in branch, `false` on every `restWithoutLocking()` branch) — `movePiece`/`rotatePiece`'s result shape untouched.
  - [x] `collections.ts`'s `onUpdate`: when `changes.placedRow != null` (client predicted a lock) and `result.placed === false`, calls `emitPlacementConflict()` (new `src/lib/rooms/placement-conflict-events.ts`, a tiny module-level pub-sub, same idiom as `use-sound-muted.ts`).
  - [x] Installed shadcn's Toast primitive (`pnpm dlx shadcn add sonner`, user-approved) — stripped its generated `next-themes` wiring since this app has no theme toggle (single fixed brand palette); `<Toaster />` mounted once in `src/app/layout.tsx`.
  - [x] `room-canvas.tsx` subscribes to `subscribePlacementConflict`, calling `toast(...)` and echoing the same message through the existing Story 3.6 `aria-live="polite"` region.
- [x] Task 5: Regression check
  - [x] `pnpm build`/`pnpm lint` clean.
  - [x] `pnpm test` — 161 tests pass across 22 files (was 147/20); all pre-existing `validate-placement`/`validate-fusion`/`validate-overlap` tests untouched and still green; 14 new tests added (5 `true-neighbors`, 9 `predict-frame-lock`).
  - [x] **Limitation, documented honestly (same as every story since 1.4):** no headless browser available — the actual "drop confidently snaps, no bounce-back" feel, and the genuinely-concurrent toast, can't be visually verified here. Recommend the user open the same Room in two browser sessions and race a placement between them to confirm the toast appears only on the losing side, with the correct settle-to-last-confirmed-position behavior (NFR1).

### Review Findings

- [x] [Review][Patch] Client-side prediction gates which Server Action is called, silently skipping `placePiece` on a predicted-invalid drop — violates AC #3's "never what it's allowed to decide" [src/components/canvas/room-canvas.tsx, src/lib/db/collections.ts]
- [x] [Review][Patch] `predict-frame-lock.ts`'s non-null assertions (`t.known!`, `knownById.get(...)!`) rely on an earlier loop's guard holding across separately-derived arrays — safe today, fragile to a future refactor [src/lib/validation/predict-frame-lock.ts]
- [x] [Review][Patch] AC #1's wording overclaims scope: lists `findContactCandidates`/`validateFusion` as used (they aren't — fusion never needed prediction, see Dev Notes) and its "never a separately-maintained reimplementation" phrase sits in tension with `true-neighbors.ts`'s necessarily-new derivation — clarify the story's own AC/Dev Notes text, not app code [_bmad-output/implementation-artifacts/3-11-instant-client-side-placement-prediction.md]
- [x] [Review][Defer] `justPlacedIds` placement-pulse effect can cancel its own pending timeout without replacing it if an unrelated Realtime update arrives mid-pulse, leaving a stuck pulse rect — pre-existing since Story 3.6, not touched by 3.11 [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] `ClusterGroupSprite`'s `optimisticAnchor` has no rollback path if the drag-end mutation is rejected — pre-existing since Story 3.8/3.9 [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] `awaitVersion`'s 15s timeout can falsely "un-place" a piece whose write actually succeeded but whose Realtime confirmation was delayed/dropped — pre-existing since Story 3.5 [src/lib/db/collections.ts]
- [x] [Review][Defer] `piece-actions.ts`'s transactional/locking logic (pre-existing, not the new `placed` field lines) and `collections.ts`'s `awaitVersion`/channel-refcounting have no unit tests — consistent with this codebase's existing DB-integration-file convention (`get-room-by-slug.ts` is the same), not a 3.11-specific gap [src/lib/rooms/piece-actions.ts, src/lib/db/collections.ts]
- [x] [Review][Defer] Placement pulse's hardcoded `#A8541F` duplicates the Frame border's own hardcoded stroke color with no shared source of truth — pre-existing since Story 3.6 [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] `pieceRenderPosition`'s comment claims its three branches are mutually exclusive, but a piece with a `clusterId` not yet matched by a loaded `Cluster` row falls through to stale `scatterX`/`scatterY` rather than being excluded — pre-existing since Story 3.8 [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] Placement sound/haptic/`aria-live` fire on the optimistic snapshot, before server confirmation — on the rare genuine conflict (Task 4), feedback for a lock that gets rolled back has already played with no way to un-play it; architectural tension between Story 3.6's "instant feedback" goal and correctness, not fixable without delaying all feedback until confirmation — pre-existing since Story 3.6 [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] `repositionOrFuse`'s post-re-lock re-verification query (`touchedResult`) — pre-existing since Story 3.5/3.8's patch rounds, not touched by 3.11 [src/lib/rooms/piece-actions.ts]
- [x] [Review][Defer] A Realtime `INSERT` for a piece id absent from `initialPieces` permanently renders `imageUrl: null` (only ever sourced from the initial snapshot) — pre-existing since Story 3.1 [src/lib/db/collections.ts]

## Dev Notes

### Why this isn't "just a client change" — one small, additive server touch is required

Story 3.6's dev notes established a precedent of purely client-side stories; this one very nearly is, but Task 4 needs `placePiece` to report whether it actually locked the piece in, not just that the write succeeded (see Task 4's first bullet for the exact reasoning). This is the one place this story touches `piece-actions.ts` — everything else is additive, and `movePiece`/`rotatePiece`'s contracts are untouched.

### The core insight this story is built on

`src/lib/piece-cutting/compute-adjacency.ts` generates `piece_adjacency` at Room-creation time from nothing but orthogonal grid deltas (`row+1`/`col+1` neighbors) — there is no independent "looks adjacent but isn't" case in this app's design. That means `gridRow`/`gridCol` alone is sufficient for the client to derive everything `validatePlacementNeighbors`/`validateFusion` need; there's no reason to also ship the `piece_adjacency` table's rows. Task 2's regression test is what keeps this assumption honest if the cutting algorithm ever changes.

### What must be preserved

- `src/lib/validation/validate-placement.ts`, `validate-overlap.ts` are already pure, framework-agnostic, and carry no `server-only`/Postgres import — reuse them verbatim client-side. Do not fork or reimplement their logic; a client-only copy is exactly the "two sources of truth that drift" risk this story exists to avoid. **One deliberate, acknowledged exception:** `true-neighbors.ts`'s neighbor derivation *is* new code, not a reused function — the server computes "who's whose true neighbor" via a SQL join against the `piece_adjacency` table, which has no pure equivalent to import. This is safe specifically because `compute-adjacency.ts` proves the two are mathematically equivalent (see above) — the regression test is what makes this an accepted exception to "never a separately-maintained reimplementation" rather than a violation of it.
- `placePiece`'s actual authority is unchanged: it still independently re-validates and re-locks (or doesn't) inside its own Postgres transaction regardless of what the client predicted — and, as of the 2026-09-02 code review fix, `placePiece` is *always invoked* for a Frame-slot drop regardless of that prediction, never only on a predicted-valid one. The client's prediction is read-only decoration on top of an unmodified authoritative path (AD-2, AC #3).
- AD-6's existing optimistic-concurrency/rollback machinery (`STALE_WRITE`, `awaitVersion`, silent-abandon-on-throw) is not being replaced — Task 4 adds a *narrower* narrative layer only for the specific "predicted valid, server said no" case; every other rejection path (predicted-invalid, actual `STALE_WRITE` on `movePiece`/`rotatePiece`) keeps behaving exactly as today.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.11: Instant client-side placement prediction] — canonical AC text and the NFR6 relaxation note.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#AD-2 — Serveur autoritaire pour toute écriture] — "le client peut prédire optimistiquement le résultat mais ne fait jamais autorité" — this story is the first to actually give the client enough data to predict *correctly*, not just optimistically guess.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#State Patterns] — "Toast shadcn" precedent for transient messages (offline/reconnect, link copied) — reuse that established pattern for AC #4, don't invent a new mechanism.
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR16] — factual-but-warm Voice and Tone register for the AC #4 message.

## Previous Story Intelligence (from Story 3.5/3.6/3.8/3.9)

- Story 3.6 established the `aria-live="polite"` region in `room-canvas.tsx` and the `useSoundMuted`-style `useSyncExternalStore` idiom for client-only state — reuse both rather than inventing parallel mechanisms.
- Story 3.5/3.8's Dev Notes already document `placePiece`/`repositionOrFuse`'s exact branching (`restWithoutLocking`, the two-pass lock-then-reverify TOCTOU-closing pattern) — read `piece-actions.ts` in full before touching Task 4's `placed` field, since the "locked" vs. "repositioned" distinction has several branches (`restWithoutLocking()`'s own call sites) that all need to report `placed: false` consistently.
- This codebase's established pattern for "read a browser-only API once, expose via a hook" (`usePieceImage`, `useSoundMuted`) — no new pattern needed for anything in this story.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via Claude Code.

### Debug Log References

None — every step passed on the first implementation attempt (lint, build, and test all clean each time they were run).

### Completion Notes List

- Fusion (`repositionOrFuse`) needed no client-side prediction work: the dragged member's own reported position is exactly reproduced by the server's anchor-recovery math whether or not a fuse actually happens (Story 3.8/3.9's "any member works as the one reported" math), so there was never a bounce-back to fix there — only the Frame-lock path (which snaps to the slot's *center*, a different point than the drop point) had the bug. Confirmed this reasoning before writing any fusion-prediction code, to avoid building an unneeded feature.
- Asked the user for approval before installing `sonner` (Task 4's Toast dependency), per the story's own scope decision and this workflow's dependency-approval gate — approved, installed via `pnpm dlx shadcn add sonner`. Stripped the generated component's `next-themes` wiring since this app has exactly one fixed brand palette and no theme toggle anywhere — adding that second dependency for a hook with nothing to read would have been dead weight.
- `PieceActionResult`'s new `placed?: boolean` field is `placePiece`-specific; `movePiece`/`rotatePiece` never set it, matching the story's explicit instruction to leave their contracts untouched.
- All acceptance criteria satisfied: AC #1/#2 (confident predicted-valid snap vs. immediate rest-at-drop-point for predicted-invalid) via `predictFrameLock` in both sprite components; AC #3 (server remains sole authority) — `placePiece` is completely unmodified in its own validation/locking logic, only its *return value* gained one new field; AC #4 (genuine-conflict toast) via the `placed:false`-when-predicted-valid signal, `placement-conflict-events.ts`, and the new `Toaster`.
- `pnpm build`/`pnpm lint`/`pnpm test` all clean (161 tests, 22 files). Per Task 5's own documented limitation, the actual "no bounce back" feel and the race-condition toast need manual two-browser-session verification — not verifiable here (no headless browser).
- **Code review (2026-09-02) caught and fixed a real AC #3 violation**: the first implementation had `predictFrameLock`'s result gate *which Server Action* `collections.ts`'s `onUpdate` called (`placePiece` only on predicted-valid, `movePiece` otherwise) — meaning a predicted-invalid drop never gave the server a chance to actually validate it at all. Fixed by always setting `placedRow`/`placedCol` (so `placePiece` is always invoked for a Frame-slot drop, regardless of prediction) and moving the prediction to gate only a new local `pendingRestOverride` render state in `SoloPieceSprite` (keeping the piece visually at the drop point until confirmed, instead of the optimistic field itself). Discovered that `ClusterGroupSprite` never needed an analogous render override at all — a Cluster's `<Group>` renders from `cluster.anchorX/Y`/`optimisticAnchor`, never from `placedRow`, and a member stays classified as "clustered" (not solo) until the real Realtime-confirmed row arrives — so `predictFrameLock`'s result was already unused dead weight there once the dispatch bug was fixed; removed the now-unused `pieces`/`clustersById` props from that component entirely. Also tightened `predict-frame-lock.ts` to resolve every member's known piece through one `resolveTargets` helper instead of scattered non-null assertions, and clarified this story's own AC #1/AC #3/Dev Notes wording (fusion never needed prediction; `true-neighbors.ts` is a deliberate, tested exception to the "never a separately-maintained reimplementation" rule, not a violation of it).

### File List

- `src/lib/validation/true-neighbors.ts` (new)
- `src/lib/validation/true-neighbors.test.ts` (new)
- `src/lib/validation/predict-frame-lock.ts` (new)
- `src/lib/validation/predict-frame-lock.test.ts` (new)
- `src/lib/rooms/placement-conflict-events.ts` (new)
- `src/components/ui/sonner.tsx` (new, via shadcn CLI, `next-themes` wiring stripped)
- `src/lib/rooms/get-room-by-slug.ts` (modified: `RoomDetailPiece.gridRow`/`gridCol`)
- `src/lib/db/collections.ts` (modified: Realtime row mapping carries `gridRow`/`gridCol`; `onUpdate` emits placement-conflict events)
- `src/lib/rooms/piece-actions.ts` (modified: `PieceActionResult.placed?: boolean`, set on every `placePiece` success path)
- `src/components/canvas/room-canvas.tsx` (modified: client-side prediction in both drag-end handlers, placement-conflict subscription + toast + `aria-live` echo)
- `src/app/layout.tsx` (modified: mounts `<Toaster />`)
- `messages/fr.json` (modified: `Canvas.placementConflictMessage`)
- `package.json`/`pnpm-lock.yaml` (modified: added `sonner`)

## Change Log

| Date | Change |
|------|--------|
| 2026-09-02 | Implemented Story 3.11 (Instant client-side placement prediction): exposed `gridRow`/`gridCol` to the client, added a pure grid-adjacency-based true-neighbor derivation with a regression test pinning its equivalence to the server's `piece_adjacency` generation, client-side prediction of `placePiece`'s lock-in decision before the optimistic mutation (no more snap-then-bounce-back for the common case), a `placed:boolean` server signal distinguishing an ordinary non-lock from a genuine concurrent conflict, and a Toast + `aria-live` narrative surface for that rare conflict case. No change to `placePiece`'s actual validation/locking authority (AD-2, NFR6 unchanged). |
| 2026-09-02 | Code review (Acceptance Auditor) found and fixed a real AC #3 violation: client prediction was gating which Server Action got called, letting a false-negative prediction silently skip `placePiece` entirely. Fixed with a local render-only override (`SoloPieceSprite`'s `pendingRestOverride`) decoupled from which action fires; `placePiece` is now always invoked for a Frame-slot drop. Removed now-dead prediction code from `ClusterGroupSprite` (never needed it — a Cluster's rendering doesn't key off `placedRow`). Tightened `predict-frame-lock.ts`'s type-safety (`resolveTargets` helper replacing scattered non-null assertions) and clarified AC #1/#3/Dev Notes wording. 8 other findings (pre-existing, from Stories 3.1/3.5/3.6/3.8/3.9, none touched by this story) deferred to `deferred-work.md`; several more dismissed as noise from reviewing a mixed, never-committed diff or as already-decided/documented tradeoffs. |
