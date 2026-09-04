baseline_commit: NO_VCS

# Story 3.10: Work on multiple Clusters in parallel

Status: done

## Story

As a Participant among several people in the same Room,
I want to build my own Cluster while others build theirs at the same time,
so that the Room feels like a real shared table, not a turn-based tool.

## Acceptance Criteria

1. **Given** several Participants active in the same Room, **when** each starts forming or moving a *different* Cluster, **then** all Clusters coexist and update independently, with no exclusive lock preventing parallel work.
2. **Given** two Participants act on the *very same* Cluster at once, **when** the server resolves the conflict via optimistic concurrency (a stale write rejected as `STALE_WRITE`, per AD-6), **then** the losing client's optimistic move visibly transitions back to the last confirmed position — never staying stuck at the rejected guess, and never disappearing (NFR1).

**Note — scope decision (2026-09-04), confirmed with the user before this story was written:** the epics.md AC "each actively-manipulated Cluster shows the manipulating Participant's avatar chip" is **removed from this story's scope**. No Participant identity/presence concept exists anywhere in this codebase yet (`grep`-confirmed: no `RoomParticipant`, no presence table, no avatar anywhere in `src/`) — that's Epic 4's "Live presence" (Story 4.1, still backlog) territory. Building a one-off identity/avatar mechanism just for this story would duplicate work Epic 4 will do properly; the avatar chip should be added naturally once Epic 4 exists, as a small follow-up touching this same Cluster-rendering code. Everything else in this story stands.

## Tasks / Subtasks

- [x] Task 1: Confirm AC #1 — no exclusive lock blocks parallel, different Clusters (AC: #1)
  - [x] Audit `src/lib/rooms/piece-actions.ts`'s Cluster-touching Server Actions (`loadDraggedGroup`, `repositionOrFuse`, and wherever `movePiece`/`placePiece` lock a Cluster row) — confirm every `select ... for update` locks a *specific* Cluster/piece id (or a specific touched set), never a Room-wide or table-wide lock. This already appears true as of this story's writing (each lock is `where id = $1` or `where id = any($1::uuid[])`, scoped to the specific rows involved) — this task is a verification, not expected to require a code change, but do not skip it: confirm by reading the current code, don't assume based on this note.
  - [x] Confirm no *client-side* global gate exists either (e.g. a single shared "a Cluster is being dragged" flag disabling other drags) — `room-canvas.tsx`'s `draggingKey` is local React state per browser tab, not shared across Participants; confirm this is still true.
  - [x] Manual verification (two browser sessions/tabs in the same Room): start dragging two *different* Clusters simultaneously (one per tab) — both should move independently and lock in/fuse normally, with no visible interference. **Not independently verified in this environment (no browser tooling available) — needs the user's own check, see Completion Notes.**

