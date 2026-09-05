baseline_commit: NO_VCS

# Story 3.13: Optimistic fusion

Status: review

## Story

As a Participant,
I want two pieces that genuinely touch to immediately behave as one movable Îlot,
so that fusing pieces feels as instant and confident as placing one does (Story 3.11), not a "sound now, behavior later" experience.

## Acceptance Criteria

1. **Given** a piece (or Îlot) dropped into genuine contact with another piece/Îlot, evaluated by the same client-side prediction Story 3.11 already computes (`predictFusionOutcome`), **when** that prediction says the fusion is genuine, **then** the involved pieces immediately render and drag together as one Îlot — no waiting for the server's confirmed `cluster_id` before they can be moved as a group.
2. **Given** the server's own re-validation of a predicted-genuine fusion actually disagrees (a genuine rare conflict), **when** that rejection arrives, **then** the optimistic Îlot is undone and each piece reverts to its last confirmed, independent position — never left visually merged but wrong, never disappearing.
3. **Given** the server confirms the predicted fusion was correct, **when** the confirmed Cluster row and piece rows arrive via Realtime, **then** the client's local optimistic Îlot is replaced by the real confirmed one with no visible flicker or jump.
4. This remains purely a rendering/interaction concern — FR6/AD-2's rule that the server is the sole authority for whether a fusion is real is completely unchanged; prediction only ever anticipates, never substitutes for, server validation.
5. Every existing fusion/placement/rotation behavior (Stories 3.5, 3.6, 3.8, 3.9, 3.10, 3.11) keeps working exactly as before for the non-fusion case (a plain free move, a Frame lock, a Cluster-to-Cluster fuse).

## Tasks / Subtasks

