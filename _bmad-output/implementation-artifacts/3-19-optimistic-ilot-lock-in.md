baseline_commit: NO_VCS

# Story 3.19: Optimistic Îlot lock-in

Status: ready-for-dev

## Story

As a Participant,
I want an entire Îlot to snap visibly into the Frame the instant I drop it on a valid slot,
so that locking in a whole Cluster feels as instant and confident as placing one loose piece already does.

## Acceptance Criteria

1. **Given** a Participant drags an Îlot (Cluster) and drops it onto a Frame position the client-side prediction (`predictFrameLock`) already believes will lock, **when** the drop happens, **then** every member of that Îlot immediately renders individually placed at its own correct Frame slot — not as a rigid dragged Group sitting at the raw drop point — with the same instant, no-wait feel a solo piece's own optimistic Frame-lock already has.
2. Each member also gets the same green placement pulse a solo piece's confident lock already gets, not just the existing sound cue.
3. If the server's own re-validation disagrees with the prediction (a genuine, rare conflict), every member reverts to its last confirmed state — still fused, still resting at the Cluster's true anchor — never left stuck floating at the wrong Frame position.
4. This remains purely a rendering/interaction concern — FR6/AD-2's rule that the server is the sole authority for whether a Frame lock is real is completely unchanged; prediction only ever anticipates, never substitutes for, server validation.

