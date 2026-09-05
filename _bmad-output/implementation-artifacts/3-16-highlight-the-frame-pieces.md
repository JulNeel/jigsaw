baseline_commit: NO_VCS

# Story 3.16: Highlight the frame pieces

Status: ready-for-dev

## Story

As a Participant,
I want a way to see at a glance which pieces are frame pieces (the ones that belong on the Frame's outer border),
so that I can sort them out from the pile the way I would with a physical puzzle's edge pieces.

## Acceptance Criteria

1. **Given** a Room with any mix of loose, mid-drag, fused (Îlot), and Frame-locked pieces, **when** a Participant activates the "highlight frame pieces" toggle button, **then** every piece that is *not* a frame piece (an "interior" piece, per the existing `PieceShapeType` grid-position classification) visually dims, while every corner/edge ("frame") piece stays at full visibility.
2. Deactivating the toggle (a second press) immediately restores every piece to full visibility.
3. This is purely a client-side visual aid — it never affects placement/fusion validation, dragging, clicking, or any other interaction; a dimmed piece remains fully interactive.
4. The button's own on/off state is clearly visible at a glance (e.g., a pressed/active visual state).
5. A piece arriving or changing via Realtime (moved, placed, or fused by another Participant) immediately respects whatever the toggle's current state already is, with no need to re-toggle.

**Note — scope decision (2026-09-05), confirmed with the user before this story was written:** interaction is a **toggle** (stays active until pressed again), not press-and-hold like Story 3.14's reference-image button — sorting out every frame piece from a pile is a task that takes real time, unlike a quick glance at the source image. The toggle's state is deliberately **not persisted** (resets to off on reload) — a transient work aid, not a durable preference like sound-mute (`useSoundMuted`); revisit only if real usage shows a need to persist it.

## Tasks / Subtasks

- [ ] Task 1: Thread a `highlightFramePieces` flag down to every rendered piece (AC: #1, #3, #5)
  - [ ] `src/lib/rooms/get-room-by-slug.ts` already computes and returns `shapeType: PieceShapeType` (`"corner" | "edge" | "interior"`, `src/lib/piece-cutting/classify-piece-shape.ts`) on every `RoomDetailPiece` — no new data/query needed at all. A piece is a "frame piece" exactly when `piece.shapeType !== "interior"`.
  - [ ] `src/components/canvas/room-canvas.tsx`'s `PieceSprite` (~L247-330, the shared leaf renderer both `SoloPieceSprite` and `ClusterGroupSprite` use for every individual piece) gets a new optional prop, e.g. `dimmed?: boolean`, applied as `opacity: dimmed ? INTERIOR_PIECE_DIMMED_OPACITY : 1` on its `groupProps` (~L298-310, the same object already carrying `x`/`y`/`rotation`/`draggable`/drag handlers/`clipFunc` onto the Konva `<Group>` — Konva `Group` supports `opacity` natively). New constant `INTERIOR_PIECE_DIMMED_OPACITY` (e.g. `0.2` — reasonable default, not spec-mandated, tune visually), declared alongside this file's other visual constants (`PLACEMENT_PULSE_*`, ~L56-59).
  - [ ] `SoloPieceSprite`/`ClusterGroupSprite` each gain a new `highlightFramePieces: boolean` prop, computing `dimmed={highlightFramePieces && piece.shapeType === "interior"}` per piece when rendering `PieceSprite` — for `ClusterGroupSprite`, this is evaluated *per member* (an Îlot can genuinely mix a frame piece and an interior piece fused together), not once for the whole Cluster.
  - [ ] `RoomCanvas` (~L1200) gains its own new prop `highlightFramePieces: boolean` (see Task 2 for why this is a plain prop, not internal state or an imperative-handle method like `recenter()`), passed straight through to both `SoloPieceSprite`/`ClusterGroupSprite` at their JSX call sites (~L1908-1950).
  - [ ] Since dimming is derived at render time directly from each `RoomDetailPiece.shapeType` + the boolean flag — never cached, never computed only once at drag-start or fuse-time — a piece that arrives, moves, or re-fuses via Realtime automatically renders with the correct dim state on its very next render, satisfying AC #5 with no extra plumbing.

- [ ] Task 2: Lift the toggle's state to `RoomView` and add the button (AC: #2, #4)
  - [ ] **Read `src/components/room/room-view.tsx` and `src/components/canvas/room-canvas.tsx`'s `RoomCanvasHandle`/`RoomCanvasProps` (~L1190-1200) before touching either.** `RecenterButton` reaches into `RoomCanvas` via an *imperative* ref handle (`recenter()`) specifically because `RoomCanvas` owns pan/zoom state internally with no need for `RoomView` to ever read or display it back. This toggle is different: the *button itself* must visibly reflect whether it's currently active (AC #4), which means `RoomView` needs to read the current boolean to render the button's own pressed/active styling — an imperative-only method can't feed a value back up for rendering. Use ordinary lifted React state instead: `const [highlightFramePieces, setHighlightFramePieces] = useState(false)` in `RoomView`, passed down to `RoomCanvasClient`/`RoomCanvas` as a new prop (Task 1) and to the new button as `active`/`onToggle`.
  - [ ] New component `src/components/canvas/highlight-frame-pieces-button.tsx`, following `RecenterButton`/`SoundMuteButton`/`ReferenceImageButton`'s exact established overlay convention (plain DOM `Button`, absolutely positioned sibling of the Canvas, same `right-6` column) — stacked one slot further up again, e.g. `bottom-[calc(env(safe-area-inset-bottom)+13.5rem)]` (`ReferenceImageButton` sits at `+9.5rem`).
  - [ ] A real toggle button: `aria-pressed={active}` (same accessible pattern `create-room-form.tsx`'s library-image selection already uses, not two different aria-labels the way `SoundMuteButton` does it) plus a visibly different `variant` when active (e.g. `variant={active ? "default" : "outline"}`, reusing the `Button` component's own existing variants rather than inventing new styling) so AC #4 doesn't rely on `aria-pressed` alone for sighted users.
  - [ ] Pick a `lucide-react` icon distinct from every icon already used on this stack (`Crosshair`, `Volume2`/`VolumeX`, `ImageIcon`) — check the installed `lucide-react` version's actual icon list before choosing (do not assume a name exists), something evoking a puzzle frame/border.
  - [ ] New `aria-label` translation key in `messages/fr.json`'s `Canvas` section, e.g. `"highlightFramePiecesAriaLabel": "Repérer les pièces de cadre"` — one static label plus `aria-pressed` is the correct accessible pattern for a toggle (per this task's own note above), not two state-dependent labels.
  - [ ] Wire into `RoomView` as a new sibling alongside the other three overlay buttons, passing the lifted `highlightFramePieces` state down to `RoomCanvasClient` and `active`/`onToggle={() => setHighlightFramePieces((v) => !v)}` to the new button.

- [ ] Task 3: Regression + manual verification (AC: all)
  - [ ] `pnpm build && pnpm lint && pnpm test` clean.
  - [ ] Manual verification (this repo has no canvas/visual-regression or component-testing infrastructure, consistent with every other Canvas-interaction story this session): (1) activate the toggle and confirm every loose interior piece dims while every loose corner/edge piece stays fully visible; (2) confirm a Cluster/Îlot mixing a frame piece and an interior piece dims only the interior member; (3) confirm a piece already locked into the Frame also dims/stays visible correctly per its own `shapeType`; (4) confirm dragging, clicking (rotate), and dropping a dimmed piece still works exactly as before — the dim is purely visual; (5) deactivate the toggle and confirm every piece instantly returns to full visibility; (6) with two browser sessions in the same Room, toggle it on in one session only and confirm the *other* session's own pieces are unaffected (this is deliberately local-only UI state, not synced Room state) while a piece one Participant moves still renders with the *other* Participant's own current toggle state correctly applied.

## Dev Notes

### `PieceShapeType` — already exactly what this story needs, no new classification logic

`src/lib/piece-cutting/classify-piece-shape.ts`'s `classifyPieceShape` (`row === 0 || row === rows - 1` for a row boundary, same for columns) already produces exactly the "frame piece" vs "interior piece" distinction this story needs — `"corner"` and `"edge"` are both boundary/frame pieces, only `"interior"` is not. This is computed server-side once, at Room-creation/read time, and already flows through `get-room-by-slug.ts` into `RoomDetailPiece.shapeType` (confirmed present, no query change needed) — this story is purely a rendering concern layered on top of data that already exists.

### Why this is lifted `useState` in `RoomView`, not a `RoomCanvasHandle` method

Contrast with `RecenterButton` (`src/components/canvas/recenter-button.tsx`): recentering is a one-shot imperative action with no persistent visual state the button itself needs to reflect, so `RoomCanvas` keeps pan/zoom state fully internal and exposes only a bare `recenter()` call via `useImperativeHandle`. This story's toggle is fundamentally different — AC #4 requires the *button* to visibly show whether highlighting is currently on, which means the boolean must live somewhere `RoomView` can read it for rendering, not just imperatively invoke. Lifting it to ordinary `useState` in `RoomView` (mirroring `canvasReady`'s own existing pattern in that same file) and passing it down as a plain prop is simpler and more correct here than extending the imperative-handle pattern with a getter, which React's ref model doesn't support cleanly for reactive rendering anyway.

### Per-member dimming inside a Cluster, not per-Cluster

`ClusterGroupSprite` renders each fused piece as its own child `PieceSprite` (`members.map(...)`, each with its own `piece` prop) — the dimming decision must be evaluated per member's own `shapeType`, exactly like every other per-piece property already is in that loop (`clusterOffsetRow`/`clusterOffsetCol`, `draggable={false}`). Do not compute a single "is this whole Cluster a frame Cluster" boolean — a genuinely mixed Cluster (one frame piece + one interior piece fused together) is a normal, expected case (Story 3.8/3.9's fusion rule is adjacency-based, not shape-based), and AC #1 explicitly requires per-piece dimming regardless of clustering.

