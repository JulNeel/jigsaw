---
baseline_commit: 8b0e9f2cdaf53a36a7068f517ce603a6521a91cc
---

# Story 3.4: Recenter on the Frame

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Participant who has panned or zoomed away,
I want a one-tap way to snap back to the Frame,
so that I never feel lost in the infinite Canvas.

## Acceptance Criteria

1. A recenter button is always visible in the Canvas (floating overlay, bottom-right corner per `key-salon.html`), regardless of current pan/zoom state.
2. Activating it returns the view to the Frame — the exact same fit-to-content scale/position Story 3.3 already computes for the initial view — regardless of how far the Participant has panned or zoomed away.
3. The button carries an explicit accessible name (e.g. "Recentrer sur le Cadre") and meets the project's chrome-control minimum target size of 24×24px CSS (EXPERIENCE.md Accessibility Floor, WCAG 2.2 SC 2.5.8 — note this is a *lower* floor than the 44×44px used for Story 3.2's tutorial buttons, which are canvas-content-adjacent controls; recenter/mute/invite/sort are explicitly the 24×24px category).

## User-confirmed scope decisions

- **Only the recenter button is built in this story.** `key-salon.html` also shows a mute button and presence avatars in the same corner cluster — neither has its own story anywhere in Epic 3 (mute) or is Epic 4's scope (presence, not built yet). Building either now would be scope creep; this story adds only the recenter button.
- **State access resolved via an imperative handle, not lifting `scale`/`position` state up.** Story 3.3's Dev Notes flagged this exact fork in the road and deliberately left it open: lifting `RoomCanvas`'s pan/zoom state up to `RoomView` would require also lifting `stageSize` measurement and the entire bounds-computation block (fit-scale, `minScale`/`maxScale`, `contentHalfExtent`), turning a single-purpose "add a recenter button" story into a much larger refactor with a wide new prop surface. Instead, `RoomCanvas` is wrapped in `forwardRef` and exposes exactly one imperative method — `recenter()` — via `useImperativeHandle`. This keeps all pan/zoom internals fully encapsulated in `RoomCanvas` (no new props needed for the 99% case) and gives `RoomView` (which already coordinates cross-component signals — see Story 3.2's `onReady`/`canvasReady`) the one capability this story actually needs, nothing more.

## Tasks / Subtasks

- [x] Task 1: Expose an imperative `recenter()` handle from `RoomCanvas` (AC: #2)
  - [x] Convert `RoomCanvas` (`src/components/canvas/room-canvas.tsx`) to use `forwardRef<RoomCanvasHandle, RoomCanvasProps>`. Export a new type: `export type RoomCanvasHandle = { recenter: () => void };`
  - [x] Inside the component, add `useImperativeHandle(ref, () => ({ recenter: () => { setScale(fitScale); setPosition({ x: stageSize.width / 2, y: stageSize.height / 2 }); } }), [fitScale, stageSize])` — this sets exactly the same values the component's own initial `useState(fitScale)`/`useState({x: stageSize.width/2, ...})` seed with, so "recenter" and "the view on first load" are guaranteed to stay the same computation, not two places that could drift apart.
  - [x] Update `src/components/canvas/room-canvas-loader.tsx`: confirmed via `tsc --noEmit` that `next/dynamic`'s return type is a plain `ComponentType<P>` with no `ref` — the predicted fallback was needed: cast the dynamic-loaded component to `ForwardRefExoticComponent<RoomCanvasProps & RefAttributes<RoomCanvasHandle>>` (matches its true runtime type — the underlying component genuinely is `forwardRef`-wrapped, refs do pass through `React.lazy`/`Suspense` at runtime; only the type was missing it), then re-export a thin `forwardRef` wrapper so callers get a correctly-typed ref.
- [x] Task 2: The recenter button (AC: #1, #2, #3)
  - [x] Create `src/components/canvas/recenter-button.tsx` ("use client"): a `Button` (shadcn, `variant="outline"`, matching the mockup's off-white/bordered circular style — see DESIGN.md's established button variants) rendered as a floating circle, absolutely positioned `bottom-6 right-6` (or similar — mirror `key-salon.html`'s `.recenter { bottom:20px; right:20px; width:48px; height:48px; border-radius:9999px }` intent, not its exact pixel values), containing a `Crosshair` icon (`lucide-react`, already a project dependency) sized to match the button, `aria-hidden` (the button's own `aria-label` supplies the accessible name, per Story 3.2's established close-button pattern).
  - [x] Props: `{ onClick: () => void }`. `aria-label` from a new `Tutorial`-sibling-or-existing-namespace translation key (see Dev Notes for exact key/copy) — do not hardcode English or French text inline; every other story's UI copy lives in `messages/fr.json`.
  - [x] Size: explicit `size-12` (48px, matching the mockup) via `className`, comfortably above the 24×24px floor AC #3 requires — do not reuse shadcn `Button`'s built-in `size` prop values verbatim (Story 3.2's code review found none of them reach even the *44px* floor that story needed; 24px is a lower bar, but an explicit `size-12` is simpler than reasoning about which built-in size clears which floor).
- [x] Task 3: Wire the button into `RoomView` (AC: #1, #2)
  - [x] In `src/components/room/room-view.tsx`, add a `canvasRef = useRef<RoomCanvasHandle>(null)`, pass it to `<RoomCanvasClient ref={canvasRef} room={room} onReady={...} />`, and render `<RecenterButton onClick={() => canvasRef.current?.recenter()} />` as a sibling — always visible regardless of `isGuest`/`canvasReady` (AC #1 says "always visible", not "visible once the tutorial has been dismissed" or "Guest-only" — this button is for every Participant, unlike Story 3.2's Guest-only tutorial).
  - [x] The button's fixed bottom-right position and `RoomCanvas`'s own full-bleed `absolute inset-0` container (Story 3.3) naturally coexist — `RoomView`'s render order just needs the button positioned as a sibling within the same relative-positioned ancestor (`RoomPage`'s `relative h-dvh w-full overflow-hidden` container, Story 3.3), the same pattern the Room-name overlay already uses.
- [x] Task 4: Copy (AC: #3)
  - [x] Add a new `Canvas` namespace to `messages/fr.json` (or extend an existing one if more fitting — see Dev Notes) with `recenterAriaLabel`: "Recentrer sur le Cadre" (French, matching the project's fixed-`fr`-locale convention, closely mirroring `key-salon.html`'s own `title="Recentrer la vue sur le Cadre"` annotation and the epics AC's suggested English name translated).
- [x] Task 5: Regression check
  - [x] `pnpm build` — zero TypeScript errors (pay particular attention to the `forwardRef`-through-`dynamic()` typing from Task 1 — this is the one part of this story with real technical uncertainty)
  - [x] `pnpm lint` — clean
  - [x] `pnpm test` — all existing tests pass; no new pure logic is introduced by this story (the recenter computation reuses `fitScale`/`stageSize` exactly as already computed and tested indirectly via Story 3.3's `viewport-bounds.test.ts`), so no new test file is expected
  - [x] **Limitation, documented honestly (same as every story since 1.4):** no headless browser available — the actual button rendering, its always-visible-regardless-of-pan/zoom behavior, and the recenter animation/snap itself can't be verified here. Recommend the user open a Room, pan and zoom away in several directions (including past the point where pieces are barely visible), tap the recenter button each time, and confirm the view reliably returns to the same state; also confirm it doesn't interfere with pan/zoom gestures elsewhere on the Canvas. **Correction (code review, 2026-08-25):** this task originally also asked to confirm the button "remains visible and tappable while the first-access tutorial modal is open" — that was an error in this story's own text. Radix's default modal `Dialog` (Story 3.2) correctly makes background content inert (`aria-hidden`, `pointer-events: none`) while open; the recenter button being unreachable behind an open modal is expected, standard modal semantics, not a bug to verify against.

## Dev Notes

- **Why an imperative handle instead of lifting state — this is the single most consequential decision in this story.** Story 3.3's Dev Notes explicitly reasoned through this fork and deferred it: *"Story 3.4 will need read/write access to this same state... Neither of those is built in this story."* Lifting `scale`/`position` (and therefore also `stageSize`, `fitScale`, `minScale`, `maxScale`, `contentHalfExtent` — all the values that computation depends on) up to `RoomView` would turn this into a wide refactor touching every prop boundary between `RoomView` and `RoomCanvas`, just to add one button. `useImperativeHandle` is the React-sanctioned escape hatch for exactly this shape of problem: a parent needs to *trigger* a specific, narrow action inside a child that otherwise fully owns its own state — not read/write everything.
- **`recenter()` must reuse the exact same `fitScale`/center computation as the initial view, not a duplicate formula.** Both the `useState(fitScale)` seed and the imperative handle's `recenter()` body reference the same `fitScale`/`stageSize` closure variables computed once per render in `RoomCanvas` — there's only one formula, read twice, not two independent formulas that could silently drift out of sync over future edits.
- **Accessibility floor is 24×24px here, not 44×44px** — don't reflexively reapply Story 3.2's 44px fix pattern. EXPERIENCE.md is explicit that recenter/mute/invite/sort controls are the 24×24px WCAG 2.2 SC 2.5.8 category, distinct from touch-target-heavy in-content controls. The mockup's 48px is comfortably above either floor, so this distinction doesn't change the button's actual size — just don't over-justify it by citing the wrong floor in comments/commit messages.
- **`Crosshair` (lucide-react) replaces the mockup's raw "⌖" character** — same reasoning as Story 3.2's code review fix (a hand-rolled Unicode glyph instead of the design system's icon set was flagged and fixed there); use the established icon library from the start this time.
- **This story does not touch presence, mute, or the invite button** — all three appear in the same mockup corner cluster but belong to Epic 4 (presence) or have no story at all yet (mute) or are already served elsewhere (invite, `/create`'s success screen). Resist building any of them "while I'm in here."
- **No new pure/testable logic** — `recenter()` just calls the two existing setters with values already computed (and exercised) by Story 3.3's own render logic; this story's only new testable-in-principle surface (the button component itself) is UI-rendering code, consistent with every prior story's "Canvas/browser-interaction code is integration-level, not unit tested" convention (no `jsdom`/React Testing Library in this repo).
- **Copy namespace choice**: `messages/fr.json` doesn't yet have a `Canvas` namespace — the closest existing one is `RoomView` (used for the Room page's not-found/error states). Either extend `RoomView` or add a new `Canvas` namespace; a new `Canvas` namespace is slightly cleaner since this is Canvas-chrome copy, not page-level error copy, but either is defensible — pick one and be consistent, this isn't worth deliberating over.

### Project Structure Notes

- New: `src/components/canvas/recenter-button.tsx`.
- Modified: `src/components/canvas/room-canvas.tsx` (`forwardRef`/`useImperativeHandle`, new exported `RoomCanvasHandle` type), `src/components/canvas/room-canvas-loader.tsx` (ref-forwarding-compatible typing), `src/components/room/room-view.tsx` (renders `RecenterButton`, holds `canvasRef`), `messages/fr.json` (new `Canvas` namespace or extended `RoomView`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.4-Recenter-on-the-Frame] — story statement and AC source
- [Source: _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md#FR-1] — "Un bouton 'recentrer' est visible en permanence dans l'espace infini"
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md] — Component Patterns "Bouton recentrer" ("Toujours visible ; un tap ramène la vue sur le Cadre quel que soit le pan/zoom courant"); Accessibility Floor's 24×24px WCAG 2.2 SC 2.5.8 category (recentrer/mute/inviter/tri) — distinct from the 44×44px category Story 3.2 used
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/mockups/key-salon.html] — `.recenter` visual spec (48px circle, bottom-right, `title="Recentrer la vue sur le Cadre"`); confirms mute/presence/invite are the same corner cluster but out of this story's scope
- [Source: _bmad-output/implementation-artifacts/3-3-navigate-the-infinite-canvas.md] — established `fitScale`/`stageSize`/pan-zoom-state computation this story reuses verbatim; the story's own Dev Notes explicitly flagging the "lift state vs. imperative handle" decision this story resolves
- [Source: _bmad-output/implementation-artifacts/3-2-first-access-tutorial.md] — `Crosshair`-not-raw-Unicode and icon-library precedent from that story's code review fix; `RoomView`'s existing role as the cross-component coordinator this story extends

## Previous Story Intelligence (from Story 3.3)

- `RoomCanvas`'s current signature is `RoomCanvas({ room, onReady }: { room: RoomDetail; onReady?: () => void })` — this story adds `forwardRef` around it without changing the existing `room`/`onReady` props or their behavior (the `onReady`-fires-once-on-mount contract from Story 3.2 must keep working unchanged).
- `fitScale`, `stageSize`, `contentHalfExtent`, `minScale`, `maxScale` are all computed fresh every render inside `RoomCanvas` (not memoized as a group, though the extent computation itself is `useMemo`'d) — `recenter()`'s `useImperativeHandle` dependency array should include whichever of these it actually closes over (`fitScale`, `stageSize`) so the exposed function always reflects the current Room/viewport, not a stale closure from an earlier render.
- Story 3.3's code review fixed a `set-state-in-effect` violation by deriving `clampedScale`/`clampedPosition` at render time instead of syncing via an effect — `recenter()` doesn't need this treatment since it's an imperative call triggered by a user click (a real event handler), not something that needs to run automatically in response to a dependency change; don't overthink this into needing the same fix.
- The `react-hooks/set-state-in-effect` lint rule has now surfaced in every story since 2.3 that touches `RoomCanvas`-adjacent state except this pattern of "imperative handle calling setState from a real click handler" — which was never the problem shape in the first place (the rule is specifically about effect bodies, and `recenter()` isn't called from an effect). Not expected to recur here, but if it somehow does, the fix is the same as always: derive at render time or trigger from a genuine event/callback, never a synchronous effect body.
- pnpm is the only package manager. 92 tests currently pass (`pnpm test`); this story is expected to add none (see Dev Notes on why).
- `Konva.Stage`'s type (`import type Konva from "konva"`) is already imported in `room-canvas.tsx` for event typing — `RoomCanvasHandle` doesn't need any Konva types itself, it's a plain `{ recenter: () => void }`.

### Review Findings

- [x] [Review][Decision] **RESOLVED (user, 2026-08-25):** `recenter()` reuses Story 3.3's fit-to-content computation, which fits the Frame *and* every scattered piece — not a tight zoom on the Frame alone. A reviewer questioned whether "Recentrer sur le Cadre" over-promises. **User decision: keep the current Frame+scatter behavior** — matches the same view already shown on first load (Story 3.3), and a Participant who feels lost most likely wants their pieces back in view, not just an empty Frame. No code change; button label unchanged.
- [x] [Review][Patch] The button rendered as clickable before the Canvas ever mounts — `canvasRef.current` is `null` until the dynamic-imported `RoomCanvas` resolves, so an early tap silently no-oped with zero feedback. **Fixed**: `RecenterButton` now accepts a `disabled` prop; `RoomView` passes `disabled={!canvasReady}` [src/components/canvas/recenter-button.tsx, src/components/room/room-view.tsx]
- [x] [Review][Patch] `forwardRef` was unnecessary — this project is on React 19.2.8/`@types/react` 19.2.18, where `ref` is an ordinary prop; `forwardRef` is legacy. This also caused the exact "typing gap" the story's Debug Log documented (an unverified `as ForwardRefExoticComponent<...>` cast plus a redundant wrapper the code's own comment admitted wasn't needed). **Fixed**: removed `forwardRef` entirely — `RoomCanvas` now destructures `ref` directly from its props (`RoomCanvasProps` includes `ref?: Ref<RoomCanvasHandle>`), and `room-canvas-loader.tsx` is back to a single plain `dynamic()` call with no cast and no wrapper. Verified via `tsc --noEmit` [src/components/canvas/room-canvas.tsx, src/components/canvas/room-canvas-loader.tsx]
- [x] [Review][Patch] `recenter()` reset `scale`/`position` but left gesture state (`isDraggable`, `lastPinchDistanceRef`) untouched — a Participant stuck with panning disabled by a missed gesture edge case would have the view reset but panning still dead. **Fixed**: `recenter()` now also calls `stageRef.current?.stopDrag()` (so a Konva drag in flight can't later overwrite the recentred position via `onDragEnd`) and `handleTouchTransition(0)` (clears the pinch baseline, restores `isDraggable`) — a full recovery, not just a view reset [src/components/canvas/room-canvas.tsx]
- [x] [Review][Patch] `recenter()` was the only position-writer in the file that didn't route through `clampPosition`, inconsistent with every other call site. **Fixed**: now clamps the fit-view position before applying it, and extracted the fit-view computation itself into a new pure, tested `computeFitView()` in `viewport-bounds.ts` (used both for the initial `useState` seed and `recenter()`) — addresses a review finding that AC #2's "one formula, read twice" guarantee was only structural (two call sites happening to sit near each other), not enforced by any test [src/components/canvas/room-canvas.tsx, src/components/canvas/viewport-bounds.ts, src/components/canvas/viewport-bounds.test.ts]
- [x] [Review][Patch] `recenter-button.tsx`'s comment re-litigated which accessibility floor applies, in the exact style this story's own Dev Notes said not to ("don't over-justify it by citing the wrong floor in comments/commit messages"). **Fixed**: trimmed to one line [src/components/canvas/recenter-button.tsx]
- [x] [Review][Patch] The button's visual spec was flattened in two ways: no shadow (DESIGN.md's `review-accessibility.md` explicitly named the recenter button's shadow as the mitigation for a border/background contrast finding — dropping it left that finding unmitigated), and no `safe-area-inset` handling on a full-bleed mobile canvas (a fixed `bottom-6` sits in the iOS home-indicator gesture zone on some devices). **Fixed**: added `shadow-md` and `bottom-[calc(env(safe-area-inset-bottom)+1.5rem)]` [src/components/canvas/recenter-button.tsx]
- [x] [Review][Patch] The dynamic-import loading placeholder ("Loading canvas…") was hardcoded English in this fixed-`fr` app, in the same file/PR that added a translated `Canvas` namespace one object away. **Fixed**: added `Canvas.loading`, placeholder now translated [src/components/canvas/room-canvas-loader.tsx, messages/fr.json]
- [x] [Review][Dismiss] Button not visible/tappable while Story 3.2's tutorial modal is open — correct, expected Radix modal semantics (background is legitimately inert while a modal `Dialog` is open); this story's own Task 5 verification instruction asking to confirm otherwise was the actual error, corrected above, not a code defect [src/components/room/room-view.tsx]
- [x] [Review][Dismiss] `next/dynamic`'s static helpers (e.g. `.preload`) no longer directly reachable through a wrapper — moot now that the `forwardRef` removal also removed the wrapper; no caller in this codebase uses `RoomCanvasClient.preload` today [src/components/canvas/room-canvas-loader.tsx]
- [x] [Review][Defer] `stageSize` has no `ResizeObserver` — only an initial measure plus a `window.resize` listener (pre-existing from Story 3.3), so a container-size change not accompanied by a window resize (layout shift, a future sidebar) would leave `stageSize`, and therefore `recenter()`'s target, computed from stale dimensions. Pre-existing limitation this story inherits rather than introduces; revisit if it becomes a real reported issue [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] `measure()` calls `setStageSize` with a fresh object on every `resize` event regardless of whether dimensions actually changed, forcing a full re-render (mobile browsers fire `resize` often — URL-bar collapse, keyboard show/hide). Pre-existing from Story 3.3; a cheap bail-out (skip `setState` when width/height are unchanged) is a reasonable follow-up, not urgent [src/components/canvas/room-canvas.tsx]
- [x] [Review][Defer] No `aria-live` announcement or focus management confirms the recenter action to assistive-tech users (a silent, instantaneous jump on a `<canvas>`), and no hover tooltip (the mockup's `title` attribute was dropped). Real accessibility polish, but no `Tooltip` component exists in this codebase yet (would need its own shadcn scaffold, like `Dialog` was for Story 3.2) — bundle with the already-deferred "no keyboard pan/zoom path" a11y gap from Story 3.3 rather than a one-off fix here [src/components/canvas/recenter-button.tsx]

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- The anticipated `forwardRef`-through-`dynamic()` typing gap did occur, exactly as flagged: `tsc --noEmit` reported `Property 'ref' does not exist on type 'IntrinsicAttributes & RoomCanvasProps'` on `next/dynamic`'s returned component. Resolved with the story's own documented fallback — cast the dynamic-loaded component to its true runtime type (`ForwardRefExoticComponent<RoomCanvasProps & RefAttributes<RoomCanvasHandle>>`) and re-export a thin `forwardRef` wrapper. `pnpm build`'s TypeScript pass is clean.
- No `react-hooks/set-state-in-effect` issue, as predicted — `recenter()` is only ever invoked from a real click handler, never an effect body.

### Completion Notes List

- `src/components/canvas/room-canvas.tsx` — `RoomCanvas` converted to `forwardRef<RoomCanvasHandle, RoomCanvasProps>`, exposing `recenter()` via `useImperativeHandle`. `recenter()` reuses the exact same `fitScale`/`stageSize`-derived values the component's own initial state seeds with — one formula, read twice.
- `src/components/canvas/room-canvas-loader.tsx` — `RoomCanvasClient` now forwards a typed ref through to the dynamically-loaded `RoomCanvas`, via a cast to the dynamic component's true runtime type plus a thin `forwardRef` re-export.
- `src/components/canvas/recenter-button.tsx` — new floating circular button (48px, `Crosshair` icon, French `aria-label`), bottom-right overlay per the mockup.
- `src/components/room/room-view.tsx` — holds `canvasRef`, passes it to `RoomCanvasClient`, renders `RecenterButton` as an always-visible sibling (not gated by `isGuest`/`canvasReady`, unlike the Guest-only tutorial).
- `messages/fr.json` — new `Canvas` namespace, `recenterAriaLabel`: "Recentrer sur le Cadre".
- No mute button, presence, or invite control added — explicitly out of scope per this story's own scope decisions.
- All ACs satisfied: #1 (always-visible floating button, any pan/zoom state), #2 (recenter reuses Story 3.3's own fit-to-content computation exactly), #3 (explicit French accessible name, 48px — comfortably above the 24×24px floor this control category actually needs, per EXPERIENCE.md).
- `pnpm build`/`pnpm lint` clean; `pnpm test` — 92 tests passing, unchanged (no new pure logic — `recenter()` reuses already-tested computations).
- **Limitation, documented honestly (same as every story since 1.4):** no headless browser available — the button's actual rendering, click behavior, and the recenter snap itself couldn't be visually verified here. Recommend the user open a Room, pan/zoom away in multiple directions, tap the button each time, and confirm the view reliably returns to the same state.

**Code review round (2026-08-25, Opus subagents):** 1 decision resolved (user: keep Frame+scatter recenter behavior), 7 patches applied, 3 items deferred (logged in `deferred-work.md`), 2 findings dismissed. Most consequential fix: removed `forwardRef` entirely — this project runs React 19.2.8, where `ref` is an ordinary prop, and `forwardRef` was the direct cause of the "typing gap" the first pass had to work around with an unverified cast plus a redundant wrapper (the wrapper's own comment admitted it wasn't needed). `RoomCanvas` now destructures `ref` straight from its props; the loader is back to a single plain `dynamic()` call. Also fixed: the button was clickable before the Canvas mounted, silently no-op-ing (`disabled={!canvasReady}` added); `recenter()` didn't reset gesture state, so a Participant stuck mid-gesture could tap "get me back" and still be unable to pan (`stopDrag()` + pinch-baseline reset added); the fit-to-content formula was extracted into a new pure, unit-tested `computeFitView()` (closing a gap where the "one formula, read twice" guarantee was only structural, not enforced); a DESIGN.md-mandated shadow (an explicit accessibility-review mitigation) and `safe-area-inset` handling were both missing from the button; and the dynamic-import loading placeholder was untranslated English in this French-only app. One dismissed finding corrected an error in this story's own text (asking to verify the button stays tappable behind an open modal — that's not a bug, it's how modals work). Verified via `pnpm build`, `pnpm lint`, `pnpm test` (95 tests, 92 previous + 3 new `computeFitView` cases).

### File List

**New:**
- `src/components/canvas/recenter-button.tsx`

**Modified:**
- `src/components/canvas/room-canvas.tsx` (imperative `recenter()` handle via a plain `ref` prop — no `forwardRef`; full gesture-state recovery; uses the new `computeFitView()`)
- `src/components/canvas/room-canvas-loader.tsx` (plain `dynamic()`, no cast/wrapper needed; translated loading placeholder)
- `src/components/canvas/viewport-bounds.ts` (new `computeFitView()`)
- `src/components/canvas/viewport-bounds.test.ts` (new `computeFitView` tests)
- `src/components/room/room-view.tsx` (holds `canvasRef`, renders `RecenterButton` with `disabled={!canvasReady}`)
- `messages/fr.json` (new `Canvas` namespace: `recenterAriaLabel`, `loading`)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-24 | Story implemented: always-visible recenter button, `RoomCanvas` exposes an imperative `recenter()` handle reusing Story 3.3's fit-to-content computation (AC #1–#3) |
| 2026-08-25 | Code review (Opus subagents): 1 decision resolved, 7 patches applied (including removing an unnecessary `forwardRef`), 3 items deferred to `deferred-work.md`. Status → done. |