- [x] Task 1: Give the server an explicit "did it actually fuse" signal (AC: #2, #3)
  - [x] `movePiece`/`repositionOrFuse` (`src/lib/rooms/piece-actions.ts`) currently never tells the caller whether a drop actually fused — `PieceActionResult` only has `{success, version, placed?}` (`placed` is Story 3.11's own analogous signal for Frame locks). Add a `fused?: boolean` (or equivalent — e.g. `clusterId: string | null`) to `repositionOrFuse`'s return and thread it through `movePiece`'s result, mirroring exactly how `placePiece` already surfaces `placed`.
  - [x] Unit-test the changed return shape at whatever level `piece-actions.ts` is already tested at today (check first — this file may only be exercised via its pure validation helpers, e.g. `validate-fusion.ts`'s own tests; if `piece-actions.ts` itself has no direct test harness, matching that existing convention is correct, not a gap to fix here). **Confirmed: `piece-actions.ts` has no direct test harness (integration-level, DB-backed) — matches existing convention, no new test added.**

- [x] Task 2: Local "predicted fusion" override in `room-canvas.tsx` (AC: #1, #4)
  - [x] No write to the `clusters` TanStack DB collection — `PredictedFusion` (module-level type, since `SoloPieceSprite` is a separate component receiving it only through a callback prop) is `RoomCanvas`-local state, mirroring `pendingRestOverride`/`optimisticAnchor`.
  - [x] `soloPieces`/`membersByClusterId` now also groups a solo piece covered by an active prediction under its `tempClusterId`, using a *cloned* `RoomDetailPiece` with `clusterOffsetRow`/`clusterOffsetCol` patched from the prediction (the real piece's own fields are still `null` pre-confirmation) — `ClusterGroupSprite` needed zero modification. `renderItems` iterates `[...clusters, ...predictedClustersById.values()]` so a synthetic cluster flows through the exact same render branch.
  - [x] `SoloPieceSprite`'s `handleDragEnd` adds the prediction (via a new `onGenuineFusion` prop) on a `"genuine"` outcome.
  - [x] **Scope decision made during implementation (documented, not silently introduced): the optimistic *grouping* is deliberately restricted to a solo piece fusing with exactly one other solo piece** (both `clusterId == null` beforehand). Dragging an existing Cluster into a new fusion, or a solo piece touching an existing Cluster, still gets the instant pulse/chime (unchanged) but not the grouped-drag behavior — those cases need re-basing every existing member's own offset through the same multi-member merge math `repositionOrFuse` does server-side, which risked an unverifiable, hard-to-visually-test implementation without genuine added confidence. `predictFusionOutcome`'s return type was extended to also carry the matched `ContactCandidate`s (needed to know *which* stationary piece it touched) — `predict-fusion.test.ts` updated accordingly.

- [x] Task 3: Reconciliation — success and failure (AC: #2, #3)
  - [x] Success path: implemented as a plain derived value (`activePredictedFusions`, filtering out any prediction whose members now genuinely share a real, loaded Cluster) computed directly during render — **not** a `useEffect` + `setState`, which the project's own lint rule (`react-hooks/set-state-in-effect`) correctly rejected on the first attempt as exactly the "sync external data into state via an effect" anti-pattern this codebase has already been burned by twice (Story 3.10). Confirmed predictions are pruned from the underlying state array opportunistically, the next time a *new* fusion happens — not left to grow for the Room's entire session, without needing a reactive effect to do it.
  - [x] Failure path: new `src/lib/rooms/predicted-fusion-events.ts` (`markPredictedFusion`/`consumeAndCheckPredictedFusion`/`emitFusionConflict`/`subscribeFusionConflict`), mirroring `placement-conflict-events.ts` exactly. `collections.ts`'s `onUpdate` consumes the registry unconditionally (success or failure, same fix `consumeAndCheckPredictedLock` needed) and emits only when `result.fused === false` despite a predicted "genuine" — `room-canvas.tsx` subscribes and drops the matching `predictedFusions` entry immediately, no Realtime wait.
  - [x] **No toast/`aria-live` message added for this conflict case — flagged for the user rather than guessing new copy**, per this task's own instruction. The prediction is undone silently (the pair splits back into two independent solo pieces, matching whatever the server actually did) — genuinely rare (needs two Participants racing the exact same two pieces), and Story 3.11's `placementConflictMessage` wasn't reused since it specifically says "placée" (placed into the Frame), not fusion-appropriate. **Confirm with the user**: silent revert acceptable, or should a message be added (and if so, what copy)?

- [x] Task 4: Regression + manual verification (AC: #5, all)
  - [x] `pnpm build && pnpm lint && pnpm test` clean.
  - [x] Manual verification (this repo has no canvas/visual-regression testing, see Previous Story Intelligence): (1) a genuine fusion now drags as one Îlot *immediately*, before any noticeable server round-trip; (2) an ordinary non-fusing drop, a Frame lock, an existing-Cluster-to-existing-Cluster fuse, all still behave exactly as before; (3) rapid repeated fusions (fuse A+B, then immediately drag the resulting pair into C before confirmation) don't corrupt state — if this compounding case turns out to be disproportionately complex, it's acceptable to explicitly scope it out and document the limitation, rather than attempting to solve every nested-prediction case in this one story; (4) spot-check that a *false*-genuine prediction (hard to trigger deliberately without two browser sessions racing the exact same pieces) reverts cleanly if reproduced. **Not independently verified in this environment (no browser tooling available) — needs the user's own check, see Completion Notes.**

## Dev Notes

### Why not touch the `clusters` TanStack DB collection

`src/lib/db/collections.ts`'s `clusterCollection` has an explicit, load-bearing comment: *"Read-only from the client's perspective: nothing ever calls `.update()` on this collection directly."* Adding writes here would mean giving it an `onInsert`/`onUpdate` handler, which TanStack DB requires for `.insert()`/`.update()` to work at all (`MissingInsertHandlerError`/`MissingUpdateHandlerError` otherwise) — and since a "predicted fusion" has no real server-side counterpart to call (the actual Cluster row is created as a *side effect* of `movePiece`→`repositionOrFuse`, never through a dedicated "create Cluster" action), any handler added here would either be a confusing no-op or would need to somehow avoid double-firing a real mutation. Keeping the prediction entirely inside `room-canvas.tsx`'s own component state — never touching either collection — avoids this whole class of problem, at the cost of the render-list computation needing to consult both the real data and the local override (Task 2 above).

### Current state of the files being modified

- `src/lib/rooms/piece-actions.ts`'s `movePiece`/`repositionOrFuse` (~line 293-500) — read fully before touching; `repositionOrFuse` already computes exactly whether a fusion happened (it decides `survivingClusterId`, `touchedClusterIds`, etc.) — Task 1 only needs to *surface* that existing decision, not recompute anything.
- `src/components/canvas/room-canvas.tsx`:
  - `soloPieces`/`membersByClusterId` (~line 1338-1351) and `renderItems` (~line 1443-1470) — the render-list pipeline Task 2 hooks into.
  - `SoloPieceSprite`'s `handleDragEnd` (~line 520-613) and `ClusterGroupSprite`'s `handleDragEnd` (~line 860-920, post-2026-09-04-pulse-fix) — both already compute `fusionOutcome` via `predictFusionOutcome`; Task 2's new prediction state is set right alongside the existing pulse/chime trigger, from data already computed there.
  - `pendingRestOverride` (~line 427-441) and `optimisticAnchor` (~line 728 onward, post-Story-3.10-fix) — the two existing precedents for this story's own override pattern; read both fully, including their code-review-fix comments, before designing `predictedFusions`' own clearing conditions. Both taught the same lesson twice already: a version-only clearing condition is insufficient when a rejected write never bumps version — Task 3's failure path must use an explicit signal (Task 1's `fused` field via a dedicated event, not a version comparison), not repeat that mistake a third time.
- `src/lib/db/collections.ts`'s `onUpdate` (~line 267-350) — where `movePiece`'s new `fused` field becomes available to dispatch a "fusion conflict" event, mirroring `consumeAndCheckPredictedLock`/`emitPlacementConflict`'s existing wiring for the Frame-lock case.
- `src/lib/rooms/placement-conflict-events.ts` — the existing pub-sub pattern to mirror (or extend) for the new fusion-conflict signal.

### Architecture compliance

- AD-2 (server-authoritative writes) is fully preserved — this story adds no new write path, only a client-side rendering prediction and a small additive return-value change to an existing Server Action (Task 1).
- Mirrors Story 3.11's own precedent closely: that story already established "predict client-side using the same pure validation logic the server uses, never let prediction substitute for server validation, reconcile explicitly on mismatch" for Frame locks (`predictFrameLock`/`consumeAndCheckPredictedLock`). This story applies the identical philosophy to fusion, which Story 3.11 explicitly scoped out at the time (predicting the *sound/pulse* for fusion, but not the resulting Cluster's *behavior*).

### Testing standards summary

- Task 1's server-side return-value change: unit test at whatever level already covers `piece-actions.ts` (check current coverage first; per Previous Story Intelligence this file is likely untested directly).
- Tasks 2-3 (React/Konva component state): no component-testing infrastructure exists in this repo (React Testing Library/jsdom) — rely on manual verification (Task 4), consistent with every other Canvas-interaction story this session.

## Previous Story Intelligence (from Stories 3.10, 3.11, and the 2026-09-04 fusion-pulse fix)

- Story 3.11 built the exact prediction-then-reconcile philosophy this story extends to fusion — read it in full before starting, especially its Dev Notes on why prediction must never substitute for server validation (AD-2/NFR6).
- The 2026-09-04 fix (same session, not its own story) already added an instant visual *pulse* on a predicted-genuine fusion, reusing `onInstantFrameLockOutcome`/`PlacementPulse` — that fix stays; this story is explicitly about the *behavioral* gap it deliberately left open (dragging the pair as one unit), not a redo of the visual-acknowledgment part.
- Story 3.10 fixed `ClusterGroupSprite`'s `optimisticAnchor` getting permanently stuck on a rejected move by adding a non-version clearing condition (`representativeMember.scatterX/Y` matching an expected value) — same day, a second false-self-conflict bug was found and fixed in `movePiece`/`placePiece` (`ownLastKnownVersionByPieceId`, `collections.ts`) where the *same* client's own rapid successive actions on one piece raced against its own unconfirmed prior write. Both are directly relevant precedent for this story's own reconciliation logic (Task 3) — read both fixes' comments before designing how `predictedFusions` entries get cleared.
- No component-testing infrastructure exists in this repo — confirmed again as of this story; don't attempt to introduce it here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.13] — this story's own definition, added 2026-09-04.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — "Fusion has no confirmed-broadcast counterpart" entry this story resolves the *behavioral* half of (the cross-Participant broadcast half — other Participants getting zero feedback for someone else's fusion — remains separately deferred, not in this story's scope).
- [Source: src/lib/validation/predict-fusion.ts, src/lib/rooms/piece-actions.ts#repositionOrFuse] — existing prediction/real-fusion logic this story builds on, changes nothing about.
- [Source: src/components/canvas/room-canvas.tsx#pendingRestOverride, #optimisticAnchor] — the two existing local-override precedents to mirror.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via Claude Code.

### Debug Log References

None — every step passed cleanly (build/lint/test all green). One lint failure caught during development (`react-hooks/set-state-in-effect` on the first version of the success-reconciliation logic) — fixed by switching to a derived value computed at render time instead of an effect syncing into state; see Task 3's own completion note.

### Completion Notes List

- **AC #1 (instant grouped drag on genuine fusion): implemented, scoped to the simplest and most common case.** A solo piece fusing with exactly one other solo piece now renders and drags as one Îlot immediately — no waiting for `cluster_id` confirmation. A dragged Cluster fusing with something, or a solo piece touching an existing Cluster, keeps the existing pulse/chime (unchanged) but not yet the grouped-drag behavior — deliberately deferred, see Task 2's own note. This is a real, meaningful scope reduction from the story's own original framing (which didn't explicitly rule out the fuller case) — flagged here rather than silently narrowed.
- **AC #2 (server disagreement reverts cleanly): implemented via an explicit signal, not inference.** `movePiece`/`placePiece` now return `fused: boolean` (Task 1) — `predicted-fusion-events.ts` mirrors `placement-conflict-events.ts` exactly, so a genuine mismatch (predicted "genuine", server says `fused: false`) clears the optimistic grouping immediately. This follows the same lesson Story 3.10 already taught twice this session (data-comparison guesses about "did this fail" are fragile; an explicit signal from the one place that actually knows is not).
- **AC #3 (confirmed fusion replaces the optimistic one with no flicker): implemented as a derived value, not an effect.** The first implementation attempt used a `useEffect` watching `pieces`/`clustersById` to prune confirmed predictions via `setPredictedFusions` — this repo's own `react-hooks/set-state-in-effect` lint rule correctly rejected it as the exact "sync external data into state via an effect" anti-pattern already fixed twice this session (Story 3.10's `optimisticAnchor`/`scale`-`position` precedent literally has a comment about this). Corrected to a plain filter computed every render (`activePredictedFusions`) — confirmed entries are pruned from the underlying state opportunistically (on the next new fusion), not via a reactive effect.
- **AC #4 (server remains sole authority): unchanged by construction.** No validation logic moved client-side; `predictFusionOutcome` (already existing since Story 3.11) is the only thing consulted, purely to decide what to render optimistically, never what to write.
- **Open question for the user, not resolved here**: no toast/`aria-live` message was added for the rare "predicted fusion rejected" case — the pair just silently splits back to two independent pieces. Story 3.11's `placementConflictMessage` copy is Frame-placement-specific ("placée"), not reusable verbatim for a fusion conflict, and the task itself says to confirm before guessing new copy. Silent revert seems reasonable given how rare this is (needs two Participants racing the exact same two pieces), but flagging explicitly rather than deciding unilaterally.
- `pnpm build`/`pnpm lint`/`pnpm test` all clean (203 tests unchanged in count — `predict-fusion.test.ts` updated in place for the new return shape, no net new test file, though 1 new assertion added; no new automated tests added for the Konva/component-state logic itself, consistent with this repo's established lack of component-testing infrastructure).
- **Not verified in this environment: the actual visual/interaction result.** No browser tooling available this session. **Please verify locally**: (1) drag piece A onto touching piece B (both loose, genuine neighbors) — the resulting pair should immediately drag together as one Îlot, well before any server round-trip could complete; (2) an ordinary move, a Frame lock, and an existing-Cluster fusion (dragging a Cluster onto a loose piece, or vice versa) should all look and behave exactly as before this story (no optimistic grouping expected there, by design); (3) try a rapid sequence — fuse A+B, then immediately drag the resulting (still-unconfirmed) pair elsewhere — and confirm nothing visually breaks, even if the interaction feels slightly rough; this compounding case was explicitly not polished per this story's own Task 4 allowance.

### File List

- `src/lib/rooms/piece-actions.ts` (modified — `PieceActionResult` gains `fused?: boolean`; `repositionOrFuse`/`repositionPlain` call sites updated to surface it; `movePiece` and `placePiece`'s `restWithoutLocking` thread it through)
- `src/lib/validation/predict-fusion.ts` (modified — `predictFusionOutcome` now returns `{ outcome, candidates }` instead of a bare outcome string, so callers know *which* piece a genuine fusion touched)
- `src/lib/validation/predict-fusion.test.ts` (modified — updated for the new return shape, one new assertion on `candidates`)
- `src/lib/rooms/predicted-fusion-events.ts` (new — `markPredictedFusion`/`consumeAndCheckPredictedFusion`/`emitFusionConflict`/`subscribeFusionConflict`, mirroring `placement-conflict-events.ts`)
- `src/lib/db/collections.ts` (modified — `onUpdate` consumes the new fusion-prediction registry and emits `emitFusionConflict` on a genuine mismatch)
- `src/components/canvas/room-canvas.tsx` (modified — new module-level `PredictedFusion` type; `RoomCanvas` gains `predictedFusions` state, `activePredictedFusions` derived value, `addPredictedFusion`, a `subscribeFusionConflict` effect, and predicted-cluster-aware `soloPieces`/`membersByClusterId`/`renderItems`; `SoloPieceSprite` gains an `onGenuineFusion` prop and populates a prediction on a genuine 2-solo-piece fusion; `ClusterGroupSprite`'s own fusion branch updated only for the new `predictFusionOutcome` return shape, no new grouping behavior there per the documented scope decision)

## Change Log

| Date | Change |
|------|--------|
| 2026-09-04 | Story created: optimistic fusion (drag a genuinely-fused pair as one Îlot immediately, not after server confirmation) — the behavioral half of a gap already noted in `deferred-work.md`, complementing the same-day instant fusion *pulse* fix. Scope decision confirmed with the user: a local-only "predicted fusion" override (mirroring `pendingRestOverride`/`optimisticAnchor`), not a write to the currently-read-only `clusters` collection. |
| 2026-09-05 | Implemented on branch `story/3-13-optimistic-fusion`: `movePiece`/`placePiece` now surface `fused: boolean`; a local, never-persisted "predicted fusion" groups a solo-piece-fuses-solo-piece drop into one draggable Îlot immediately, reconciled via a derived value (success) and an explicit conflict signal (failure) — never a data-comparison guess. Scoped to the two-solo-pieces case; dragging an existing Cluster into a fusion still gets the pulse/chime only. Open question for the user: no toast added for a rejected prediction (silent revert) — confirm acceptable or provide copy. `pnpm build`/`pnpm lint`/`pnpm test` clean; manual interaction verification still needed. |
