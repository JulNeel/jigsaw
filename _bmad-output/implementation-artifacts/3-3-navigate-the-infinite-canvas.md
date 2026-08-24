---
baseline_commit: 8754ed41a14901c59e66bebf88cd563c71fb4481
---

# Story 3.3: Navigate the infinite Canvas

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Participant in a Room,
I want to pan and zoom freely around the Canvas,
so that I can explore scattered pieces and work anywhere in the space.

## Acceptance Criteria

1. Once the Canvas is loaded, dragging pans the view (mouse-drag on desktop, one-finger touch on mobile) and pinching/scrolling zooms it (trackpad/wheel on desktop, two-finger pinch on mobile) — the view updates smoothly with no perceptible lag, rendered via Konva.js/`react-konva` (Architecture AD-5: all Canvas rendering goes through Konva, no direct Canvas2D/WebGL access).
2. No piece ever becomes permanently unreachable or stuck outside the navigable area (NFR-1) — panning/zooming is bounded relative to the Room's actual content extent (Frame + every piece's real scattered position), never an arbitrary fixed area that could exclude pieces seeded near the scatter radius's outer range.
3. On a desktop viewport (`≥ lg`) the Canvas fills the screen, with mouse/trackpad controlling pan-zoom; on mobile/wrapper (`< md`) the same Canvas responds to touch gestures (one-finger pan, pinch-zoom) — no separate mobile-only layout or component tree (UX-DR15).

## User-confirmed scope decisions

- **Pan/zoom view state (`scale`, `position`) lives locally in `RoomCanvas` for this story — not lifted to a shared hook or exposed via a ref/imperative handle yet.** Story 3.4 (Recenter on the Frame) will need read/write access to this same state to implement its "snap back to the Frame" button, and Architecture's AD-5 explicitly calls for a shared `lib/canvas/project-to-screen.ts` coordinate-projection utility (for future avatar chips / `aria-live` content anchored to the Canvas — Epic 4). **Neither of those is built in this story** — there is nothing yet that needs them (no recenter button, no presence overlay). Keep the state shape a plain, simple `{ scale: number; position: { x: number; y: number } }` (not buried inside Konva-ref-only internals) specifically so Story 3.4 can lift/reuse it cleanly later, but do not preemptively build the lifting mechanism or the projection utility now.
4. **Only the Room name is rendered as a top overlay in this story.** The `key-salon.html` mockup shows presence avatars, an "Inviter" button, a mute button, and a recenter button all overlaid on the full-bleed Canvas — but presence is Epic 4 (`RoomPresence`, not built), recenter is Story 3.4, mute has no story anywhere in Epic 3-5, and invite is already served by `/create`'s own success screen (Story 2.4), not this route. Building any of those now would be scope creep. This story only needs to reposition the already-existing `room.name` heading as a small top-left overlay (replacing the current centered/padded page layout) so the Canvas can be full-bleed underneath it — nothing else from the mockup's corners.

## Tasks / Subtasks