### Reduced-motion / accessibility note

This is a static opacity change, not an animation (unlike the placement pulse or Frame-completion glow, which already respect `prefers-reduced-motion` — see `FrameCompletionGlow`'s own comment) — no reduced-motion gating is needed here, since there's no motion to reduce, only a persistent visual state change.

### Project Structure Notes

- New file: `src/components/canvas/highlight-frame-pieces-button.tsx` — mirrors the existing three overlay buttons' shape/positioning convention exactly.
- Modified: `src/components/canvas/room-canvas.tsx` (new `INTERIOR_PIECE_DIMMED_OPACITY` constant, `PieceSprite`'s new `dimmed` prop, `SoloPieceSprite`/`ClusterGroupSprite`'s new `highlightFramePieces` prop, `RoomCanvasProps`'s new `highlightFramePieces` prop), `src/components/room/room-view.tsx` (lifted `highlightFramePieces` state, new button wired in), `messages/fr.json` (new translation key).
- No schema/migration/Server Action/query changes of any kind — `shapeType` already exists end-to-end.

### Testing standards summary

- This is a plain-DOM toggle button plus a Konva `opacity` prop — no new pure/testable business logic is introduced (unlike Story 3.15's `computeAutoscrollVelocity`); consistent with `RecenterButton`/`SoundMuteButton`/`ReferenceImageButton` having no direct automated tests either. Rely on Task 3's manual verification.

## Previous Story Intelligence (from this session's own recent work)

- Story 3.14 (reference image) established the plain-DOM overlay-button convention this story's Task 2 follows exactly, including the `right-6` corner-stack positioning pattern and the "one static aria-label, state conveyed via `aria-pressed`/icon" accessibility approach (though 3.14 itself used a press-and-hold pattern with no `aria-pressed`, its sibling `SoundMuteButton` and `create-room-form.tsx`'s library-image selection both already demonstrate this codebase's two established toggle-state patterns — this story picks the `aria-pressed` one, matching library-image selection, since a single stable label reads more naturally here than `SoundMuteButton`'s two-different-labels approach).
- Story 3.15's own Dev Notes are a reminder that this Canvas component's imperative/Konva-adjacent code deserves careful reading before editing — this story is comparatively much simpler (a static `opacity` prop, no gesture/RAF loop), but `PieceSprite`/`SoloPieceSprite`/`ClusterGroupSprite`'s prop-threading conventions should still be read in full before adding new props, to match existing naming/shape exactly.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.16] — this story's own definition, added 2026-09-05.
- [Source: src/lib/piece-cutting/classify-piece-shape.ts] — the existing `PieceShapeType` classification this story reuses as-is.
- [Source: src/lib/rooms/get-room-by-slug.ts] — confirms `shapeType` already flows to the client on every `RoomDetailPiece`, no query change needed.
- [Source: src/components/canvas/room-canvas.tsx] — `PieceSprite` (~L247-330), `SoloPieceSprite`/`ClusterGroupSprite`'s per-piece rendering loops, `RoomCanvasHandle`/`RoomCanvasProps` (~L1190-1200).
- [Source: src/components/canvas/recenter-button.tsx, src/components/canvas/sound-mute-button.tsx, src/components/canvas/reference-image-button.tsx, src/components/room/room-view.tsx] — the established overlay-button convention and the imperative-handle-vs-lifted-state distinction this story's Task 2 reasons about explicitly.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-05 | Story created: a toggle button that dims every non-frame ("interior") piece, reusing the already-existing `PieceShapeType` classification with no new data/query needed. Interaction chosen as an on/off toggle (not press-and-hold) per user decision, with no state persistence across reloads. |
