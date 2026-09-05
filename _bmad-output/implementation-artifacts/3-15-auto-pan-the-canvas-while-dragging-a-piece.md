baseline_commit: NO_VCS

# Story 3.15: Auto-pan the Canvas while dragging a piece near the edge

Status: ready-for-dev

## Story

As a Participant,
I want the Canvas to keep scrolling in the direction I'm dragging a piece toward, once I get close to the edge of my screen,
so that I can move a piece anywhere on the board without ever having to drop it, re-grab it, and drag again.

## Acceptance Criteria

1. **Given** a Participant is dragging a piece or an Îlot (Cluster, Story 3.9/3.10), **when** the pointer/finger gets within a fixed margin of any edge of the visible Canvas viewport, **then** the Canvas pans continuously toward that edge for as long as the pointer stays within the margin, with no need to release the piece.
2. The piece/Îlot being dragged stays visually anchored under the pointer throughout — it never drifts away from or detaches from the cursor while the Canvas is auto-panning underneath it.
3. Panning stops the instant the pointer moves back outside the margin, or the drag ends (drop/release), whichever happens first.
4. Auto-pan never scrolls the Canvas past the same bounds manual panning already respects (`clampPosition`/`PAN_MARGIN`, Story 3.3) — it can never make part of the board permanently unreachable.
5. This works identically for a mouse drag (desktop) and a touch drag (mobile) — consistent with the rest of the Canvas's existing pointer handling.

**Note — scope decision (2026-09-05), confirmed with the user before this story was written:** this only applies while an actual piece/Îlot is being dragged (`draggingKey`/`isPieceDragging`, already tracked in `room-canvas.tsx`) — dragging the empty Canvas itself to pan (Story 3.3) is already a deliberate, direct pan gesture and is explicitly out of scope here, unaffected by this story.

## Tasks / Subtasks

