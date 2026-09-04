---
baseline_commit: NO_VCS
---

# Story 3.8: Group pieces into a Cluster

Status: done

<!-- Implemented directly in-session together with Story 3.5's revision, at
the user's explicit direction, rather than through the full create-story →
dev-story cycle — see Story 3.5's 2026-08-30 Change Log entry for the bug
report that triggered this. Retroactively documented here. -->

## Story

As a Participant,
I want to assemble compatible pieces together away from the Frame,
So that I can pre-build a section of the puzzle before committing it.

## Acceptance Criteria

1. Given two or more pieces in the Canvas, when the Participant brings pieces whose edges genuinely match into contact, they fuse into a single Cluster, using the same geometric-matching rule as Frame integration (Story 3.5) — never by mere visual proximity.
2. A Participant can freely bring pieces close together without fusing them (personal sorting, e.g. by color) with zero effect on game state.
3. Two existing Clusters fuse into one under the same rule when their edges genuinely match.

## User-confirmed scope decisions (2026-08-30)

- **Why this story exists now, out of order:** Story 3.5's Frame-integration rule let an untested `interior`/`edge` piece (the overwhelming majority of any grid) get silently accepted into a wrong Frame slot whenever nothing was placed nearby yet to contradict it — reported directly from manual testing ("des pièces se posent dans le cadre au mauvais endroit... contenu visuel incohérent entre voisines"). The fix the user specified: tighten Frame-locking to require a genuine already-validated neighbor for everything except a true corner (see Story 3.5's Change Log) — and *separately*, give Participants a validated way to build correct groups away from the Frame first. That second half is this story.
- **Simplified mechanic, stated directly by the user (2026-08-30), superseding an earlier, more elaborate proposal:** "Une pièce est validée [si] elle est placée à son emplacement définitif dans le cadre avec la bonne orientation. Si la pièce est l'un des quatre coins du puzzle elle peut être posée seule et validée. Si la pièce n'est pas l'un des quatre coins, elle doit obligatoirement correspondre avec une pièce déjà validée." Free repositioning (in the Canvas or in the Frame's visual area) never runs validation; validation fires only for (1) fusing two pieces/Clusters whose edges are brought into genuine contact, wherever in the Canvas, and (2) locking an isolated piece/Cluster into the Frame (Story 3.5's now-tightened rule).
- **A Cluster is always free-floating.** Locking a Cluster into the Frame (Story 3.9) converts every member back into an individually `placed_row`/`placed_col` Piece and deletes the Cluster row — the Frame itself has no notion of Clusters, only of individually-placed Pieces that happen to be true neighbors. This keeps Frame rendering completely unchanged from Story 3.5.
- **`cluster_offset_row`/`cluster_offset_col` (a piece's position *within its own Cluster's local bounding box*) are exposed to the client once fused — `grid_row`/`grid_col` (the piece's true, absolute position in the full puzzle) never are**, preserving Story 3.1's "no hidden-answer data in any client payload" rule. Fusing two pieces necessarily reveals their *relative* arrangement to each other (that's the point of fusing) but never a piece's absolute position before it's actually Frame-locked.
- **Proximity/contact tolerance** (same "deferred, to be fixed in implementation" PRD flag as Story 3.5's Frame-slot threshold): a drop counts as touching another piece/Cluster within 30% of a tile's own width/height (`CONTACT_TOLERANCE_FACTOR` in `piece-actions.ts`) — a snapping window, not a loose "nearby" radius, so AC #2 (sorting near each other with zero effect) holds.

## Tasks / Subtasks

- [x] Schema: `cluster` table (`anchor_x`/`anchor_y`, `version`) + `piece.cluster_id`/`cluster_offset_row`/`cluster_offset_col`, RLS read-policy, added to `supabase_realtime` publication (`supabase/migrations/20260830000000_cluster.sql`). Applied and verified live.
- [x] Pure fusion-validation logic: `isGenuineContact` (true-neighbor + relative-direction match, both rotation 0), `findContactCandidates` (screen-position proximity within tolerance, per cardinal direction), `validateFusion` (zero tolerance — one false contact rejects the whole attempt) — `src/lib/validation/validate-fusion.ts`, 10 unit tests.
- [x] `movePiece` rewritten to be Cluster-aware: dragging any member moves its whole group; on drop, checks genuine contact against every other not-yet-Frame-anchored piece/Cluster in the Room; fuses on a genuine match (merging full membership of every touched group, recomputing normalized offsets), rejects on any false contact, else free repositioning always succeeds.
- [x] `placePiece` rewritten to operate on the dragged piece's whole group (solo piece or Cluster) — every member's target Frame slot computed from the anchor + its own offset; shape/rotation validated per member; the tightened corner-only bootstrap + already-validated-neighbor rule (Story 3.5's revision) applied group-wide, zero tolerance. On success every member converts to an individually placed Piece and the Cluster row is dropped.
- [x] `rotatePiece` now also rejects a piece that's part of a Cluster (fused pieces are already validated at `rotation = 0`; rotating one afterwards would silently invalidate that).
- [x] Client: `createRoomCollections` (replacing `createPieceCollection`) — `pieces` and `clusters` TanStack DB collections sharing one Supabase Realtime channel (Architecture AD-1: one channel per Room, not one per collection).
- [x] Client: `room-canvas.tsx` — `pieceRenderPosition` now resolves Frame-slot → Cluster-anchor+offset → scatter, in that order; unclustered pieces render/drag exactly as Story 3.5; a Cluster renders as one Konva `<Group draggable>` containing its members at local offsets, so dragging any member moves the whole group natively via Konva's own grouping (Story 3.9's "drag as one block"), with no custom per-frame position-sync code.
- [x] Get-room-by-slug: `RoomDetailPiece` gains `clusterId`/`clusterOffsetRow`/`clusterOffsetCol`; new `RoomDetailCluster` type + query; `RoomDetail` gains `clusters`.
- [x] Architecture: `ARCHITECTURE-SPINE.md` AD-3 amended (2026-08-30) documenting the corrected Frame-locking rule and the Cluster schema; the "seuil de proximité" Deferred item resolved.

### Review Findings

- [x] [Review][Patch] `repositionOrFuse` decides fusion is genuine from an *unlocked* read of stationary pieces (`loadStationaryFreeCandidates`), then row-locks the touched pieces only afterward — never re-verifying they're still actually in contact once locked. A concurrent `movePiece` relocating the touched piece in that window would still get it fused based on stale geometry, silently overriding the other Participant's action. Fix with the same two-pass "scan unlocked → lock candidates → re-check with fresh positions" pattern `placePiece`'s overlap guard already uses. [src/lib/rooms/piece-actions.ts:repositionOrFuse]
- [x] [Review][Patch] Two Participants dragging mutually-adjacent pieces toward each other at the same moment (A onto B, B onto A) can deadlock — `loadDraggedGroup` locks the dragged piece first, `repositionOrFuse` locks touched pieces later, with no canonical ordering between the two. Postgres's own deadlock detector aborts one side, but that abort was falling through to a generic `UNEXPECTED_ERROR`. Mitigated: detect the deadlock SQLSTATE and map it to `STALE_WRITE` (the same "world changed under you, retry via Realtime" semantics as the existing unique-violation case) — full prevention would need a bigger restructuring to a canonical lock-acquisition order across both call sites, tracked separately in `deferred-work.md`. [src/lib/rooms/piece-actions.ts:mapUnexpectedError]
- [x] [Review][Patch] Dragging a Cluster in free space visibly snaps back to its pre-drag position right after release, only correcting once the Realtime-confirmed `cluster` row arrives. Root cause: `ClusterGroupSprite`'s `<Group x={cluster.anchorX} y={cluster.anchorY}>` reads only the Cluster's confirmed anchor — the drag-end optimistic mutation writes `scatterX`/`scatterY` on the representative piece, but `pieceRenderPosition` never consults it for a still-clustered piece (`clusterId` isn't cleared optimistically), so nothing about the drop is reflected until Realtime confirms. Fixed with a local optimistic-anchor override in `ClusterGroupSprite`, cleared once `cluster.version` moves past the value captured at drop time. [src/components/canvas/room-canvas.tsx:ClusterGroupSprite]
- [x] [Review][Patch] `ClusterGroupSprite`'s `representativeMember = members.find(...) ?? members[0]` falls back to array position, not a stable identity — `members`' order depends on the live `pieces` array's iteration order, which isn't guaranteed stable across an unrelated Realtime-triggered re-render while a drag is already in flight. If the representative changes between drag-start and drag-end, the anchor-recovery math would use a mismatched offset, reproducing the exact "Clusters shift by an arbitrary offset" bug already fixed once (Story 3.5 Change Log (6)) for a different root cause. Fixed: pick the lexicographically lowest piece id — deterministic regardless of array order. [src/components/canvas/room-canvas.tsx:ClusterGroupSprite]
- [x] [Review][Patch] `ERROR_CODES.SHAPE_MISMATCH`/`ERROR_CODES.NEIGHBOR_MISMATCH` are dead code — every failing branch in `placePiece` now funnels through `restWithoutLocking()` (always `success: true`), so the `reason` these pure validators compute is never actually returned to any caller. Same class of issue as the already-removed `SLOT_OCCUPIED`. Remove them; the `PlacementRejectionReason` string literals stay in `validate-placement.ts`, where they remain meaningfully tested as the pure functions' own return contract. [src/lib/errors.ts]
- [x] [Review][Patch] `awaitVersion`'s `setTimeout` callback references `entry` before its `const` declaration a few lines below — harmless today only because the callback can't fire before the rest of the synchronous function body runs, but fragile if anything async is ever inserted between them. Reordered so both `entry` and `timeoutId` are declared before anything references them. [src/lib/db/collections.ts:awaitVersion]
- [x] [Review][Patch] `canBootstrapWithoutNeighbor`'s safety depends on `validatePieceOrientationAndShape` having already confirmed each member's target slot matches its shape category — implicit and order-sensitive, undocumented at either call site. Added a cross-referencing comment at both. [src/lib/rooms/piece-actions.ts:placePiece, src/lib/validation/validate-placement.ts:canBootstrapWithoutNeighbor]
- [x] [Review][Patch] The corner-bootstrap doc comment describes the leniency as "a Cluster containing at least one corner member," but the actual code (`occupiedByCoord.size === 0` gating the *whole* group) also lets a non-corner-only Cluster bootstrap once *any* member touches an already-validated Frame neighbor — which is still sound by the same transitive-validation reasoning (every member's relative position was already zero-tolerance-validated via fusion), just broader than documented. Updated the comment to describe the actual, still-correct rule. [src/lib/validation/validate-placement.ts:canBootstrapWithoutNeighbor]
- [x] [Review][Patch] `cluster.version` is bumped on every anchor update but never read or compared anywhere — all optimistic-concurrency checks go through the piece's own `version`, and `clusterCollection` has no `onUpdate` path at all. Documented as intentionally informational/Realtime-observability only, not a gating value, so a future reader doesn't go looking for a "missing" `expectedVersion` check against it. [src/lib/rooms/piece-actions.ts, src/lib/db/collections.ts]
- [x] [Review][Defer] Locking an entire Cluster into the Frame optimistically updates only the representative member's own piece row (`placedRow`/`placedCol`) — the rest of the Cluster's members keep rendering via the (still-clustered, unconfirmed) Group until each member's own Realtime event lands, so a successful multi-piece lock-in has less immediate visual feedback than a solo piece's. Real, but fixing it well means restructuring how a Cluster's members render once part of them are "optimistically placed" (today's render split is exactly solo-vs-clustered, with no in-between state) — bigger than a targeted patch, scope properly as its own pass. [src/components/canvas/room-canvas.tsx:ClusterGroupSprite]
- [x] [Review][Defer] Full deadlock *prevention* (a canonical lock-acquisition ordering shared between `loadDraggedGroup` and `repositionOrFuse`'s touched-piece locking) is a bigger restructuring than the STALE_WRITE mitigation above — the mitigation makes the rare deadlock's failure mode correct (abandon and resync) rather than misleading; full prevention is optimization on top of an already-safe outcome. [src/lib/rooms/piece-actions.ts]

## Dev Notes

### Why not the originally-sketched "arbitrary free-space contact detection for Frame-locking too" design

An earlier, more elaborate draft of this story (abandoned mid-implementation) tried to unify Frame-locking and free-space fusion under one generic "find every geometric contact anywhere" algorithm. The user's clarified mechanic doesn't need that: Frame-locking only ever needs deterministic grid-slot arithmetic (a member's target row/col is exactly the dragged piece's target + its own offset — no proximity search required), while free-space fusion genuinely does need proximity detection (arbitrary Canvas positions, no fixed grid to snap to). Keeping the two paths distinct in `piece-actions.ts` (`movePiece` for free-space fusion, `placePiece` for Frame-locking) avoided a lot of unnecessary complexity.

### Concurrency

Both `movePiece` and `placePiece` row-lock the dragged piece, and — if clustered — the Cluster row and every fellow member, all inside one transaction (AD-6). A fusion additionally row-locks every touched *other* group's full membership before rewriting `cluster_id`/offsets, so two concurrent fusions touching overlapping pieces serialize rather than racing.

### Verification

`pnpm build`/`pnpm lint`/`pnpm test` clean (125 tests: 115 prior + 10 new in `validate-fusion.test.ts`). No headless browser available in this environment — the actual drag-to-fuse and drag-a-Cluster-as-a-block gestures need manual verification: fuse two true-neighbor pieces in free space and confirm they move together afterward; confirm bringing two non-matching pieces close has zero effect; confirm a non-corner piece dropped into an empty Frame area with no neighbor is now rejected (previously silently accepted); confirm a genuine corner piece still locks in alone.

## Dev Agent Record

### Completion Notes List

- All ACs satisfied: #1 (genuine-contact fusion, reusing Story 3.5's exact true-neighbor + orientation rule), #2 (zero contacts = zero effect, `validateFusion` returns `false` on an empty candidate list), #3 (Cluster↔Cluster fusion merges full membership of every touched group, not just the contacting piece).
- Reused error code `NEIGHBOR_MISMATCH` for a rejected fusion/lock attempt rather than inventing a new one — semantically the same failure ("these aren't real neighbors").

### File List

**New:**
- `supabase/migrations/20260830000000_cluster.sql`
- `src/lib/validation/validate-fusion.ts`
- `src/lib/validation/validate-fusion.test.ts`

**Modified:**
- `src/lib/rooms/piece-actions.ts` (Cluster-aware `movePiece`/`placePiece`/`rotatePiece`)
- `src/lib/rooms/get-room-by-slug.ts` (`RoomDetailCluster`, `RoomDetail.clusters`, piece cluster fields)
- `src/lib/db/collections.ts` (`createRoomCollections` replacing `createPieceCollection`, shared Realtime channel)
- `src/components/canvas/room-canvas.tsx` (`ClusterGroupSprite`/`SoloPieceSprite`, cluster-aware `pieceRenderPosition`)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-30 | Story implemented: free-space Cluster fusion (AC #1–#3), jointly with Story 3.5's tightened Frame-locking rule and most of Story 3.9's "drag a Cluster as one block" mechanic (via Konva Group-based rendering). |
| 2026-09-01 | **Critical regression found and fixed post-review: every fusion and every Frame-lock attempt failed.** Reported directly: "plus rien ne fonctionne : ni la création d'îlots ni la validation de pièce" — every optimistic drag visibly bounced back, since the Server Action was throwing on essentially every call. Root cause: `loadAndLockFreePiecesByIds`'s query (introduced in the previous review round for `placePiece`'s overlap guard, and reused by this round's fusion-race fix in `repositionOrFuse`) ran a plain `for update` on a `left join` against `cluster` — Postgres rejects locking the nullable side of an outer join (`FOR UPDATE cannot be applied to the nullable side of an outer join`, confirmed live against the database) as a structural, data-independent restriction, so the query failed every single time it ran, regardless of content. Fixed: `for update of p` restricts the lock to `piece`; any associated Cluster row is now locked via a separate, explicit follow-up query in the same transaction. Verified live (pre-fix: confirmed the exact error; post-fix: confirmed the query succeeds). |