- [x] Task 2: Fix `ClusterGroupSprite`'s `optimisticAnchor` getting permanently stuck after a rejected move (AC: #2)
  - [x] **Confirmed real, reproducible bug** (diagnosed during story creation, not yet fixed): `src/components/canvas/room-canvas.tsx`'s `ClusterGroupSprite` (currently ~line 728-734) clears its `optimisticAnchor` guess only once `cluster.version` advances past the version captured at drag-start (`sinceVersion`). But a **rejected** write (`STALE_WRITE`) never bumps `cluster.version` at all — nothing committed server-side, so the confirmed version stays exactly what it was. This means the guard `cluster.version <= optimisticAnchor.sinceVersion` remains true *forever* after a rejection, and the Cluster stays visually stuck at the losing client's stale optimistic position indefinitely — directly contradicting AC #2's "visibly transitions back to the last confirmed position." This is the exact same class of bug `SoloPieceSprite`'s `pendingRestOverride` already hit and fixed (see its own comment, ~line 430-435: "a hard Server Action failure... rolls the entire optimistic mutation back... without ever bumping `version`... the version-only condition alone would leave this override stuck forever").
  - [x] Fix using the same technique `pendingRestOverride` uses — add a second, non-version condition to `optimisticAnchor`'s guard that also flips when the underlying mutation actually rolls back. `pendingRestOverride` uses `piece.placedRow != null` (a field that cleanly reverts to its pre-attempt `null` state on rollback) — Cluster moves don't have an equally clean null/non-null field, since `scatterX`/`scatterY` always hold *some* value before and after. The equivalent signal here: capture the *expected* representative-member `scatterX`/`scatterY` (the value the optimistic mutation set) alongside `sinceVersion` in `optimisticAnchor`'s own state, and additionally require that the *live* `representativeMember.scatterX`/`scatterY` still matches that expected value. On a rollback, TanStack DB reverts `representativeMember.scatterX`/`scatterY` back to its pre-drag value — breaking that equality — which is the moment to stop trusting `optimisticAnchor` and fall back to `{ cluster.anchorX, cluster.anchorY }`, exactly like `pendingRestOverride` falls back to `confirmedX`/`confirmedY` the moment `piece.placedRow` reverts to `null`. Read `handleDragEnd`'s two branches (slot-found lock/fuse path vs. free-move path) carefully — they optimistically touch different fields, and the fix must cover whichever one actually applies to a plain "move this Cluster elsewhere" drag (the scenario AC #2 describes), not assume only one exists.
  - [x] Unit test is not expected here (this is UI-state logic inside a component, and this codebase has no component-testing infrastructure — see Previous Story Intelligence). Verify manually instead (next task).
  - [x] Manual verification (two browser sessions on the *same* Cluster): both drag the same Cluster to different spots at nearly the same time; confirm the losing client's Cluster visibly snaps back to the winner's confirmed position shortly after, rather than staying stuck at the loser's own dropped position or disappearing. **Not independently verified in this environment (no browser tooling available) — needs the user's own check, see Completion Notes.**

- [x] Task 3: Regression + final check (AC: all)
  - [x] `pnpm build && pnpm lint && pnpm test` clean.
  - [x] Re-run Story 3.9's own manual verification steps (single-Cluster drag, fuse-in, lock-into-Frame) to confirm Task 2's fix didn't change behavior for the ordinary (non-conflicting) case. **Not independently verified in this environment (no browser tooling available) — needs the user's own check, see Completion Notes.**

## Dev Notes

### Why this story is mostly a fix, not new construction

Story 3.9's own Dev Notes explicitly deferred exactly this: *"Not covered (left for Story 3.10, still backlog): per-Participant avatar chips on an actively-manipulated Cluster, and any behavior specific to concurrent multi-Participant Cluster manipulation beyond the existing optimistic-concurrency/`STALE_WRITE` handling (AD-6) already in place for every Piece/Cluster mutation."* Per-Cluster row locking (`piece-actions.ts`) already means two *different* Clusters never contend — AC #1 is close to already-true and mostly needs confirming, not building. The one concrete gap found while writing this story is Task 2's bug — a real, diagnosed defect in the *same-Cluster conflict* visual-revert path, not a hypothetical.

### Current state of the file being modified

`src/components/canvas/room-canvas.tsx`'s `ClusterGroupSprite` (as of this story's creation):
- `optimisticAnchor` (~line 728): `{ x, y, sinceVersion } | null`, set in `handleDragEnd` to the just-dropped Group anchor plus the `cluster.version` seen at that moment.
- `anchor` (~line 731-734): picks `optimisticAnchor` over `{ cluster.anchorX, cluster.anchorY }` while `cluster.version <= optimisticAnchor.sinceVersion` — this is the condition Task 2 must extend.
- `handleDragEnd` (~line 736 onward): computes `dropPoint` from the representative member's offset, then either locks into a Frame slot (if `nearestFrameSlot` finds one) or calls `collection.update(representativeMember.id, draft => { draft.scatterX = dropPoint.x; draft.scatterY = dropPoint.y; })` for a plain free move.

`SoloPieceSprite`'s `pendingRestOverride` (~line 427-441) is the direct precedent to mirror — read its full comment before implementing Task 2, it explains exactly why a version-only guard is insufficient and what class of fix closes the gap.

### Architecture compliance

- No Server Action, schema, or migration changes expected — Task 2's fix is purely client-side rendering-state logic (which optimistic guess to trust and when to stop trusting it), same category as `pendingRestOverride`'s own fix.
- AD-6 (optimistic concurrency via `version`) is not changed, only correctly *reacted to* on the client — the server-side `STALE_WRITE` rejection behavior itself is already correct and untouched.

### Testing standards summary

No new automated test is expected for Task 2 (client-side Konva component state, no component-testing infrastructure in this repo — see below). Rely on manual two-browser-session verification, consistent with how Story 3.7/3.9's own "cross-Participant" behaviors were verified.

## Previous Story Intelligence (from Story 3.9)