**Note — scope decision (2026-09-11), confirmed with the user before this story was written:** this closes a gap flagged during Story 3.8/3.9's own code review (`deferred-work.md`, 2026-09-01) — today, locking a whole Cluster into the Frame optimistically updates only the representative member's own row, but the render-classification logic (`RoomCanvas`'s `soloPieces`/`membersByClusterId` split) keys purely on `clusterId`, which the optimistic mutation never touches — so in practice a predicted-successful Cluster lock currently shows **zero** visual change at all (no snap, no pulse) until the server's confirmed rows and Realtime's Cluster-row deletion arrive, noticeably later than the sound cue already playing. This is the harder half of the "optimistic feedback" work this session already did for a solo piece (Story 3.11) and for two-piece fusion (Story 3.13) — the same idiom (a local-only, never-persisted render override, never a write to the read-only `clusters` TanStack DB collection) applied to the one remaining gap in that family.

## Tasks / Subtasks

- [ ] Task 1: Widen the existing move-conflict signal to also cover a rejected Cluster Frame-lock attempt (AC: #3 — prerequisite for Task 3)
  - [ ] **Read `src/lib/db/collections.ts`'s `onUpdate` (the `placePiece`/`movePiece`/`rotatePiece` dispatch block) and `src/lib/rooms/move-conflict-events.ts` in full before touching either.** A real, latent gap surfaced while designing this story: `emitMoveConflict(pieceId)` only ever fires when `isMove` is true (`changes.placedRow == null && changes.rotation === undefined`) — i.e. only for a plain `movePiece` dispatch. A Cluster's own drop-onto-a-Frame-slot attempt always sets `draft.placedRow`, dispatching `placePiece` instead (`isMove` is `false` for that call), so a `STALE_WRITE` thrown by `placePiece` for a Cluster today never emits this signal at all. `ClusterGroupSprite`'s existing `optimisticAnchor` already depends on this exact signal to clear itself on a genuine rejection (its own `subscribeMoveConflict` effect) — meaning `optimisticAnchor` itself already has this latent gap today (a Cluster racing another Participant to lock into the same Frame slot, losing with a `STALE_WRITE`, would currently leave `optimisticAnchor` stuck showing the piece at the drop point indefinitely, since `cluster.version` never bumps on a fully-rolled-back transaction and this event never fires to clear it directly). This story's own new prediction (Task 3) needs the same clearing signal to work correctly for the Frame-lock case specifically — fixing this widens correctness for both.
  - [ ] Change the guard at `collections.ts`'s `onUpdate` failure branch from `if (isMove) { emitMoveConflict(pieceId); }` to fire unconditionally on any `!result.success` (drop the `isMove` check entirely) — confirmed safe: `subscribeMoveConflict`'s only current subscriber is `ClusterGroupSprite`'s own `optimisticAnchor`-clearing effect, which explicitly wants to know about *any* rejected write for the representative id, move or place alike; a solo piece's own equivalent (`pendingRestOverride`) clears differently (via `piece.placedRow == null` directly on a hard rollback) and never subscribes to this event, so broadening it has no effect on solo-piece behavior.
  - [ ] Update `move-conflict-events.ts`'s own header comment to reflect that it now covers a rejected `placePiece` attempt too, not just `movePiece` — do not rename the file/exports (minimizes diff, matches this codebase's own preference for targeted patches over renames), just correct the comment's scope claim.

- [ ] Task 2: A new local-only "predicted Cluster lock" override in `RoomCanvas` (AC: #1, #3, #4)
  - [ ] **Read `RoomCanvas`'s existing `predictedFusions`/`addPredictedFusion`/`isFusionConfirmed`/`subscribeFusionConflict` block (Story 3.13) in full before touching it — this is the exact idiom to mirror**, substituting "a Cluster's members are predicted to lock into the Frame" for "two pieces are predicted to have fused."
  - [ ] New module-level type (alongside the existing `PredictedFusion` type, same file): `type PredictedClusterLock = { clusterId: string; representativePieceId: string; targetByPieceId: ReadonlyMap<string, { row: number; col: number }>; sinceVersion: number }`.
  - [ ] New state `const [predictedClusterLocks, setPredictedClusterLocks] = useState<readonly PredictedClusterLock[]>([])`, mirroring `predictedFusions` exactly.
  - [ ] `isClusterLockConfirmed(pcl)`: `true` once the cluster no longer exists in `clustersById` (the real lock succeeded — `placePiece` deletes the Cluster row entirely once every member is genuinely placed, so its absence *is* the confirmation) **or** the cluster is still found but `cluster.version >= pcl.sinceVersion` (a genuine rejection landed as a plain reposition/fusion instead, which — per `repositionPlain`'s own existing behavior — always bumps `cluster.version`, exactly the same version-floor technique `optimisticAnchor` already relies on).
  - [ ] `addPredictedClusterLock`/`activePredictedClusterLocks`: same opportunistic-pruning shape as `addPredictedFusion`/`activePredictedFusions` (filter out confirmed entries when adding a new one, rather than an effect).
  - [ ] New effect subscribing to `subscribeMoveConflict` (from Task 1's widened signal): when the emitted `pieceId` matches any active prediction's own `representativePieceId`, drop that specific `PredictedClusterLock` from state immediately — mirrors `subscribeFusionConflict`'s existing effect shape, and is what makes AC #3 (revert on genuine rejection) actually correct rather than relying on `cluster.version` catching up eventually.

- [ ] Task 3: Wire the prediction into `ClusterGroupSprite.handleDragEnd` and the render-classification split (AC: #1, #2)
  - [ ] **Read `ClusterGroupSprite.handleDragEnd`'s Frame-slot branch (the `if (slot)` block, where `predictedLock` is already computed via `predictFrameLock`) in full.** Right where `predictedLock === true` is already known (next to the existing `markPredictedLock`/chime logic), compute each member's own predicted absolute target row/col using the *same* offset-difference formula this function already uses a few lines above for `predictFrameLock`'s own `members` param (`m.clusterOffsetRow! - representativeMember.clusterOffsetRow!`, added to `slot.row`/`slot.col` — this exactly mirrors `placePiece`'s own server-side `anchorTargetRow + m.offsetRow` math, just expressed relative to the already-known `slot` instead of re-deriving the anchor).
  - [ ] Call a new `onPredictedClusterLock` prop with `{ clusterId: cluster.id, representativePieceId: representativeMember.id, targetByPieceId, sinceVersion: expectedResultVersion }` — reuse the *already-computed* `expectedResultVersion` local variable (the same one `setOptimisticAnchor` a few lines above already uses for its own `sinceVersion`), not a fresh computation.
  - [ ] Also call `onInstantFrameLockOutcome(m.id, PLACEMENT_PULSE_LOCKED_COLOR, <m's own slot center>)` for **every member**, not just the representative — this is AC #2, and directly removes the existing code comment's own caveat ("No colored pulse here (yet) — a Cluster lock-in's own optimistic-feedback gap is a pre-existing, already-tracked limitation... not something this change expands the scope of") — this story is exactly the change that closes that gap, so update/remove that comment accordingly. Each member's own slot center: `{ x: -frameWidth/2 + targetCol*tileWidth + tileWidth/2, y: -frameHeight/2 + targetRow*tileHeight + tileHeight/2 }` (same formula `SoloPieceSprite`'s own handleDragEnd already uses for its single slot center).
  - [ ] `RoomCanvas`'s `soloPieces`/`membersByClusterId` derivation (the `useMemo` that currently splits purely on `piece.clusterId`): for a piece whose real `clusterId` matches an active `PredictedClusterLock`'s own `clusterId` *and* whose id appears in that prediction's `targetByPieceId`, push a **patched clone** (`{ ...piece, placedRow: target.row, placedCol: target.col }` — mirroring the existing fusion-prediction clone's own "clone, not the live piece" pattern one branch up in the same function) into the `solo` array instead of `byCluster`. Since `pieceRenderPosition`'s `placedRow != null` branch already takes priority over the `clusterId` branch, this clone renders exactly like a real placed solo piece — same slot position, same `isPlaced`-driven non-draggable/non-rotatable interaction state — with zero new position-computation or interaction-gating code needed.
  - [ ] Once *every* member of a Cluster is diverted into `solo` this way, `membersByClusterId.get(cluster.id)` naturally returns `undefined` for it, and the existing `renderItems` cluster branch (`members ? [...] : []`) already renders nothing for that Cluster id — the rigid dragged-Group rendering disappears in the exact same render pass that the N individual placed pieces appear, with no separate cleanup step needed.
  - [ ] Thread the new `onPredictedClusterLock` prop through `ClusterGroupSprite`'s own props type and its JSX call site in `RoomCanvas` (passed as `RoomCanvas`'s own `addPredictedClusterLock` from Task 2) — `SoloPieceSprite` needs no equivalent prop; this is Cluster-only.

- [ ] Task 4: Regression + manual verification (AC: all)
  - [ ] `pnpm build && pnpm lint && pnpm test` clean.
  - [ ] Manual verification (this repo has no canvas/visual-regression or component-testing infrastructure, consistent with every other Canvas-interaction story this session): (1) drag a 2+ piece Îlot onto a Frame slot the prediction expects to lock — confirm every member snaps instantly to its correct Frame position (not just the representative) with a green pulse per member, well before any server round-trip could plausibly have completed; (2) drag an Îlot onto a Frame position that will genuinely fail validation (e.g. a piece rotated off its as-cut orientation, or a mismatched neighbor) — confirm it visually rests at the drop point instead (same as today's existing, correct rejected-solo-piece behavior), never stuck showing individual pieces "placed" at the wrong slots; (3) two browser sessions racing to lock the *same* Îlot into the *same* Frame slot at nearly the same time — confirm the losing session's Cluster correctly reverts (this exercises Task 1's widened conflict signal specifically); (4) confirm an Îlot that *doesn't* land near any Frame slot at all (an ordinary reposition or fusion attempt) is completely unaffected — this story only touches the Frame-slot-drop branch.

## Dev Notes

### Why this needs no changes to `placePiece`, `predictFrameLock`, or the server at all

This is purely a client-side rendering/prediction concern, exactly like Stories 3.11 and 3.13 before it. `placePiece`'s existing behavior (optimistically-set `placedRow` on the representative member only, real lock atomically updates every member + deletes the Cluster row) is already correct and sufficient — the gap is entirely that the *client's own render-classification* never consulted anything beyond the real, unoptimistic `clusterId` field. Nothing here changes what the server validates or how (AC #4).

### The exact mechanism the render-classification gap comes from

Confirmed by reading the current code directly: `RoomCanvas`'s `soloPieces`/`membersByClusterId` `useMemo` classifies a piece as "still clustered" whenever `piece.clusterId != null && clustersById.has(piece.clusterId)` — both of which stay exactly as they were before the drop, since the optimistic `collection.update` in `ClusterGroupSprite.handleDragEnd` only ever touches the *representative* member's own `placedRow`/`placedCol`/`scatterX`/`scatterY` fields, never `clusterId`, and never any *other* member's row at all (nor could it cheaply — that would require dispatching one `collection.update`/Server Action call per member, multiplying server calls for what must stay a single atomic transaction). `pieceRenderPosition`'s own `placedRow != null` branch does take priority over the `clusterId` branch when checked — but a piece never reaches that check while still classified as clustered, because `ClusterGroupSprite` renders its own members via `clusterOffsetRow`/`clusterOffsetCol` unconditionally, never consulting `placedRow` at all. This is why, today, *nothing at all* visibly changes on a predicted-successful Cluster lock — not even the representative member — contrary to what the initial `deferred-work.md` note's own phrasing ("optimistically updates only the representative member's own piece row... so a successful multi-piece lock-in has less immediate visual feedback than a solo piece's") might suggest at first read; in practice it's closer to *zero* immediate visual feedback, not merely *less*. The existing code's own comment on this (`ClusterGroupSprite.handleDragEnd`, right above the `if (slot)` block) confirms this explicitly: *"this Group only ever renders via `cluster.anchorX/Y`/`optimisticAnchor`... so setting `placedRow` optimistically here causes no premature slot-snap to correct for."*

### Why the fix diverts members *out of* the clustered render bucket, not *into* a modified Cluster render

Story 3.13's own fusion-prediction pattern moves a *solo* piece *into* the clustered bucket (rendering it as part of a synthetic, temporary Cluster before the real fusion confirms). This story needs the *opposite* direction: moving already-clustered members *out* into the solo bucket, individually, at their own distinct Frame slots — because a locked-in Îlot's members are no longer one rigid unit visually (each occupies its own separate grid cell), unlike a freshly-fused pair (still one rigid Group, just not yet server-confirmed). Reusing `SoloPieceSprite`'s own existing `isPlaced`/interaction-gating logic for each diverted member (via the patched clone) is therefore the correct target shape, not an extension of `ClusterGroupSprite`'s own rendering.

### The version-floor techniques this story reuses without modification

- `expectedResultVersion` (already computed in `handleDragEnd` for `optimisticAnchor`'s own `sinceVersion`) is the correct value to reuse for `PredictedClusterLock.sinceVersion` too — both predictions are about the *same* drag's *same* expected server outcome, just consumed by two different rendering concerns (where the Cluster's Group sits vs. whether its members render as placed).
- `isClusterLockConfirmed`'s version comparison (`cluster.version >= pcl.sinceVersion`) is the same pattern `optimisticAnchor`'s own `anchor` derivation already uses (`cluster.version < optimisticAnchor.sinceVersion` to keep trusting the guess) — read at render time, never via an effect+`setState` (this codebase's own repeatedly-relearned lesson, Stories 2.3/3.1/3.10).

### Project Structure Notes

- Modified only: `src/lib/db/collections.ts` (Task 1's widened `emitMoveConflict` guard), `src/lib/rooms/move-conflict-events.ts` (comment only), `src/components/canvas/room-canvas.tsx` (new `PredictedClusterLock` type/state/effect in `RoomCanvas`, new `onPredictedClusterLock` prop on `ClusterGroupSprite`, the `soloPieces`/`membersByClusterId` derivation, the pulse-per-member call).
- No new files, no schema/migration/Server Action changes.

### Testing standards summary

- Task 1's `collections.ts` change and Task 2/3's Konva-rendering changes have no existing direct test harness in this repo (consistent with every prior optimistic-feedback story this session — 3.10, 3.11, 3.13 — none of which have automated coverage of the imperative Realtime/Konva glue itself). Rely on Task 4's manual verification.

## Previous Story Intelligence (from this session's own recent work)

- Story 3.13 (Optimistic fusion) is the direct precedent for this story's entire mechanism — same "local-only override, never a write to the read-only `clusters` collection" idiom, same version-floor-based confirmation/clearing pattern, same explicit-conflict-signal-over-data-comparison lesson (already learned twice this session for `optimisticAnchor` itself, Story 3.10's two rounds of the "replay" bug).
- Story 3.10/3.13's own repeated, hard-won lesson — never infer a rejection from a data/version comparison alone when an explicit signal can be emitted instead — is exactly why Task 1 exists as its own prerequisite task here, rather than assuming the existing `move-conflict-events.ts` signal already covers this new case correctly.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.19] — this story's own definition, added 2026-09-11.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from: code review of story-3-8-group-pieces-into-a-cluster / story-3-9-move-a-cluster-as-a-block (2026-09-01)] — the original gap this story closes.
- [Source: src/components/canvas/room-canvas.tsx] — `predictedFusions`/`addPredictedFusion`/`isFusionConfirmed`/`subscribeFusionConflict` (the pattern to mirror), `ClusterGroupSprite.handleDragEnd`'s Frame-slot branch, `soloPieces`/`membersByClusterId`'s `useMemo`, `pieceRenderPosition`.
- [Source: src/lib/db/collections.ts, src/lib/rooms/move-conflict-events.ts] — the `isMove`-gated conflict signal this story widens.
- [Source: src/lib/rooms/piece-actions.ts] — `placePiece`'s own atomic multi-member lock/Cluster-row-deletion behavior, `repositionPlain`'s Cluster-version-bump-on-any-reposition behavior (confirms Task 2's version-floor logic is sound).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-11 | Story created: closes the "Cluster lock-in has less/no immediate visual feedback than a solo piece" gap flagged during Story 3.8/3.9's own code review (2026-09-01). Also surfaces and fixes, as a prerequisite task, a latent gap in the existing `optimisticAnchor` conflict signal (never fired for a rejected Cluster *placePiece* attempt, only a rejected plain `movePiece`). |
