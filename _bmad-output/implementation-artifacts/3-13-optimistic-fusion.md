baseline_commit: NO_VCS

# Story 3.13: Optimistic fusion

Status: ready-for-dev

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

- [ ] Task 1: Give the server an explicit "did it actually fuse" signal (AC: #2, #3)
  - [ ] `movePiece`/`repositionOrFuse` (`src/lib/rooms/piece-actions.ts`) currently never tells the caller whether a drop actually fused — `PieceActionResult` only has `{success, version, placed?}` (`placed` is Story 3.11's own analogous signal for Frame locks). Add a `fused?: boolean` (or equivalent — e.g. `clusterId: string | null`) to `repositionOrFuse`'s return and thread it through `movePiece`'s result, mirroring exactly how `placePiece` already surfaces `placed`.
  - [ ] Unit-test the changed return shape at whatever level `piece-actions.ts` is already tested at today (check first — this file may only be exercised via its pure validation helpers, e.g. `validate-fusion.ts`'s own tests; if `piece-actions.ts` itself has no direct test harness, matching that existing convention is correct, not a gap to fix here).

- [ ] Task 2: Local "predicted fusion" override in `room-canvas.tsx` (AC: #1, #4)
  - [ ] Do **not** write to the `clusters` TanStack DB collection to represent this — it is deliberately read-only from the client today (see its own comment in `collections.ts`: "nothing ever calls `.update()` on this collection directly"), and giving it an `onInsert` just to hold a synthetic, never-actually-persisted local row would entangle this purely-cosmetic prediction with the real sync/mutation machinery for no benefit. Instead, mirror the already-established "local-only override" idiom this codebase already uses twice — `SoloPieceSprite`'s `pendingRestOverride` and `ClusterGroupSprite`'s `optimisticAnchor` (both in `room-canvas.tsx`) — with a new piece of `RoomCanvas`-level state, e.g.:
    ```ts
    type PredictedFusion = {
      tempClusterId: string; // crypto.randomUUID(), never sent to the server
      memberIds: readonly string[];
      anchorX: number;
      anchorY: number;
      // Per-member offset, same shape as RoomDetailPiece.clusterOffsetRow/Col —
      // computed once at prediction time from each member's own gridRow/gridCol
      // relative to whichever member sits at grid-offset (0,0), same convention
      // `repositionOrFuse` itself already uses server-side.
      offsetsByPieceId: ReadonlyMap<string, { row: number; col: number }>;
    };
    const [predictedFusions, setPredictedFusions] = useState<readonly PredictedFusion[]>([]);
    ```
  - [ ] Where `soloPieces`/`membersByClusterId` are computed today (`room-canvas.tsx`, currently ~line 1338-1351, the `useMemo` keyed on `[pieces, clustersById]`): before building the real split, exclude any piece id covered by an *active* `predictedFusions` entry from `soloPieces` (it must not render as a lone piece anymore), and feed `renderItems` (currently ~line 1443) a synthetic `RoomDetailCluster`-shaped object per active prediction (`{ id: tempClusterId, anchorX, anchorY, version: -1, roomId }` — `version: -1` is never compared against anything real, just needs to satisfy the type) so it flows through the exact same `type: "cluster"` render-item branch, reusing `ClusterGroupSprite` completely unmodified. `membersByClusterId` for that synthetic id should list the actual `RoomDetailPiece` objects (from the live `pieces` collection — no separate copy), just tagged as belonging to `tempClusterId` for this render pass.
  - [ ] At the drop moment (`SoloPieceSprite`/`ClusterGroupSprite`'s `handleDragEnd`, wherever `predictFusionOutcome(...) === "genuine"` — see the 2026-09-04 pulse fix, same call sites): also add the new `PredictedFusion` entry via `setPredictedFusions`, computed from the same members/positions already available there (`predictFusionOutcome`'s own `draggedMembers`/`stationaryMembers` inputs already carry everything needed: piece ids, grid positions, screen positions).

- [ ] Task 3: Reconciliation — success and failure (AC: #2, #3)
  - [ ] Success path: once the confirmed piece rows arrive via Realtime with the *real* `clusterId` matching every member id the prediction covered (i.e., `soloPieces`/`membersByClusterId`'s real computation — not the synthetic one — would now correctly group them under the real Cluster), drop the corresponding `predictedFusions` entry. Detect this inside the same `useMemo`/effect that already excludes predicted-fusion members from `soloPieces`, or via a small `useEffect` watching `pieces`/`clustersById` — whichever keeps the "exclude from real split, then re-check every render whether the real split has caught up" logic simplest and most obviously correct; do not introduce a second source of truth for "is this now really fused."
  - [ ] Failure path: `onUpdate`'s dispatch (`collections.ts`) already distinguishes "this specific drop was a genuine prediction" from "an ordinary drop" for the Frame-lock case (`consumeAndCheckPredictedLock`/`emitPlacementConflict`, `placement-conflict-events.ts`) — mirror that exact pattern for fusion: a new `predictedFusion-events.ts` (or extend the existing one) recording "this pieceId's drop was predicted-genuine," consumed once `movePiece`'s result comes back with `fused: false` despite the prediction saying "genuine," emitting a "fusion conflict" that `room-canvas.tsx` subscribes to and uses to immediately clear the matching `predictedFusions` entry (do not wait for Realtime here either — the Server Action's own synchronous return already tells you definitively, exactly like Task 1's new signal is for). Reuse Story 3.11's own factual-but-warm toast/`aria-live` copy convention (`placementConflictMessage`) for a fusion-specific equivalent message if this case is ever actually visible to a Participant — confirm with the user whether a distinct message is wanted or the existing one is close enough, rather than guessing new copy.

- [ ] Task 4: Regression + manual verification (AC: #5, all)
  - [ ] `pnpm build && pnpm lint && pnpm test` clean.
  - [ ] Manual verification (this repo has no canvas/visual-regression testing, see Previous Story Intelligence): (1) a genuine fusion now drags as one Îlot *immediately*, before any noticeable server round-trip; (2) an ordinary non-fusing drop, a Frame lock, an existing-Cluster-to-existing-Cluster fuse, all still behave exactly as before; (3) rapid repeated fusions (fuse A+B, then immediately drag the resulting pair into C before confirmation) don't corrupt state — if this compounding case turns out to be disproportionately complex, it's acceptable to explicitly scope it out and document the limitation, rather than attempting to solve every nested-prediction case in this one story; (4) spot-check that a *false*-genuine prediction (hard to trigger deliberately without two browser sessions racing the exact same pieces) reverts cleanly if reproduced.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-04 | Story created: optimistic fusion (drag a genuinely-fused pair as one Îlot immediately, not after server confirmation) — the behavioral half of a gap already noted in `deferred-work.md`, complementing the same-day instant fusion *pulse* fix. Scope decision confirmed with the user: a local-only "predicted fusion" override (mirroring `pendingRestOverride`/`optimisticAnchor`), not a write to the currently-read-only `clusters` collection. |