- [x] Task 1: Extract pure, unit-testable viewport math (AC: #1, #2)
  - [x] Create `src/components/canvas/viewport-bounds.ts` exporting three pure functions (no Konva/DOM/React imports — this file must be testable under Vitest's `environment: "node"`, consistent with `is-unique-slug-violation.ts`/`compute-adjacency.ts`'s precedent):
    ```ts
    export type Point = { x: number; y: number };
    export type ViewportSize = { width: number; height: number };

    export function clampScale(scale: number, min: number, max: number): number;

    // Keeps `pointer` (screen coordinates) visually fixed while scale changes
    // from oldScale to newScale, given the stage's current screen position.
    // Same math serves both wheel-zoom (pointer = cursor) and pinch-zoom
    // (pointer = touch midpoint) — one function, two call sites.
    export function zoomAtPoint(
      pointer: Point,
      oldScale: number,
      newScale: number,
      oldPosition: Point,
    ): Point;

    // Clamps `position` (where content-space (0,0) maps to on screen) so the
    // content's bounding box — spanning [-contentHalfExtent, +contentHalfExtent]
    // in content-space on both axes, the same square-bounding-box convention
    // `room-canvas.tsx` already uses for `halfExtentX`/`halfExtentY` — can
    // never be panned so far that it stops overlapping the viewport at all
    // (AC #2 / NFR-1: nothing ever becomes permanently unreachable). `margin`
    // is the minimum sliver (px) of content guaranteed to stay reachable at
    // any edge.
    export function clampPosition(
      position: Point,
      scale: number,
      viewport: ViewportSize,
      contentHalfExtent: number,
      margin: number,
    ): Point;
    ```
  - [x] `clampPosition`'s exact formula: with `half = contentHalfExtent * scale`, `minX = -half - margin`, `maxX = viewport.width + half + margin` (symmetric for Y with `viewport.height`); clamp `position.x`/`position.y` into `[min, max]`. Derivation: content occupies screen-range `[position.x - half, position.x + half]` horizontally; requiring that range to still intersect `[0, viewport.width]` (with `margin` slack) gives exactly these bounds.
  - [x] Write `viewport-bounds.test.ts` covering: `clampScale` at/below/above bounds; `zoomAtPoint` keeps the pointer's content-space location invariant across a scale change (assert the returned position, applied with `newScale`, maps the same content point back under `pointer`); `clampPosition` no-op when already in bounds, and clamped correctly at each of the 4 directional extremes.
- [x] Task 2: Responsive full-bleed Stage sizing (AC: #3)
  - [x] In `room-canvas.tsx`, replace the fixed `VIEWPORT_SIZE = 800` constant with a `useState<{ width: number; height: number }>` seeded from `window.innerWidth`/`window.innerHeight` (safe — this component only ever mounts client-side, behind `room-canvas-loader.tsx`'s `ssr: false`), updated via a `resize` event listener (added/removed in a `useEffect`). No `ResizeObserver` needed — the Stage fills the whole viewport (Task 3's layout change), not an arbitrary-sized container, so window resize is the only thing that changes it.
  - [x] Fit-to-content initial scale becomes `Math.min(stageWidth, stageHeight) / contentSpan` (previously `VIEWPORT_SIZE / contentSpan`, assuming a square viewport that no longer exists) — this is the story's `MIN_SCALE` (see Task 4). Initial position remains content-origin-at-viewport-center: `{ x: stageWidth / 2, y: stageHeight / 2 }`.
- [x] Task 3: Full-bleed page layout — Canvas fills the screen, Room name as a top overlay (AC: #3, scope decision #4)
  - [x] In `src/app/room/[id]/page.tsx`, replace the current `<div className="flex flex-col items-center gap-4 p-6"><h1>...</h1><RoomView .../></div>` wrapper with a full-viewport, non-scrolling container (e.g. `<div className="relative h-dvh w-full overflow-hidden">`), the `<h1>` repositioned as a small absolutely-positioned top-left overlay (`absolute top-4 left-4 z-10`, translucent background for legibility over scattered pieces — mirror `key-salon.html`'s `.top-bar .salon-title` styling intent, not its exact CSS), and `<RoomView>` filling the same container.
  - [x] `RoomView` (`src/components/room/room-view.tsx`) itself needs no structural change — it already just renders `RoomCanvasClient` + `FirstAccessTutorial` as siblings; it only needs its parent container to actually be full-bleed for the Stage sizing in Task 2 to fill the screen.
- [x] Task 4: Wheel-zoom (desktop) and drag-to-pan, bounded (AC: #1, #2)
  - [x] Compute `MIN_SCALE = fitScale * 0.5` and `MAX_SCALE = fitScale * 4` (module-level multiplier constants `MIN_SCALE_FACTOR`/`MAX_SCALE_FACTOR`, bounds computed per-render from the Room's actual `fitScale` — these are reasonable, tunable defaults, not spec-mandated numbers; adjust during manual testing if they feel wrong).
  - [x] Make `scale`/`position` controlled React state (seeded from Task 2's fit computation), passed to `Stage` as `scaleX`/`scaleY`/`x`/`y` props.
  - [x] Add `Stage`'s `onWheel` handler: `e.evt.preventDefault()`, read `stage.getPointerPosition()`, compute `newScale = clampScale(oldScale * (delta > 0 ? 1/factor : factor), MIN_SCALE, MAX_SCALE)` (standard Konva "zoom on scroll" recipe, `factor` e.g. `1.05`), then `zoomAtPoint(pointer, oldScale, newScale, oldPosition)` for the new position; update both state values together.
  - [x] Set `Stage draggable` and provide a `dragBoundFunc` that calls `clampPosition(pos, scale, { width: stageWidth, height: stageHeight }, contentHalfExtent, margin)` (a `margin` of e.g. `150` — reasonable default, not spec-mandated) — this is what makes native Konva dragging (mouse-drag on desktop, one-finger touch on mobile, both handled by the same `draggable` mechanism) satisfy AC #2 without any extra event wiring. Sync the state's `position` on `onDragMove` (or at minimum `onDragEnd`) so it stays consistent with wheel/pinch-zoom's own state updates.
- [x] Task 5: Two-finger pinch-zoom (mobile), coexisting with one-finger pan (AC: #1, #3)
  - [x] Add `onTouchMove`/`onTouchEnd` handlers on `Stage`: when `e.evt.touches.length === 2`, compute the distance and midpoint between the two touches; compare distance to the previous frame's (store in a ref, reset on touch start/end) to derive a scale delta, clamp via `clampScale`, and reposition via `zoomAtPoint` using the midpoint as `pointer` — same helpers as Task 4's wheel handler, different input.
  - [x] While `touches.length === 2`, set `stage.draggable(false)` (Konva's own imperative API) so its native one-finger-drag panning doesn't fight with the two-finger pinch math; restore `draggable(true)` once touches drop back to 0 or 1. This is the standard, well-known Konva pinch-zoom gotcha (two-finger touch must suspend single-touch drag) — don't skip it, a coexistence bug here is the most likely source of "janky"/fighting gestures on mobile.
- [x] Task 6: Regression check
  - [x] `pnpm build` — zero TypeScript errors
  - [x] `pnpm lint` — clean
  - [x] `pnpm test` — all existing tests pass, plus new `viewport-bounds.test.ts` cases
  - [x] **Limitation, documented honestly (same as every story since 1.4):** no headless browser available — real pan/drag/wheel/pinch interaction, "no perceptible lag" (AC #1), and the responsive full-bleed layout on both a real desktop and mobile viewport can't be verified here. Recommend the user open a Room on both a desktop browser (mouse-drag to pan, scroll/trackpad-pinch to zoom) and a real mobile device or browser touch-emulation (one-finger pan, two-finger pinch) and confirm: panning/zooming feels smooth with no lag or fighting between gestures; every scattered piece can still be panned into view at every zoom level (try a piece near the far edge of the scatter range); the Canvas fills the full viewport with the Room name as a small top-left label, on both viewport sizes.

## Dev Notes

- **Coordinate convention already established (Story 3.1):** the Frame is centered at content-space `(0, 0)`; every piece's `scatterX`/`scatterY` is relative to that same origin. This story's `position` state is exactly "where content-space `(0,0)` currently maps to on screen" — the same mental model the current static `x={VIEWPORT_SIZE/2} y={VIEWPORT_SIZE/2}` already uses, just now dynamic and bounded instead of a fixed constant.
- **`halfExtentX`/`halfExtentY`/`contentSpan` computation in `room-canvas.tsx` is unchanged** — Task 1/4 reuse it (as `contentHalfExtent = Math.max(halfExtentX, halfExtentY)`) for both the initial fit-scale and the pan-clamp bounds. This is precisely why AC #2 is satisfied: bounds are derived from the Room's *actual* piece positions and Frame size, not a guess — a Room with `SCATTER_RADIUS_RANGE`'s max (2000px, `create-room-form.tsx`) is handled the same as a small one.
- **Architecture AD-5** ("Tout rendu du Canvas... passe par Konva.js via `react-konva`. Aucun accès direct à l'API Canvas2D ou WebGL hors de cette couche") — this story's wheel/touch handlers still go through Konva's own event system (`Stage`'s `onWheel`/`onTouchMove`, `stage.getPointerPosition()`) exclusively; nothing in this story touches a raw `<canvas>` context directly.
- **Zoom bounds are relative to each Room's own `fitScale`, not an absolute pixel-scale constant** — different Rooms have wildly different content extents (piece count, grid size, scatter radius), so a single absolute min/max would feel wrong across Rooms. `MIN_SCALE_FACTOR`/`MAX_SCALE_FACTOR` are reasonable starting multipliers; tune them during manual verification rather than treating them as exact.
- **Why `dragBoundFunc` and not a manual `onDragMove` clamp:** Konva's `dragBoundFunc` is called synchronously during the native drag, before the position is committed — clamping there means the *visual* drag itself never overshoots the bound (no rubber-banding artifact), matching NFR-1's "pas de dépassement erratique de la position pointée" wording even though that NFR's original context was piece-dragging (a later story), not Canvas panning.
- **`usePieceImage`/`PieceSprite` are untouched by this story** — only `RoomCanvas`'s own `Stage`-level state/sizing/handlers change; individual piece rendering logic is orthogonal.
- **This story does not touch `first-access-tutorial.tsx` or `tutorial-seen.ts`** — the tutorial Dialog renders via a Radix portal, independent of the Canvas's own layout/sizing changes.
- **No new translated copy needed** — this story adds no user-facing text (no new buttons/labels), only interaction behavior and layout.

### Project Structure Notes

- New: `src/components/canvas/viewport-bounds.ts` (+ `viewport-bounds.test.ts`).
- Modified: `src/components/canvas/room-canvas.tsx` (responsive sizing, controlled scale/position state, wheel + drag + touch-pinch handlers), `src/app/room/[id]/page.tsx` (full-bleed layout, Room name repositioned as overlay).
- Explicitly NOT created in this story (see scope decisions above): `src/lib/canvas/project-to-screen.ts` (AD-5-mandated, but nothing yet consumes it), any recenter/presence/mute/invite overlay component.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.3-Navigate-the-infinite-Canvas] — story statement and AC source
- [Source: _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md#FR-1, #NFR-1] — "Le Participant peut naviguer librement (pan/zoom)... Un bouton recentrer est visible en permanence" (recenter is FR-1's own follow-on, confirmed as Story 3.4 not 3.3); NFR-1's exact wording on stability/no-loss-at-edges
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md] — "Pan / zoom de l'Espace infini (FR-1) — glisser... pincer (tactile) ou molette (desktop)"; responsive breakpoint table (desktop souris/trackpad vs mobile gestes tactiles, no separate layout — UX-DR15); Accessibility Floor (not directly relevant to Canvas gestures themselves, which are explicitly exempted as "essentiel"/manipulatory media)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/mockups/key-salon.html] — full-bleed Canvas layout, top-bar/title overlay positioning, corner overlays (presence/recenter/mute/invite — noted as explicitly out of scope here per scope decision #4)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#AD-5] — Konva-only Canvas rendering rule; `lib/canvas/project-to-screen.ts` file-structure entry (not built this story, noted for Story 3.4/Epic 4)
- [Source: _bmad-output/implementation-artifacts/3-1-join-a-room-as-a-guest.md] — Frame/Piece coordinate-space convention (origin at Frame center) this story's `position` state builds on directly; `usePieceImage`'s effect pattern (unchanged, untouched by this story)
- [Source: _bmad-output/implementation-artifacts/3-2-first-access-tutorial.md] — `RoomView` coordinator component (unchanged structurally); `onReady` canvas-mount signal (unaffected by this story's changes, still fires once on mount)

## Previous Story Intelligence (from Story 3.2)

- `RoomCanvas` already accepts an `onReady?: () => void` prop (fired once on mount via a `firedRef`-guarded effect) — this story's changes must not break that; `onReady` firing is about "the Stage mounted", independent of the fit-scale/sizing values this story changes.
- Story 3.2's code review caught two unguarded-crash patterns (unhandled auth check, unguarded `sessionStorage` access) that both stemmed from not reading existing safe-access precedent in the codebase before adding new browser-API calls. This story adds several new browser API touches (`window.innerWidth/innerHeight`, `resize` listener, `stage.getPointerPosition()`) — none of these are known to throw in normal operation (unlike `sessionStorage` in private-browsing contexts), so no equivalent guard is expected, but keep the "read what already exists before adding a new browser API call" habit.
- pnpm is the only package manager. 81 tests currently pass (`pnpm test`); this story adds `viewport-bounds.test.ts` on top, following the same pure-function-module pattern as `is-unique-slug-violation.test.ts`/`tutorial-seen.test.ts` (no mocking framework, no `jsdom` needed since these functions take plain numbers/objects, not DOM/Konva references).
- The `react-hooks/set-state-in-effect` lint rule has now surfaced in 3 of the last 3 stories (2.3, 3.1, 3.2) for setState-in-effect patterns; this story's `resize`-listener `useEffect` (Task 2) calls `setState` from an event-listener *callback*, not synchronously in the effect body itself — the same shape as `usePieceImage`'s `onload`/`onerror` callbacks that never tripped the rule, so it should be fine, but if the linter flags it anyway, that established pattern (setState only from an async/event callback, never synchronously in the effect body) is the fix, not a new workaround.

### Review Findings

- [x] [Review][Patch] `clampPosition`'s `margin` sign is inverted relative to its own documented invariant — the formula does the opposite of "guaranteed visible sliver": `minX = -half - margin`/`maxX = viewport.width + half + margin` lets content pan `margin` px *further* off-screen past the zero-overlap point, instead of stopping `margin` px *short* of it (correct: `minX = -half + margin`, `maxX = viewport.width + half - margin`, with `margin` capped at `half` to keep `minX ≤ maxX` at extreme zoom-out). The accompanying "always keeps a margin-sized sliver reachable" test is tautological — it asserts the buggy formula's own output, not actual viewport overlap, so it passed despite the bug [src/components/canvas/viewport-bounds.ts, src/components/canvas/viewport-bounds.test.ts]
- [x] [Review][Patch] `scale`/`position` are seeded once from `useState(fitScale)`/initial center and never re-clamped when `stageSize` changes (window resize, phone rotation) — the live values can sit outside the newly-computed `minScale`/`maxScale`/pan bounds with nothing correcting them until the user's next gesture, silently violating AC #2/#3 after a resize [src/components/canvas/room-canvas.tsx]
- [x] [Review][Patch] Two-finger pinch state machine doesn't match Task 5's own spec text ("reset on touch start/end") — no `onTouchStart` handler means a 3rd-finger-then-lift sequence leaves a stale `lastPinchDistanceRef`, causing an abrupt zoom jump on the next pinch frame; `touchcancel` is unhandled entirely, so a system-interrupted gesture (incoming call, OS gesture) can leave `isDraggable` stuck `false` — one-finger panning permanently dead until the component remounts [src/components/canvas/room-canvas.tsx]
- [x] [Review][Patch] Horizontal-only wheel/trackpad scroll (`deltaY === 0`, `deltaX ≠ 0`) falls into the `else` branch and spuriously zooms the Canvas *out* on every such event — an ordinary horizontal scroll gesture should be a no-op for zoom [src/components/canvas/room-canvas.tsx]
- [x] [Review][Patch] `onDragMove` syncs `position` state on every drag frame, forcing a full React re-render (recomputing the piece-extent scan and every `PieceSprite`) at pointer-move frequency — Task 4 explicitly permitted the cheaper `onDragEnd`-only sync; this is the most likely source of perceptible lag (AC #1) on a Room with many pieces. The extent computation isn't memoized either [src/components/canvas/room-canvas.tsx]
- [x] [Review][Patch] The absolutely-positioned Room-name `<h1>` overlay has no `pointer-events-none` — a drag/wheel/touch gesture starting in the top-left corner hits the label instead of the Canvas, a dead zone for panning/zooming exactly where the mockup places a persistent label [src/app/room/[id]/page.tsx]
- [x] [Review][Patch] No `touch-action: none` on the Stage's container (risks the mobile browser claiming a touch gesture for native scroll/pinch before React's handlers run), and `stageSize` reads `window.innerWidth/innerHeight` rather than measuring the actual container element (a few px off from the `h-dvh w-full` container — desktop scrollbar gutter, mobile browser-chrome-driven `dvh`/`innerHeight` divergence — clipping the Canvas against its `overflow-hidden` parent) [src/components/canvas/room-canvas.tsx]
- [x] [Review][Patch] No defensive floor against degenerate zero/NaN dimensions — a transiently zero-size container (hidden tab, zero-size iframe) makes `fitScale`/`minScale`/`maxScale` all `0`, after which `zoomAtPoint` divides by `oldScale = 0` producing `NaN`, propagating into `scale`/`position` state and `strokeWidth={3/scale}` — nothing recovers without a remount [src/components/canvas/room-canvas.tsx, src/components/canvas/viewport-bounds.ts]
- [x] [Review][Defer] Wheel zoom's fixed step ignores `deltaY` magnitude/`deltaMode`, and doesn't distinguish trackpad-pinch (`ctrlKey: true`) from two-finger scroll — could feel inconsistent across devices/input methods. Real polish item, not a hard AC violation; `WHEEL_ZOOM_FACTOR` is already documented as a tunable default [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] The square bounding-box approximation (`contentHalfExtent = Math.max(halfExtentX, halfExtentY)`) over-constrains notably non-square Rooms' fit-scale and pan bounds — pre-existing simplification from Stories 3.1/3.2, this story only extends its use to the new zoom-fit computation. Revisit with per-axis bounds if it becomes a real UX complaint [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] `Math.max(frameWidth / 2, ...room.pieces.map(...))`'s spread-argument pattern would throw past V8's ~65k-argument ceiling — unreachable today (`PIECE_COUNT_OPTIONS` caps at 1500, verified from source) but a one-line `reduce` away from being immune if piece counts ever grow [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] No keyboard-accessible pan/zoom path (arrow keys, +/-) and no "double-tap to fit" — the Canvas has no navigation affordance besides the coming Story 3.4 recenter button. Real accessibility gap, but not in any of this story's ACs; revisit as its own accessibility pass [src/components/canvas/room-canvas.tsx]

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- The `react-hooks/set-state-in-effect` lint rule (flagged 3 times previously — Stories 2.3, 3.1, 3.2) did NOT trigger on this story's `resize`-listener effect, confirming the predicted shape: `setState` there is only ever called from the event-listener callback, never synchronously in the effect body — `pnpm lint` was clean on the first pass.
- No other notable issues — Konva's documented "zoom on scroll"/pinch-zoom recipes applied directly matched `zoomAtPoint`'s pure-function contract with no surprises; `dragBoundFunc` and the `isDraggable` React-state toggle (instead of an imperative `stage.draggable()` call, which would have fought react-konva's own prop-diffing on every re-render) worked as designed.

### Completion Notes List

- `src/components/canvas/viewport-bounds.ts` — pure `clampScale`/`zoomAtPoint`/`clampPosition` functions, unit-tested (9 new tests) without any Konva/DOM dependency.
- `src/components/canvas/room-canvas.tsx` — reworked from a fully static Canvas into a pannable/zoomable one: `stageSize` now tracks `window.innerWidth/innerHeight` (updated on `resize`); `scale`/`position` are controlled React state seeded from a fit-to-content computation; mouse-wheel zoom-to-cursor and native `draggable` pan (mouse on desktop, one-finger touch on mobile) are both bounded via `dragBoundFunc`/`clampPosition`; two-finger pinch-zoom is handled via `onTouchMove`/`onTouchEnd`, toggling an `isDraggable` state flag (not an imperative Konva call) to `false` during a 2-touch gesture so it never fights the Stage's own `draggable` prop.
- `src/app/room/[id]/page.tsx` — Canvas is now full-bleed (`h-dvh w-full overflow-hidden`), Room name repositioned as a small absolutely-positioned top-left overlay with a translucent background for legibility over scattered pieces. No presence/recenter/mute/invite overlay added — explicitly out of scope (see scope decisions).
- Pan bounds are derived from the Room's actual content extent (`contentHalfExtent`, unchanged computation from Stories 3.1/3.2) — satisfies AC #2/NFR-1 regardless of how large a given Room's scatter radius was at creation time.
- Same Canvas/component tree serves both desktop and mobile — no breakpoint-based layout branch, satisfying AC #3/UX-DR15's "no separate mobile-only layout".
- All ACs satisfied: #1 (wheel + drag + pinch, all through Konva's own event system per AD-5), #2 (bounded pan/zoom derived from real content extent), #3 (full-bleed responsive layout, same interaction code path on both breakpoints).
- `pnpm build`/`pnpm lint` clean; `pnpm test` — 90 tests passing (81 previous + 9 new in `viewport-bounds.test.ts`).
- **Limitation, documented honestly (same as every story since 1.4):** no headless browser available — real pan/wheel/pinch interaction, "no perceptible lag", and the responsive full-bleed layout on both a real desktop and mobile viewport couldn't be verified here. Recommend the user open a Room on both a desktop browser (mouse-drag to pan, scroll/trackpad-pinch to zoom) and a real mobile device or touch-emulation (one-finger pan, two-finger pinch) and confirm: gestures feel smooth with no lag or fighting between pan/zoom; a piece near the far edge of the scatter range can still be panned into view at every zoom level; the Canvas fills the full viewport with the Room name as a small top-left label, on both viewport sizes.

**Code review round (2026-08-24, Opus subagents):** 0 decisions, 7 patches applied, 4 items deferred (logged in `deferred-work.md`), 5 findings dismissed. Most consequential fix: `clampPosition`'s `margin` sign was inverted relative to its own documented "guaranteed visible sliver" invariant — the formula let content pan `margin` px *further* off-screen than the zero-overlap point instead of stopping short of it, and the test written to prove the invariant was tautological (asserted the buggy formula's own output). Fixed the formula, capped the effective margin at `half` to avoid inverted bounds at extreme zoom-out, and rewrote the tests to assert actual viewport overlap. Also fixed: `scale`/`position` are now derived at render time via `clampScale`/`clampPosition` (not resynced through a `useEffect`, which would have re-tripped the `set-state-in-effect` rule and *did* trip it on the first attempt — fixed by deriving instead of syncing) so a resize/rotation can never leave the view outside its own bounds; the two-finger pinch state machine now resets on every touch-count transition (`onTouchStart` added, plus a native `touchcancel` listener since react-konva doesn't expose one) instead of only on `touchend`, closing the "stuck permanently un-pannable" gap two reviewers found independently; horizontal-only wheel scroll (`deltaY === 0`) no longer spuriously zooms out; `position` now syncs on `onDragEnd` only (not every drag frame), with the extent computation memoized, addressing the AC #1 lag risk; the Room-name overlay got `pointer-events-none`; the Stage container now has `touch-action: none` and is measured directly (not `window.innerWidth/innerHeight`); and `fitScale`/`contentSpan` are floored against a transiently zero-size container. Verified via `pnpm build`, `pnpm lint`, `pnpm test` (92 tests, 90 previous + 2 new NaN-guard cases, plus the rewritten `clampPosition` tests).

### File List

**New:**
- `src/components/canvas/viewport-bounds.ts`
- `src/components/canvas/viewport-bounds.test.ts`

**Modified:**
- `src/components/canvas/room-canvas.tsx` (responsive sizing, controlled scale/position state, wheel + drag + pinch-zoom handlers; code review: render-time clamping instead of an effect, full touch-transition state machine incl. `touchcancel`, `deltaY===0` guard, `onDragEnd`-only position sync, memoized extents, container-measured sizing, `touch-action: none`, degenerate-size floors)
- `src/app/room/[id]/page.tsx` (full-bleed layout, Room name repositioned as a top-left overlay; code review: `pointer-events-none` on the overlay)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-24 | Story implemented: pannable/zoomable Canvas (wheel-zoom, drag-to-pan, two-finger pinch-zoom), bounded relative to each Room's real content extent, full-bleed responsive layout (AC #1–#3) |
| 2026-08-24 | Code review (Opus subagents): 7 patches applied (including an inverted pan-bound sign and a tautological test), 4 items deferred to `deferred-work.md`. Status → done. |
