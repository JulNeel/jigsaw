---
baseline_commit: NO_VCS
---

# Story 3.9: Move a Cluster as a block

Status: done

<!-- Implemented as a natural consequence of Story 3.8's Konva Group-based
Cluster rendering, in the same session, at the user's direction. Retroactively
documented here — see Story 3.8's Dev Notes for the full context. -->

## Story

As a Participant,
I want to drag an entire Cluster at once,
So that I don't have to relocate its pieces one by one.

## Acceptance Criteria

1. Given an existing Cluster, when the Participant drags any part of it, the whole Cluster moves together as a single unit.
2. Releasing it at a Frame location where its shape and edges genuinely match integrates the whole Cluster automatically (same rule as Story 3.5).

## Dev Notes

Both ACs fall out directly of Story 3.8's implementation choices, not extra work on top:

- **AC #1** — every Cluster renders as one Konva `<Group draggable>` (`ClusterGroupSprite` in `room-canvas.tsx`) containing its member pieces at fixed local offsets; dragging any member's visible tile is really dragging the Group (individual member `PieceSprite`s inside are `draggable={false}`), so Konva itself moves every member in lockstep with zero custom position-sync code.
- **AC #2** — the Group's `onDragEnd` calls the exact same `nearestFrameSlot` → `placePiece` path a solo piece uses (`piece-actions.ts`'s `placePiece`, generalized in Story 3.5's revision to operate over a dragged piece's whole group). Validation is group-wide and zero-tolerance: every member's implied target slot must satisfy shape/rotation, and the tightened corner-only-bootstrap-else-must-touch-an-already-validated-neighbor rule (Story 3.5's 2026-08-30 revision) applies to the group as a unit, not per member.

No separate implementation work exists for this story beyond what's already listed in Story 3.8's File List/Change Log — this file exists mainly so `sprint-status.yaml` accurately reflects that these ACs are already satisfied, not to avoid a future dev-story session re-doing them.

Not covered (left for Story 3.10, still backlog): per-Participant avatar chips on an actively-manipulated Cluster, and any behavior specific to concurrent multi-Participant Cluster manipulation beyond the existing optimistic-concurrency/`STALE_WRITE` handling (AD-6) already in place for every Piece/Cluster mutation.

## Dev Agent Record

### Completion Notes List

- See Story 3.8's Dev Agent Record — same commit of work, same File List.

## Change Log

| Date | Change |
|------|--------|
| 2026-08-30 | ACs satisfied as a direct consequence of Story 3.8's Konva Group-based Cluster rendering and group-aware `placePiece` — no additional code beyond Story 3.8's. |
| 2026-09-01 | Code review (see Story 3.8's Review Findings — same commit) found and fixed a real AC #1 regression: dragging a Cluster visibly snapped back to its pre-drag position right after release, only correcting once the Realtime-confirmed `cluster` row arrived, since `ClusterGroupSprite`'s `<Group>` position was driven purely by the (not optimistically updated) Cluster anchor. Fixed with a local optimistic-anchor override, cleared once `cluster.version` confirms. Also fixed: `representativeMember` selection was order-dependent (`members[0]`), now the stable lexicographically-lowest piece id — relevant to AC #1/#2's "any part of it" drag correctness. |