- 3.9 introduced `optimisticAnchor` and its version-only guard — this story is the direct continuation closing the gap 3.9 itself flagged as deferred.
- 3.9's own review found and fixed the "representative member must be a stable, deterministic choice (lexicographically lowest id), not `members[0]`" bug — already fixed, not relevant to this story's own change, but confirms `representativeMember`'s selection logic (used again in Task 2's fix) is already reliable across renders.
- No dedicated component-testing infrastructure (React Testing Library/jsdom) exists in this repo — a gap noted as deferred since Story 2.2's review, still true. This story's fix doesn't need it either; manual verification is the established path for this class of change.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.10] — original AC text (avatar AC removed here per the scope decision above).
- [Source: _bmad-output/implementation-artifacts/3-9-move-a-cluster-as-a-block.md] — explicitly defers this story's scope.
- [Source: src/components/canvas/room-canvas.tsx#ClusterGroupSprite, #SoloPieceSprite] — both components this story reads/modifies.
- [Source: src/lib/rooms/piece-actions.ts] — Cluster row-locking to audit for Task 1.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via Claude Code.

### Debug Log References

None — every step passed cleanly (build/lint/test all green).

### Completion Notes List

- **AC #1 confirmed structurally satisfied, no code change needed.** Every `for update` lock in `piece-actions.ts` is scoped to a specific piece/Cluster id or an explicit set of touched ids (`where id = $1`, `where cluster_id = $1`, `where id = any($1::uuid[])`) — none lock the whole table or Room. `room-canvas.tsx`'s `draggingKey` (gating Stage panning during a drag) is local `useState` inside `RoomCanvas`, per browser tab, never shared. Two different Clusters manipulated by two different Participants at once were already architecturally independent before this story.
- **AC #2's real bug fixed.** `ClusterGroupSprite`'s `optimisticAnchor` now also requires `representativeMember.scatterX`/`scatterY` to still match the exact value `handleDragEnd` set them to (`expectedScatterX`/`expectedScatterY`, captured alongside `sinceVersion`) before trusting the optimistic guess over the confirmed `cluster.anchorX/Y`. A rejected write rolls those fields back to their pre-drag value via TanStack DB's own rollback, which now immediately breaks the match and falls back to the last confirmed position — mirroring `SoloPieceSprite`'s `pendingRestOverride` fix exactly, adapted for a field pair with no clean null/non-null state.
- `dropPoint` (previously computed after `setOptimisticAnchor`) is now computed first, so its value can be captured into `optimisticAnchor` in the same call — a pure reordering, no behavior change to `dropPoint` itself.
- `pnpm build`/`pnpm lint`/`pnpm test` all clean (203 tests, 26 files — unchanged count, this story added no new automated tests per its own Dev Notes: no component-testing infrastructure exists in this repo, and this is UI-state logic inside a Konva component).
- **Not verified in this environment: the actual multi-Participant behavior.** This session has no browser/screenshot tooling, so none of this story's three manual-verification subtasks (two different Clusters dragged in parallel; two Participants racing on the *same* Cluster, confirming the loser now visibly reverts instead of sticking; Story 3.9's own regression checks) were performed here. **Please verify locally, ideally with two browser tabs/sessions in the same Room**: (1) drag two different Clusters at once — both should move independently with no interference (expected: already worked before this story); (2) drag the *same* Cluster from both tabs at nearly the same moment — the losing tab's Cluster should now visibly snap back to the winning tab's confirmed position shortly after, not stay stuck at the loser's own dropped spot; (3) a normal, uncontested Cluster drag/fuse/lock-into-Frame still behaves exactly as before (regression check on Task 2's change).
- **Held at `in-progress`, not `review` (2026-09-04, user instruction): manual multi-Participant verification needs two independent real clients, which realistically means testing against a deployment, not local dev alone.** All tasks/subtasks are otherwise complete and `pnpm build`/`pnpm lint`/`pnpm test` are clean — this is a deliberate hold for a deploy-then-verify step, not unfinished work.
- **User confirmed all manual verification steps pass (2026-09-04)**, after resolving an unrelated deployment issue (`DATABASE_URL` pointing at a DNS name that doesn't resolve from Vercel's network — fixed by switching to Supabase's Session pooler connection string) and a separately-reported/fixed pinch-to-zoom bug on Firefox for Android (Story 3.3, not this story — see its own Change Log). Story closed.

### File List

- `src/components/canvas/room-canvas.tsx` (modified — `ClusterGroupSprite`'s `optimisticAnchor` state gains `expectedScatterX`/`expectedScatterY`; its guard condition also checks `representativeMember.scatterX`/`scatterY` against those expected values; `dropPoint` computation reordered above the `setOptimisticAnchor` call)

## Change Log

| Date | Change |
|------|--------|
| 2026-09-04 | Story created: confirm parallel-Cluster manipulation has no exclusive lock (AC #1), fix a diagnosed real bug where a rejected same-Cluster move leaves the losing client's `optimisticAnchor` permanently stuck instead of reverting (AC #2). Avatar-chip AC removed from scope per user decision — no Participant identity/presence system exists yet (Epic 4, not started). |
| 2026-09-04 | User confirmed all manual verification steps pass on the deployed environment. Story closed. |
