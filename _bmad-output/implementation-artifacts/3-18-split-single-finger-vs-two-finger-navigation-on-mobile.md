baseline_commit: NO_VCS

# Story 3.18: Split single-finger vs two-finger navigation on mobile

Status: review

## Story

As a Participant on a touch device,
I want a single finger to only ever move a piece (or do nothing, on empty space) and two fingers to be the only way to pan/zoom the Canvas,
so that a one-finger slide never ambiguously moves the Canvas *or* a piece depending on exactly where my finger happened to land.

## Acceptance Criteria

1. **Given** a Participant on a touch device, **when** a single finger touches and drags a piece, **then** that piece moves, exactly as today — this story changes nothing about piece-dragging itself.
2. **When** a single finger touches and drags empty Canvas space (not a piece), **then** nothing happens — the Canvas itself no longer pans from a one-finger touch gesture.
3. **When** two fingers touch the Canvas anywhere (over a piece or empty space) and pinch/pan, **then** the Canvas pans and/or zooms exactly as today (Story 3.3's existing pinch-to-zoom, which already supports a combined pan+zoom gesture, not just pure pinching).
4. This change is touch-only — desktop mouse/trackpad panning (a single mouse-drag on empty Canvas space) is completely unaffected.

**Note — scope decision (2026-09-06), confirmed with the user before this story was written:** amends Story 3.3's own original mobile gesture spec (UX-DR15: "one-finger pan, pinch-zoom"), based on real usage — a one-finger slide being ambiguous between "move the Canvas" and "move a piece" (depending on whether the finger happened to land exactly on a piece) was reported as confusing, not a deliberate trade-off worth keeping. Adopts the touch model used by Procreate/Figma mobile/Concepts: one finger is exclusively for direct manipulation (a piece), two fingers exclusively for camera navigation (pan/zoom). The "or select" possibility for a one-finger touch on empty space (mentioned by the user) is explicitly deferred — this app has no selection concept today; revisit only if one gets added later.

## Tasks / Subtasks

- [x] Task 1: Stop a single-finger touch on empty Canvas space from panning the Stage (AC: #2, #4)
  - [x] **Read `src/components/canvas/room-canvas.tsx`'s touch-handling section in full before touching it** (`isDraggable`/`isPieceDragging` state ~L1621-1636, `handleTouchTransition`/`handleTouchStart`/`handleTouchMove`/`handleTouchEnd` ~L1788-1862, the `<Stage>` JSX's `draggable={isDraggable && !isPieceDragging}` ~L2032). Today, `isDraggable` is `true` whenever fewer than 2 touches are active (`handleTouchTransition(touchCount)`'s `setIsDraggable(touchCount < 2)`) — this is what lets a *single* finger pan the Stage today, on top of Konva's own per-piece drag precedence (a piece's own draggable `<Group>` already wins the gesture when the touch starts directly on it — that part is correct and must not change, AC #1).
  - [x] In `handleTouchStart` (~L1802), when exactly one touch is active and it landed directly on the Stage itself (not on a piece) — reuse the exact bubbling-guard pattern the Stage-level `handleDragEnd` already relies on (`e.target !== e.target.getStage()`, ~L1755, there to distinguish "this event's target is the Stage itself" from "this event bubbled up from a piece's own Group") — call `e.target.getStage()?.stopDrag()` immediately, the same imperative "cancel whatever Konva may have already started, with no render round-trip" call the existing 2-finger-arrives-after-1-finger-already-dragging fix (~L1813-1815) already uses for exactly this kind of race. This must run *only* for a touch event (`e.evt.touches.length === 1`, never for a mouse event — `TouchEvent`-specific, so this is naturally already scoped to touch input only, satisfying AC #4 without any extra input-type branching).
  - [x] Do **not** change the `draggable={isDraggable && !isPieceDragging}` prop itself, or `isDraggable`'s own `touchCount < 2` derivation — mouse-driven Stage panning (a single mouse-drag on empty Canvas space, desktop) still needs `isDraggable === true` at 0 touches, and the 2-finger pinch path still needs it briefly toggled `false` exactly as today. The fix is narrowly "cancel a single-finger *touch* drag the instant it starts on empty space," not a change to when dragging is *allowed* in general.
  - [x] Verify this doesn't interfere with `handleTouchStart`'s existing 2-finger case (~L1813-1815, `e.evt.touches.length >= 2`) — that branch already calls `stopDrag()` unconditionally when a 2nd finger lands, regardless of what the 1st finger was doing; this story's new 1-finger branch is a separate, mutually exclusive case (`touches.length === 1` vs `>= 2`), not a change to that existing branch.

- [x] Task 2: Regression + manual verification (AC: all)
  - [x] `pnpm build && pnpm lint && pnpm test` clean.
  - [ ] Manual verification on a real touch device (this repo has no canvas/visual-regression or component-testing infrastructure, consistent with every other Canvas-interaction story this session — and this class of touch-vs-mouse behavior specifically has already needed real-device testing twice this session, Story 3.3's pinch-zoom fixes): (1) one finger on a piece still drags it exactly as before; (2) one finger on empty Canvas space now does nothing — the Canvas doesn't pan; (3) two fingers anywhere (over a piece or empty space) still pan/zoom the Canvas exactly as before, including a pure 2-finger pan with no pinch (fingers moving together at a constant distance) and a pure pinch with no pan (fingers moving apart/together around a fixed midpoint); (4) on desktop, a single mouse-drag on empty Canvas space still pans exactly as before — completely unaffected; (5) a piece drag that starts, then a 2nd finger lands mid-drag (Story 3.9/3.15's existing edge-autoscroll case) still behaves exactly as before — this story's new 1-finger branch must not interfere with an already-in-progress piece drag.

## Dev Notes

### The exact mechanism: cancel, don't disable

The natural-seeming fix — set `isDraggable` to also require `touchCount === 0`, i.e. never `true` for exactly 1 touch — would be wrong: `isDraggable` is a single shared boolean that also gates *mouse*-driven Stage panning (0 touches, mouse input uses the same Konva `draggable` prop), and it's *momentarily* still `true` for 1 touch during the brief window between a 1st finger landing and Konva's own hit-testing deciding whether a piece or the Stage is the drag target — changing its derivation risks breaking that window's existing correctness for piece-drags. The correct, narrower fix (Task 1) is the same one this codebase already used to solve an analogous timing problem (2-finger pinch arriving after a 1-finger Stage-drag had already engaged, ~L1804-1815): imperatively `stopDrag()` the *specific* gesture that shouldn't be happening, the instant enough information exists to know it shouldn't (here: exactly 1 touch, and it landed on the Stage itself, not a piece) — leaving `isDraggable`'s own general "is panning currently allowed at all" semantics untouched for every other case (0 touches/mouse, a piece-drag in progress, a 2nd finger arriving).

### Why `e.target !== e.target.getStage()` is the right test for "landed on a piece"

Konva's touch/drag events bubble up through the node tree, but bubbling never *reassigns* `e.target` — it stays the original node the gesture started on, all the way up to the Stage-level handler (confirmed by this exact codebase's own existing comment on the Stage-level `handleDragEnd`, ~L1750-1754, which relies on the identical distinction to avoid writing a piece's own drop position into the Stage's pan state). So inside `handleTouchStart`, `e.target === e.target.getStage()` means the touch started directly on empty Canvas space; `e.target !== e.target.getStage()` means it started on a piece's (or Cluster's) own draggable `<Group>` — exactly the distinction AC #1 vs AC #2 needs.

### Two-finger pan+zoom already works today — no change needed there

Re-reading `handleTouchMove`'s existing math (~L1818-1858) confirms AC #3 needs no code change: `newPosition` is computed via `zoomAtPoint(midpoint, base.scale, newScale, base.position)` every touch-move tick, using the *previous* tick's own `base` as the reference (not the gesture's start) — so a 2-finger gesture where the midpoint translates across the screen with little/no distance change (a pure pan, fingers moving together) already produces a correctly-translating Stage position, independent of whether `newScale` actually changed. Pure pinch (midpoint roughly fixed, distance changing) and combined pan+pinch (midpoint moving *and* distance changing) both already fall out of the same formula. This story only needs to stop the *one-finger* case from panning — the two-finger case was already correct.

### Project Structure Notes

- Modified only: `src/components/canvas/room-canvas.tsx` (`handleTouchStart`'s new 1-finger-on-empty-space branch).
- No new files, no schema/data/Server Action changes, no new component.

### Testing standards summary

- This is Konva/DOM touch-event-model code with no existing test harness in this repo for this class of interaction (consistent with every other pinch-zoom/drag gesture story this session — none of which have direct automated coverage of the imperative Konva glue itself). Rely on Task 2's manual, real-device verification.

## Previous Story Intelligence (from this session's own recent work)

- This session's two rounds of pinch-to-zoom bugs (Story 3.3's lineage, 2026-09-04/05) already established the exact "imperatively `stopDrag()` a gesture the instant you know it shouldn't be happening, rather than relying on a React re-render to catch up" pattern this story reuses directly (`handleTouchStart`'s existing 2-finger branch, ~L1813-1815, is the direct precedent). Both of those fixes also needed real-device testing to actually confirm (a Firefox-for-Android-specific stutter that wasn't reproducible from reading the code alone) — the same caution applies here: this story's manual verification (Task 2) should be treated as load-bearing, not a formality.
- Story 3.15's edge-autoscroll work is the most recent example of touching this same touch/drag-handling neighborhood of `room-canvas.tsx` — its own Dev Notes' repeated emphasis on reading the existing pan/zoom/drag state fully before editing applies here too, especially given how many distinct pieces of state (`isDraggable`, `isPieceDragging`, `pinchLiveRef`, `lastPinchDistanceRef`) already interact in this exact area.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.18] — this story's own definition, added 2026-09-06, amending Story 3.3's original mobile gesture spec (UX-DR15).
- [Source: src/components/canvas/room-canvas.tsx] — `isDraggable`/`isPieceDragging` state, `handleTouchTransition`/`handleTouchStart`/`handleTouchMove`/`handleTouchEnd`, the Stage-level `handleDragEnd`'s bubbling-guard precedent this story reuses, the `<Stage>` JSX's `draggable`/`onTouchStart` wiring.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `pnpm build && pnpm lint && pnpm test` — clean, 212 tests passing, no regressions.

### Completion Notes List

- Task 1: `handleTouchStart` (`room-canvas.tsx`) gained a new branch, mutually exclusive with the existing 2-finger `stopDrag()` case (`return` added there to make the exclusivity explicit): when exactly one touch is active and `e.target === e.target.getStage()` (the touch started directly on the Stage, not a piece's own Group — the same bubbling-guard distinction the Stage-level `handleDragEnd` already relies on), `stage.stopDrag()` cancels whatever native single-finger Stage drag Konva may have already started. No changes to `isDraggable`'s own derivation, the `<Stage>`'s `draggable` prop, or `handleTouchMove`'s pinch/pan math — both were already correct for their respective cases (mouse panning, two-finger pan+zoom).
- Task 2: `pnpm build && pnpm lint && pnpm test` all clean. Manual verification left unchecked — this environment has no real touch device to actually exercise the single-finger-vs-two-finger distinction; needs the user's own pass per the story's Task 2 checklist, which explicitly calls out that this class of touch-vs-mouse behavior has already needed real-device testing twice this session (Story 3.3's pinch-zoom fixes) to catch browser-specific quirks that reading the code alone wouldn't reveal.

### File List

- `src/components/canvas/room-canvas.tsx` (modified — `handleTouchStart`'s new single-finger-on-empty-space branch)

## Change Log

| Date | Change |
|------|--------|
| 2026-09-06 | Story created: split mobile touch navigation so a single finger only ever moves a piece (or does nothing, on empty space), and two fingers are the only way to pan/zoom the Canvas — amending Story 3.3's original "one-finger pan" mobile spec based on real usage feedback (ambiguous between moving the Canvas and moving a piece). Desktop mouse panning explicitly unaffected. |
| 2026-09-06 | Implemented Task 1: `handleTouchStart` cancels a single-finger touch drag when it starts on empty Canvas space, reusing the existing bubbling-guard/`stopDrag()` techniques already established in this file. `pnpm build && pnpm lint && pnpm test` clean. Status → review; manual real-device verification left to the user (no touch device in this environment). |
