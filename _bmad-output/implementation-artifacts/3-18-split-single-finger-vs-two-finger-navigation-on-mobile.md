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

### Two-finger pan+zoom — corrected during implementation (this Dev Note was originally wrong)

Originally assumed `handleTouchMove`'s existing math needed no change for AC #3, reasoning that `newPosition = zoomAtPoint(midpoint, base.scale, newScale, base.position)` computed fresh from the *previous tick's* `base` each frame would already track a moving midpoint correctly. **The user correctly questioned this before testing, and it was wrong**: algebraically, `zoomAtPoint(p, s, s, pos)` reduces to exactly `pos` whenever `newScale === oldScale`, *regardless* of `p` — so a pure 2-finger pan (fingers translating together, no distance change, `newScale ≈ base.scale`) produced zero net movement every single tick, no matter how far the midpoint itself moved on screen. The anchor point was always "wherever the fingers currently are," which only ever encodes a *zoom* correction, never a *pan* one. Fixed by anchoring on the *previous* tick's own midpoint (new `lastPinchMidpointRef`) instead, then separately adding the midpoint's own screen-space translation (`midpoint - lastMidpoint`) — verified numerically (a standalone simulation of pure pan, pure pinch at a fixed midpoint, and combined pan+zoom, all producing the expected result) before considering this fixed.

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
- **Real bug found by the user before any manual testing, from reading the PR description alone (2026-09-06): AC #3 ("two fingers pan and/or zoom") was not actually satisfied for a pure 2-finger pan.** `handleTouchMove`'s pre-existing math called `zoomAtPoint(midpoint, base.scale, newScale, base.position)` using the *current* tick's own midpoint as the anchor point every frame. Algebraically, `zoomAtPoint(p, s, s, pos)` always reduces to exactly `pos`, independent of `p`, whenever `newScale === oldScale` — so a pure 2-finger pan (fingers translating together, distance unchanged, `newScale ≈ base.scale`) produced *zero* net movement, no matter how far the midpoint itself moved. Position only ever changed as a side effect of an actual scale change. Fixed by tracking the *previous* tick's own midpoint (`lastPinchMidpointRef`) and anchoring the zoom computation there instead, then adding the midpoint's own translation (`midpoint - lastMidpoint`) on top — verified against a standalone numeric simulation of all three cases (pure pan, pure pinch at a fixed midpoint, combined pan+zoom) before committing, matching the expected result in each case.
- **Second real bug, reported by the user (2026-09-06): single-finger pan still worked *inside* the Frame's own outline rectangle**, even after Task 1's fix disabled it on the surrounding empty Canvas space. Root cause: Konva hit-tests a Shape's full geometry by default regardless of whether it has a visible `fill` — the Frame's own border `<Rect>` (stroke-only, purely decorative) was the one shape in this Layer missing `listening={false}` (unlike `PlacementPulse`/`FrameCompletionGlow`, which already had it). A touch landing inside the Frame's bounds but not on a piece hit-tested to this Rect, not the Stage, so `handleTouchStart`'s `e.target === stage` check never matched there and the pre-existing single-finger Stage-drag stayed engaged. Fixed by adding `listening={false}` to the Frame border Rect — confirmed no other decorative shape in the Layer was missing it.

### Completion Notes List

- Task 1: `handleTouchStart` (`room-canvas.tsx`) gained a new branch, mutually exclusive with the existing 2-finger `stopDrag()` case (`return` added there to make the exclusivity explicit): when exactly one touch is active and `e.target === e.target.getStage()` (the touch started directly on the Stage, not a piece's own Group — the same bubbling-guard distinction the Stage-level `handleDragEnd` already relies on), `stage.stopDrag()` cancels whatever native single-finger Stage drag Konva may have already started. No changes to `isDraggable`'s own derivation or the `<Stage>`'s `draggable` prop — mouse panning needed nothing.
- **AC #3 amendment (2026-09-06):** originally assumed (incorrectly — see Debug Log) that `handleTouchMove`'s existing 2-finger pan+zoom math needed no change. The user correctly questioned this before testing; a pure 2-finger pan (no distance change) turned out to be a complete no-op under the pre-existing formula. Fixed with a new `lastPinchMidpointRef`, re-anchoring the per-tick zoom computation on the *previous* tick's midpoint and adding the midpoint's own translation on top — now genuinely satisfies AC #3 for pure pan, pure pinch, and combined pan+zoom alike.
- **AC #2 amendment (2026-09-06):** Task 1's original fix (`e.target === stage`) missed the case where the touch lands inside the Frame's own outline rectangle — see Debug Log's second bug. Fixed with `listening={false}` on that Rect.
- Task 2: `pnpm build && pnpm lint && pnpm test` all clean. Manual verification still left to the user — the Frame-rectangle gap above is now fixed, but a final real-device pass per the story's Task 2 checklist (two-finger cases, desktop mouse, mid-drag 2nd-finger) hasn't been confirmed yet.

### File List

- `src/components/canvas/room-canvas.tsx` (modified — `handleTouchStart`'s new single-finger-on-empty-space branch; `handleTouchMove`'s pinch/pan anchor math corrected; new `lastPinchMidpointRef`; `listening={false}` added to the Frame border `Rect`)

## Change Log

| Date | Change |
|------|--------|
| 2026-09-06 | Story created: split mobile touch navigation so a single finger only ever moves a piece (or does nothing, on empty space), and two fingers are the only way to pan/zoom the Canvas — amending Story 3.3's original "one-finger pan" mobile spec based on real usage feedback (ambiguous between moving the Canvas and moving a piece). Desktop mouse panning explicitly unaffected. |
| 2026-09-06 | Implemented Task 1: `handleTouchStart` cancels a single-finger touch drag when it starts on empty Canvas space, reusing the existing bubbling-guard/`stopDrag()` techniques already established in this file. `pnpm build && pnpm lint && pnpm test` clean. Status → review; manual real-device verification left to the user (no touch device in this environment). |
| 2026-09-06 | User questioned 2-finger pan before testing — found real bug #1: pure 2-finger pan (no pinch) was a no-op. Fixed via `lastPinchMidpointRef`. User then reported real bug #2: single-finger pan still worked inside the Frame's own outline rectangle (missing `listening={false}`, unlike every other decorative shape in the Layer). Fixed. `pnpm build && pnpm lint && pnpm test` re-verified clean after each fix. |
| 2026-09-06 | User questioned (before testing) whether 2-finger pan actually worked, based on the PR description alone — correctly. Found and fixed a real pre-existing bug: `handleTouchMove` anchored its zoom math on the *current* midpoint every tick, which algebraically cancels to zero net pan whenever scale doesn't change — a pure 2-finger pan (no pinch) was a complete no-op. Fixed via a new `lastPinchMidpointRef`, re-verified `pnpm build && pnpm lint && pnpm test` clean. |