- [ ] Task 1: Pure edge-autoscroll velocity math, unit-tested (AC: #1, #4)
  - [ ] New module `src/components/canvas/edge-autoscroll.ts`, following `viewport-bounds.ts`'s own established convention (pure, unit-testable geometry functions; no Konva/DOM imports).
  - [ ] `EDGE_AUTOSCROLL_MARGIN_PX` (e.g. `80` — reasonable default, not spec-mandated, tune visually) and `EDGE_AUTOSCROLL_MAX_SPEED_PX_PER_SEC` (e.g. `900`) constants.
  - [ ] `computeAutoscrollVelocity(pointer: Point, viewport: ViewportSize, margin: number, maxSpeed: number): Point` — returns a px/sec velocity per axis: `0` on an axis while the pointer is more than `margin` px from both of that axis's edges; otherwise scales linearly from `0` at the margin boundary up to `maxSpeed` exactly at the edge (`pointer.x <= 0` or `>= viewport.width`, same for y). Both axes are independent and can both be non-zero at once (a corner drag pans diagonally). Reuse `Point`/`ViewportSize` types from `viewport-bounds.ts` rather than redeclaring them.
  - [ ] Unit tests (`edge-autoscroll.test.ts`): zero velocity comfortably inside the viewport; correct sign and magnitude at each of the 4 edges and at a corner (both axes simultaneously); linear scaling at a few points between the margin boundary and the edge; clamped to `maxSpeed` (never exceeds it) even if `pointer` is outside `[0, viewport dimension]` (can happen mid-drag if the pointer briefly reports coordinates outside the Stage during a fast gesture).

- [ ] Task 2: Wire a self-driving `requestAnimationFrame` loop into `room-canvas.tsx` (AC: #1, #2, #3, #4, #5)
  - [ ] **Read `src/components/canvas/room-canvas.tsx` in full before touching it** — this file has no `onDragMove` handler anywhere today (only `onDragStart`/`onDragEnd`, on both `SoloPieceSprite` ~L495-512/514-706 and `ClusterGroupSprite` ~L1038-1047/876-1036), and no `requestAnimationFrame` loop of any kind. The closest existing precedent for "imperative Konva Stage mutation outside React state, mid-gesture" is pinch-zoom's `pinchLiveRef` + `handleTouchMove` (~L1787-1827) — follow that same idiom: mutate `stage.position()` directly and call `batchDraw()` every tick, and only call `setPosition` (React state) once, when the loop stops, mirroring `handleTouchTransition` (~L1757-1769).
  - [ ] Add `autoscrollFrameRef` (`useRef<number | null>(null)`, the RAF handle) and `autoscrollNodeRef` (`useRef<Konva.Node | null>(null)`, the currently-dragged node — a piece's or a Cluster's own `<Group>`).
  - [ ] `startAutoscroll(node: Konva.Node)`: sets `autoscrollNodeRef.current = node`, and if no RAF loop is already running, starts one (a `requestAnimationFrame` loop that reschedules itself every tick until `stopAutoscroll` cancels it).
  - [ ] Each tick: read `stage.getPointerPosition()` (already used this way for wheel-zoom, ~L1707); if `null` (pointer left the window entirely — can happen), skip this tick's pan but keep the loop alive. Compute `computeAutoscrollVelocity(pointer, stageSize, EDGE_AUTOSCROLL_MARGIN_PX, EDGE_AUTOSCROLL_MAX_SPEED_PX_PER_SEC)`; if both axes are `0`, still reschedule the next frame (the loop must keep running for the whole duration of the drag, it just does nothing on ticks where the pointer isn't near an edge) but skip the position/node math below.
  - [ ] When velocity is non-zero on either axis: compute `dt` from the previous tick's timestamp (`performance.now()` delta, first tick uses `0`); compute the new stage position as `clampPosition(currentStagePos + velocity * dt, clampedScale, stageSize, contentHalfExtent, PAN_MARGIN)` — **reuse the existing `clampPosition` helper** (`viewport-bounds.ts`) so AC #4 is satisfied for free, not reimplemented; write it via `stage.position(newPos)`.
  - [ ] **The critical, easy-to-get-wrong part (AC #2):** after moving the stage, the dragged node's own screen position has silently shifted (screen = stagePos + nodeLocalPos × scale) even though the pointer itself hasn't moved — the node must be repositioned in the *same tick* so it stays exactly under the (stationary) pointer, using the same content-space inversion `zoomAtPoint` already performs for zoom (`viewport-bounds.ts` ~L35-49): `nodeLocal = { x: (pointerScreen.x - newStagePos.x) / clampedScale, y: (pointerScreen.y - newStagePos.y) / clampedScale }`, then `node.position(nodeLocal)`. Call `stage.batchDraw()` once after both writes.
  - [ ] **Verify Konva's actual drag behavior here before considering this task done** — this is the one genuine technical unknown in this story. Konva's internal drag manager tracks a dragged node's position across native pointer-move events; imperatively calling `node.position(...)` on a node that's still mid-native-drag, from *outside* a real pointer-move event, may or may not be respected/overwritten by Konva's own drag manager on the *next* native pointer-move. Two fallback approaches if a plain `node.position()` write gets fought or reverted: (a) attach a `dragBoundFunc` on the dragged node for the duration of the autoscroll loop — Konva calls this on every native drag-move event to compute where the node should actually end up, which is the framework's own documented hook point for exactly this "constrain/redirect where a drag is allowed to go" case; or (b) after writing `node.position()`, also update whatever internal "last pointer position" Konva's drag manager keeps (check the installed Konva version's own source under `node_modules/konva/lib/`, e.g. `Node.js`'s `_setDragPosition`/drag-related internals) so the next native move computes its delta from the corrected baseline rather than the stale one. Pick whichever actually works once tested against this Room's real drag interactions — do not assume `node.position()` alone is sufficient without confirming it holds up across a multi-second held-at-the-edge drag.
  - [ ] `stopAutoscroll()`: cancels the RAF handle, clears both refs, and — mirroring `handleTouchTransition`'s pattern — syncs React state once: `setPosition(clampPosition(stage.position(), clampedScale, stageSize, contentHalfExtent, PAN_MARGIN))`, so the committed `position` state matches wherever the imperative loop left the Stage. Must run *before* the existing `handleDragEnd` logic on `SoloPieceSprite`/`ClusterGroupSprite` reads the dragged node's own final `x()`/`y()` — those already read the node's live position at drag end (unaffected by this change, since the autoscroll loop's own node writes are exactly what's live by then).
  - [ ] Call `startAutoscroll(e.target)` from both `SoloPieceSprite.handleDragStart` and `ClusterGroupSprite.handleDragStart`; call `stopAutoscroll()` as the *first* line of both `SoloPieceSprite.handleDragEnd` and `ClusterGroupSprite.handleDragEnd`, before their existing logic runs.

- [ ] Task 3: Regression + manual verification (AC: all)
  - [ ] `pnpm build && pnpm lint && pnpm test` clean.
  - [ ] Manual verification (this repo has no canvas/visual-regression or component-testing infrastructure for Konva interactions, consistent with every other Canvas-interaction story this session): (1) drag a loose piece toward each of the 4 viewport edges and confirm the Canvas pans continuously in that direction while held there, and the piece stays visually pinned under the cursor the whole time; (2) drag toward a corner and confirm diagonal panning; (3) drag an Îlot (2+ fused pieces) toward an edge and confirm the same; (4) move the pointer back away from the edge mid-drag and confirm panning stops immediately, without releasing the piece; (5) release the piece while still in the edge margin and confirm panning stops and the piece's existing drop/placement/fusion logic (Stories 3.5/3.9/3.13) still fires normally; (6) pan all the way to one of the Canvas's existing content bounds (`PAN_MARGIN`) while auto-panning and confirm it stops there rather than scrolling the board out of reach (AC #4); (7) repeat (1)-(4) on a real touch device.

## Dev Notes

### Why this needs a fresh `requestAnimationFrame` loop, not an `onDragMove` handler alone

An `onDragMove` handler only fires on an actual native pointer-move event. The whole point of this story is panning *while the pointer is held still* at the edge — Konva will never emit a `dragmove` event for a stationary pointer, so the panning itself must be driven by a self-rescheduling `requestAnimationFrame` loop, started at drag-start and stopped at drag-end, independent of whether the pointer is currently moving. `onDragMove` is not needed at all for this story — `onDragStart`/`onDragEnd` (which already exist) are the only two hooks needed to start/stop the loop.

### The exact coordinate-space gotcha (AC #2)

`room-canvas.tsx` currently reads a dragged node's position purely in stage-local/content space (`e.target.x()`/`y()`, confirmed at `SoloPieceSprite.handleDragEnd` ~L519 and `ClusterGroupSprite.handleDragEnd` ~L878) — the Stage itself is never moved during a piece drag today. This story is the first time the Stage's own position changes *while* a piece drag is in progress, and that interacts with the dragged node's screen position in a way this codebase hasn't had to handle before: `nodeScreenPos = stagePos + nodeLocalPos × scale`. If only `stagePos` is updated by the autoscroll loop and `nodeLocalPos` is left alone, the piece will visually slide across the screen (in the *same* direction as the pan) even though the pointer never moved — exactly the "detaches from the cursor" failure AC #2 exists to prevent. The fix is the same content↔screen inversion `zoomAtPoint` already does for wheel/pinch-zoom (`viewport-bounds.ts` ~L35-49) — recompute `nodeLocalPos` from the (unchanged) pointer screen position and the *new* `stagePos` on every tick that pans.

### Reuse `clampPosition`, do not reimplement bounds-checking

`clampPosition` (`viewport-bounds.ts` ~L59-76) already encodes exactly what AC #4 needs (never let content scroll out of reach past `PAN_MARGIN`) and is already used by every other panning path (`applyZoom`, `handleTouchMove`, `recenter`). Feed the autoscroll loop's proposed new stage position through it, exactly like those call sites do — this guarantees AC #4 without any new bounds logic to get wrong.

### Precedent: imperative-during-gesture, React-state-only-at-the-end

This exact pattern — mutate the Konva Stage directly during a continuous gesture, and only call `setScale`/`setPosition` once when the gesture ends — was established this session for pinch-zoom specifically to avoid forcing a full React re-render on every single high-frequency gesture tick (see `pinchLiveRef`, `handleTouchMove` ~L1787-1827, `handleTouchTransition` ~L1757-1769). A per-`requestAnimationFrame`-tick `setState` here would reintroduce the exact jank this codebase already fixed once for pinch-zoom on Firefox/Android — follow the same imperative-then-sync-once shape, not a fresh anti-pattern.

### The one real open technical question — verify before marking Task 2 done

Whether Konva's own drag manager will accept or fight an imperative `node.position(...)` write made *outside* a native pointer-move event, on a node that's still mid-drag. This codebase has no existing precedent for mutating a *dragged* node's position externally during its own drag (pinch-zoom moves the *Stage*, never a dragged piece) — this is genuinely new territory. Read the installed Konva version's actual drag-manager source (`node_modules/konva/lib/Node.js` or equivalent, whichever the "auto-pan a canvas library while a drag is held near the edge" community pattern for this Konva version recommends) before committing to the plain-`node.position()` approach; `dragBoundFunc` is Konva's own documented escape hatch for exactly this class of problem if the plain write doesn't hold up under a real, sustained edge-hold drag. Do not skip manual testing of a multi-second continuous edge-hold (Task 3, item 1) before considering this done — a subtle "snaps back on the next real pointer move" bug would only show up under sustained testing, not a quick tap-and-release check.

### Where this plugs into existing drag handlers

- `SoloPieceSprite.handleDragStart`/`handleDragEnd`: `src/components/canvas/room-canvas.tsx` ~L495-512, ~L514-706.
- `ClusterGroupSprite.handleDragStart`/`handleDragEnd`: `src/components/canvas/room-canvas.tsx` ~L1038-1047, ~L876-1036.
- Both are already wired via `groupProps`-style prop objects (`PieceSprite`'s `groupProps` ~L298-310 for the solo case; `ClusterGroupSprite`'s own `<Group draggable ...>` JSX ~L1050-1056) — no new prop plumbing needed beyond calling `startAutoscroll`/`stopAutoscroll` from the existing handler bodies.
- `stageRef` (`useRef<Konva.Stage>`, ~L1838) already exists and is exactly what `startAutoscroll`/the RAF tick need to call `getPointerPosition()`/`position()`/`batchDraw()` on.
- Existing constants to reuse, not duplicate: `PAN_MARGIN` (~L80), `stageSize` (state, ~L1562-1565), `contentHalfExtent` (~L1579), `clampedScale` (~L1683).

### Project Structure Notes

- New file: `src/components/canvas/edge-autoscroll.ts` (pure math, unit-tested) + `edge-autoscroll.test.ts`.
- Modified: `src/components/canvas/room-canvas.tsx` only (new refs, `startAutoscroll`/`stopAutoscroll`, RAF loop, two call sites each for start/stop). No other file needs to change — this is a pure Canvas-interaction story, no server/DB/Storage involvement at all (unlike Stories 3.13/3.14).
- No schema/migration/Server Action changes of any kind.

### Testing standards summary

- Task 1's `computeAutoscrollVelocity` is genuinely pure (no Konva/DOM) — full unit-test coverage expected, same bar as `viewport-bounds.ts`'s own existing pure functions.
- Task 2's Konva/DOM-imperative RAF-loop wiring has no existing test harness in this repo for this class of interaction (consistent with every other Canvas drag/gesture story this session — pinch-zoom, cluster drag, fusion — none of which have direct automated coverage of the imperative Konva glue itself). Rely on Task 3's manual verification for this part.

## Previous Story Intelligence (from this session's own recent work)

- This session's two rounds of pinch-to-zoom bugs (Firefox/Android, Story 3.3's lineage, 2026-09-04/05) are the direct precedent for both (a) why an imperative-during-gesture / sync-once-at-the-end pattern is required here too, and (b) how subtle and easy to get wrong continuous-gesture Konva code is in this codebase specifically — budget real manual-testing time for Task 3, don't assume a first pass is correct.
- Story 3.10/3.13's `optimisticAnchor`/`speculativeVersionRef` bugs (both "self-race" bugs, each requiring the user to explicitly demand an explanation before any fix) are a reminder that this Canvas component's state has bitten this project multiple times when a fix was applied without fully tracing the existing coordinate/state model first — read `room-canvas.tsx`'s current pan/zoom and drag sections in full before writing any autoscroll code, per Task 2's own first bullet.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.15] — this story's own definition, added 2026-09-05.
- [Source: src/components/canvas/room-canvas.tsx] — pan/zoom state (~L1590-1598), Stage sizing (~L1561-1577), `SoloPieceSprite`/`ClusterGroupSprite` drag handlers, pinch-zoom's imperative-during-gesture precedent (~L1787-1827, ~L1757-1769).
- [Source: src/components/canvas/viewport-bounds.ts] — `Point`/`ViewportSize` types, `clampPosition`, `zoomAtPoint`, the exact functions this story reuses rather than reimplements.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-05 | Story created: continuous edge-autoscroll while dragging a piece or Îlot, so a Participant never has to release, re-grab, and re-drag to cross the visible viewport. Pure velocity math is unit-tested; the Konva drag-vs-imperative-reposition interaction is flagged as this story's one genuine open technical question, to be resolved and verified during implementation. |
