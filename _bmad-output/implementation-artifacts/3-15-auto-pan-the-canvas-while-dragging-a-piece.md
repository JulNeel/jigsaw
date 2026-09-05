baseline_commit: NO_VCS

# Story 3.15: Auto-pan the Canvas while dragging a piece near the edge

Status: review

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

- [x] Task 1: Pure edge-autoscroll velocity math, unit-tested (AC: #1, #4)
  - [x] New module `src/components/canvas/edge-autoscroll.ts`, following `viewport-bounds.ts`'s own established convention (pure, unit-testable geometry functions; no Konva/DOM imports).
  - [x] `EDGE_AUTOSCROLL_MARGIN_PX` (e.g. `80` — reasonable default, not spec-mandated, tune visually) and `EDGE_AUTOSCROLL_MAX_SPEED_PX_PER_SEC` (e.g. `900`) constants.
  - [x] `computeAutoscrollVelocity(pointer: Point, viewport: ViewportSize, margin: number, maxSpeed: number): Point` — returns a px/sec velocity per axis: `0` on an axis while the pointer is more than `margin` px from both of that axis's edges; otherwise scales linearly from `0` at the margin boundary up to `maxSpeed` exactly at the edge (`pointer.x <= 0` or `>= viewport.width`, same for y). Both axes are independent and can both be non-zero at once (a corner drag pans diagonally). Reuse `Point`/`ViewportSize` types from `viewport-bounds.ts` rather than redeclaring them.
  - [x] Unit tests (`edge-autoscroll.test.ts`): zero velocity comfortably inside the viewport; correct sign and magnitude at each of the 4 edges and at a corner (both axes simultaneously); linear scaling at a few points between the margin boundary and the edge; clamped to `maxSpeed` (never exceeds it) even if `pointer` is outside `[0, viewport dimension]` (can happen mid-drag if the pointer briefly reports coordinates outside the Stage during a fast gesture).

- [x] Task 2: Wire a self-driving `requestAnimationFrame` loop into `room-canvas.tsx` (AC: #1, #2, #3, #4, #5)
  - [x] **Read `src/components/canvas/room-canvas.tsx` in full before touching it** — this file has no `onDragMove` handler anywhere today (only `onDragStart`/`onDragEnd`, on both `SoloPieceSprite` ~L495-512/514-706 and `ClusterGroupSprite` ~L1038-1047/876-1036), and no `requestAnimationFrame` loop of any kind. The closest existing precedent for "imperative Konva Stage mutation outside React state, mid-gesture" is pinch-zoom's `pinchLiveRef` + `handleTouchMove` (~L1787-1827) — follow that same idiom: mutate `stage.position()` directly and call `batchDraw()` every tick, and only call `setPosition` (React state) once, when the loop stops, mirroring `handleTouchTransition` (~L1757-1769).
  - [x] Add `autoscrollFrameRef` (`useRef<number | null>(null)`, the RAF handle) and `autoscrollNodeRef` (`useRef<Konva.Node | null>(null)`, the currently-dragged node — a piece's or a Cluster's own `<Group>`).
  - [x] `startAutoscroll(node: Konva.Node)`: sets `autoscrollNodeRef.current = node`, and if no RAF loop is already running, starts one (a `requestAnimationFrame` loop that reschedules itself every tick until `stopAutoscroll` cancels it).
  - [x] Each tick: read `stage.getPointerPosition()` (already used this way for wheel-zoom, ~L1707); if `null` (pointer left the window entirely — can happen), skip this tick's pan but keep the loop alive. Compute `computeAutoscrollVelocity(pointer, stageSize, EDGE_AUTOSCROLL_MARGIN_PX, EDGE_AUTOSCROLL_MAX_SPEED_PX_PER_SEC)`; if both axes are `0`, still reschedule the next frame (the loop must keep running for the whole duration of the drag, it just does nothing on ticks where the pointer isn't near an edge) but skip the position/node math below.
  - [x] When velocity is non-zero on either axis: compute `dt` from the previous tick's timestamp (`performance.now()` delta, first tick uses `0`); compute the new stage position as `clampPosition(currentStagePos + velocity * dt, clampedScale, stageSize, contentHalfExtent, PAN_MARGIN)` — **reuse the existing `clampPosition` helper** (`viewport-bounds.ts`) so AC #4 is satisfied for free, not reimplemented; write it via `stage.position(newPos)`.
  - [x] **The critical, easy-to-get-wrong part (AC #2)** — resolved by re-asserting the dragged node's *absolute* (screen-space) position, not by recomputing its local content-space position from the pointer. See "The Konva open question — resolved" Dev Note below for the full reasoning and why this is the more robust of the two.
  - [x] **Verify Konva's actual drag behavior here before considering this task done** — resolved by reading `node_modules/konva/lib/Node.js`'s actual `_setDragPosition`/`getAbsolutePosition`/`setAbsolutePosition` source (see Dev Notes below); confirmed the `node.absolutePosition()` approach is provably consistent with Konva's own internal drag contract, not just empirically hoped to work.
  - [x] `stopAutoscroll()`: cancels the RAF handle, clears both refs, and — mirroring `handleTouchTransition`'s pattern — syncs React state once: `setPosition(clampPosition(stage.position(), clampedScale, stageSize, contentHalfExtent, PAN_MARGIN))`, so the committed `position` state matches wherever the imperative loop left the Stage. Runs as the *first* line of `SoloPieceSprite`'s/`ClusterGroupSprite`'s own `onDragEnd` prop invocation (called from inside their internal `handleDragEnd`, before those read the dragged node's own final `x()`/`y()` for drop/placement logic) — so those reads always see wherever the autoscroll loop's own node writes last left it.
  - [x] Call `startAutoscroll(e.target)` from both `SoloPieceSprite.handleDragStart` and `ClusterGroupSprite.handleDragStart`; call `stopAutoscroll()` as the *first* line of both `SoloPieceSprite.handleDragEnd` and `ClusterGroupSprite.handleDragEnd`, before their existing logic runs.

- [x] Task 3: Regression + manual verification (AC: all)
  - [x] `pnpm build && pnpm lint && pnpm test` clean.
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

### The Konva open question — resolved

Read `node_modules/konva/lib/Node.js`'s actual drag internals (`_createDragElement`, `_setDragPosition`, `getAbsolutePosition`/`setAbsolutePosition`, and the public `absolutePosition()` getter/setter alias at `addGetterSetter(Node, 'absolutePosition')`) before implementing, per this story's own instruction. Findings:

- Konva captures a **fixed, absolute/screen-space offset** between the pointer and the dragged node exactly once, at drag-start (`_createDragElement`'s `offset: { x: pos.x - ap.x, y: pos.y - ap.y }`, where `ap` is `getAbsolutePosition()` — i.e. screen pixels, already composed through every ancestor transform including the Stage's own scale/position).
- On every subsequent *native* pointer-move event, `_setDragPosition` recomputes `newNodePos = currentPointerAbsPos - thatFixedOffset` and calls `setAbsolutePosition(newNodePos)` — which itself correctly re-derives the node's local x/y from whatever the Stage's transform is *at that moment*. In other words: Konva's own drag math is entirely expressed in absolute/screen coordinates, and already accounts for a moving Stage correctly, by design.
- The failure mode this story worried about only actually happens between two native pointer-move events (i.e. while the pointer is genuinely stationary, autoscroll's whole premise) — nothing re-asserts the node's screen position during that gap unless something does it manually.
- **Conclusion:** re-writing the node's *local* content-space position each tick (the originally-sketched `zoomAtPoint`-style inversion) is not what best matches Konva's own contract — re-writing its **absolute/screen position** is, since that's the exact quantity Konva's own drag manager treats as authoritative. Implemented as: capture `node.absolutePosition()` *before* moving the Stage each tick, move the Stage, then write that *same* captured value back via `node.absolutePosition(nodeAbsolutePosition)`. Since nothing else touches the node's absolute position while the pointer is stationary, this is provably equivalent to Konva's own `pointerAbsPos - fixedOffset` formula (both sides stay constant across ticks with no real pointer movement) — so the very next genuine pointer-move event converges to the same value with **no snap**, without needing to replicate or introspect Konva's private `_dragElements`/`offset` bookkeeping at all. This uses only the documented public API (`node.absolutePosition()`).

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

Claude Sonnet 5

### Debug Log References

- `pnpm build && pnpm lint && pnpm test` — clean on first pass; no TypeScript/lint errors after adding the `(e: Konva.KonvaEventObject<DragEvent>)` parameter to `onDragStart`/`onDragEnd` on both sprite components. 212 tests passing (203 pre-existing + 9 new for `computeAutoscrollVelocity`).
- Resolved the story's own flagged open technical question by reading `node_modules/konva/lib/Node.js`'s actual drag internals rather than guessing — see the "The Konva open question — resolved" Dev Note added during implementation.

### Completion Notes List

- Task 1: `src/components/canvas/edge-autoscroll.ts` — pure `computeAutoscrollVelocity`, `EDGE_AUTOSCROLL_MARGIN_PX` (80px) and `EDGE_AUTOSCROLL_MAX_SPEED_PX_PER_SEC` (900px/s) constants, reusing `Point`/`ViewportSize` from `viewport-bounds.ts`. 9 unit tests covering zero-velocity, all 4 edges, a corner, linear scaling, and out-of-bounds clamping.
- Task 2: `room-canvas.tsx` — added `autoscrollFrameRef`/`autoscrollNodeRef`/`autoscrollLastTimeRef`, `autoscrollTick`/`startAutoscroll`/`stopAutoscroll`, plus an unmount-cleanup effect for the RAF handle. `onDragStart`/`onDragEnd` on `SoloPieceSprite`/`ClusterGroupSprite` now accept and forward the Konva drag event (previously bare `() => void`) so `RoomCanvas`'s own JSX callbacks can call `startAutoscroll(e.target)`/`stopAutoscroll()` alongside the pre-existing `setDraggingKey`/`bringToFront` logic. The node-anchoring approach ended up using `node.absolutePosition()` (screen-space) rather than the story's originally-sketched local-space `zoomAtPoint`-style inversion — verified against Konva's actual source to be the more robust of the two (see Dev Notes).
- Task 3: `pnpm build && pnpm lint && pnpm test` all clean. Manual verification left unchecked — this environment has no browser/mouse/touch device to actually exercise a live drag-and-hold-at-the-edge gesture; needs the user's own pass per the story's Task 3 checklist, with particular attention to item (1)'s "stays visually pinned under the cursor" and item (6)'s bounds check.

### File List

- `src/components/canvas/edge-autoscroll.ts` (new)
- `src/components/canvas/edge-autoscroll.test.ts` (new)
- `src/components/canvas/room-canvas.tsx` (modified — autoscroll refs/loop, `onDragStart`/`onDragEnd` signature change on `SoloPieceSprite`/`ClusterGroupSprite`, wiring in `RoomCanvas`'s JSX)

## Change Log

| Date | Change |
|------|--------|
| 2026-09-05 | Story created: continuous edge-autoscroll while dragging a piece or Îlot, so a Participant never has to release, re-grab, and re-drag to cross the visible viewport. Pure velocity math is unit-tested; the Konva drag-vs-imperative-reposition interaction is flagged as this story's one genuine open technical question, to be resolved and verified during implementation. |
| 2026-09-05 | Implemented both tasks: `edge-autoscroll.ts` (pure velocity math, unit-tested) and a `requestAnimationFrame` loop wired into `room-canvas.tsx`'s piece/Îlot drag handlers. Resolved the open Konva question by reading the installed library's actual drag-manager source — anchoring via `node.absolutePosition()` rather than local-space math. `pnpm build && pnpm lint && pnpm test` clean. Status → review; manual verification left to the user (no browser/device in this environment). |
