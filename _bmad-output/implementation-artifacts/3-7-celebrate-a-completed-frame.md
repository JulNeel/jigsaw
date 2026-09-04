---
baseline_commit: NO_VCS
---

# Story 3.7: Celebrate a completed Frame

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Participant in a Room,
I want the whole household to see the puzzle's completion celebrated,
so that finishing the Frame feels like a shared achievement, not just another placement.

## Acceptance Criteria

1. Given a Room where the number of placed pieces reaches the total piece count (`gridRows × gridCols`), when the last piece locks in, then a distinct celebration triggers: an electronic "victory" sound (PRD §6: "son plus électronique, à connotation victoire," distinct from Story 3.6's organic wood-click) plus a dedicated animation, visibly different from ordinary placement feedback.
2. No additional check against the source image is performed to trigger it — reaching the total piece count is sufficient (the cutting algorithm's per-piece uniqueness already guarantees a correct solution; EXPERIENCE.md: "l'unicité des découpes garantit la solution correcte").
3. The celebration is visible to every Participant present in the Room at that moment, not only the one who placed the last piece — same collaborative principle Story 3.6 establishes for ordinary placement (AC #5 there).
4. The celebration copy follows the factual-but-warm Voice and Tone (e.g. "Le puzzle est terminé — bravo à tout le Salon"), never gamification-style copy ("🏆 VICTOIRE ! Score final : 1000/1000") — UX-DR16.
5. The celebration also fires an `aria-live="polite"` announcement (same accessibility floor Story 3.6 established) and never depends on sound alone — a screen-reader user and a muted Participant both still perceive it.
6. The celebration fires at most once per Room, ever — a completed Frame stays completed forever (no un-place mechanic exists anywhere in this app), and a Participant who joins or refreshes *after* completion must never see it replay.

## User-confirmed scope decisions (2026-09-02)

- **Reuses Story 3.6's mute preference — no second mute control.** FR-14 covers placement feedback broadly (PRD §6 groups the organic wood-click and the electronic victory sound under the same "Feedback de placement" heading); introducing a separate celebration-specific mute toggle would be exactly the kind of parallel-state surface AD-1's "no parallel channel" spirit already argues against for cosmetic preferences. `useSoundMuted` gates the victory sound exactly like it gates the placement sounds.
- **Completion detection must be confirmed-only, never derived from the optimistically-blended `pieces` snapshot.** Story 3.6's first code-review round hit exactly this bug class for ordinary placement feedback (firing on an optimistic guess that could still be rejected) and had to rebuild detection on a confirmed-only Realtime event (`piece-placement-events.ts`). Frame completion is *more* consequential to get wrong this way than a single piece's feedback — a false "the puzzle is complete!" celebration triggered by a since-rejected optimistic placement, visible to the whole Room, is a much louder mistake than one piece's wood-click misfiring. This story's completion detection must be built the same confirmed-only way from the start, not learned the hard way again.
- **Fires from the same shared Realtime state every client already syncs — no new subscription, no server-side "is this Room complete" flag/column.** Every client already receives every confirmed `piece` row via the existing `postgres_changes` channel (AD-1); counting confirmed placements client-side against `gridRows × gridCols` is sufficient and avoids a schema change for a value trivially derivable from data already present.
- **"At most once, ever" is enforced by tracking whether the Room was *already* complete at the moment this client's collections were created** (from the Server Component's initial snapshot), not by any new persisted "already celebrated" flag. A Participant loading an already-completed Room must never see the celebration replay — only a transition from incomplete to complete, observed live during this client's session, fires it.
- **The dedicated animation is a full-Frame gold (`accent`, `#A67518`) glow/pulse — distinct in scale, color, and duration from Story 3.6's per-piece `PlacementPulse`.** DESIGN.md reserves `accent` gold specifically for "présence en direct... et moments de complétion," explicitly *not* for placement (Story 3.6's per-piece pulses use terracotta `primary` for success, plus the newer green/red/orange status set — none of which is `accent`). Reusing `accent` here, and *only* here, is what makes this celebration read as visually distinct at a glance, per AC #1's "visibly different" requirement.

## Tasks / Subtasks

- [x] Task 1: Confirmed-only Frame-completion detection (AC: #1, #3, #6)
  - [x] `src/lib/db/collections.ts`'s `createRoomCollections` gained a `totalPieceCount: number` param (`room.gridRows * room.gridCols`, computed by `RoomCanvas`). Tracks a `confirmedPlacedCount` counter, seeded from `initialPieces.filter(p => p.placedRow != null).length`; `alreadyCompleteAtMount = confirmedPlacedCount >= totalPieceCount` computed at creation time (AC #6 — never fires for a Room already complete when this client connected).
  - [x] `pieceHandler`'s Realtime callback increments `confirmedPlacedCount` on the exact same `placedRow` null→non-null transition `emitPiecePlaced` already detects (not recomputed separately). Calls `emitFrameComplete()` exactly once, guarded by `!alreadyCompleteAtMount && !hasFiredCompletion`.
  - [x] New `src/lib/rooms/frame-completion-events.ts` — `emitFrameComplete()`/`subscribeFrameComplete(listener)`, mirroring `piece-placement-events.ts`'s pub-sub idiom exactly.
- [x] Task 2: Synthesized "electronic victory" sound (AC: #1)
  - [x] `src/lib/audio/play-tone.ts`: new `playVictorySound()` — a 4-note ascending square-wave arpeggio (C5-E5-G5-C6), deliberately more "electronic" than the sine-based wood-click/success-chime pair. Gated by `useSoundMuted` at the call site, no new mute control.
- [x] Task 3: Dedicated full-Frame celebration animation (AC: #1)
  - [x] `room-canvas.tsx`: new `FrameCompletionGlow` component — a full-Frame-rectangle gold (`accent`, `#A67518`) glow/pulse via `Konva.Tween`, 1.2s duration (vs. `PlacementPulse`'s 0.32s), same scale+fade idiom. Respects `prefers-reduced-motion`, checked at trigger time.
  - [x] Triggered by one `subscribeFrameComplete` subscription in `RoomCanvas`, driving the sound, the glow, and the announcement together.
- [x] Task 4: `aria-live` announcement with factual-but-warm copy (AC: #4, #5)
  - [x] New `Canvas.frameCompleteAnnouncement` key in `messages/fr.json`: "Le puzzle est terminé — bravo à tout le Salon." (EXPERIENCE.md's example, verbatim).
  - [x] Reuses the existing `announce()` helper/`aria-live="polite"` region from Story 3.6 — no second announcement mechanism.
- [x] Task 5: Regression check
  - [x] `pnpm build`/`pnpm lint` clean.
  - [x] `pnpm test` — 178 tests pass (23 files, was 173); new tests for `victorySoundEnvelope` (7 tests, mirroring `play-tone.test.ts`'s existing pattern); existing suite unaffected. The completion-counting logic lives inline in `collections.ts` (not extracted into a separately pure-testable function) — it's a handful of lines reusing `emitPiecePlaced`'s own already-tested transition-detection, not novel logic worth its own module.
  - [x] **Limitation, documented honestly (same as every story since 1.4):** no headless browser available — the actual sound/animation firing, and the cross-Participant "everyone sees it, only once, never on reload" behavior, can't be verified here. Recommend the user open the same Room in two browser sessions, place the final piece in one, and confirm: both sessions play the sound/animation exactly once; a third session that opens the Room *after* completion does not see it replay; muting one session doesn't mute the other's sound but the visual celebration still shows in both regardless of mute.

## Dev Notes

### Why this is the highest-stakes place yet to get "confirmed vs. optimistic" wrong

Every prior placement-feedback bug this session traced back to the same root cause: detecting an event from the *optimistically*-blended `pieces` snapshot instead of a genuinely server-confirmed one. For a single piece's sound, the blast radius of getting this wrong was one Participant hearing one wrong click. For Frame completion, the exact same category of bug would mean the *entire Room* sees "🎉 the puzzle is finished!" trigger off a placement that the server is about to reject — a far more visible, far more confusing mistake. Build the confirmed-only detection first, correctly, rather than shipping an optimistic version and discovering this the same way twice.

### What already exists to build on

- `src/lib/rooms/piece-placement-events.ts` and `src/lib/rooms/placement-conflict-events.ts` are the two existing instances of the "module-level pub-sub, emitted only from `collections.ts`'s Realtime sync handler" pattern this story's `frame-completion-events.ts` should mirror exactly — read both before writing the new one.
- `src/lib/audio/play-tone.ts` already has the established synthesis conventions (a shared, lazily-created `AudioContext`, guarded construction/resume, an `*Envelope` constants object per sound for testability) — `playVictorySound` should follow the same shape, not invent a new one.
- `room-canvas.tsx`'s `PlacementPulse` component and its `prefers-reduced-motion` handling (checked at trigger time, not subscribed reactively) is the direct template for the new full-Frame glow component — same idiom, different scale/color/duration.
- `room-canvas.tsx` already has an `announce()` helper (a toggled trailing zero-width space, so two announcements with identical text still both get read by screen readers — a real bug Story 3.6's second review round found and fixed) — reuse it, don't reinvent.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.7: Celebrate a completed Frame] — canonical AC text.
- [Source: _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md#6. Aesthetic & Tone] — "Complétion d'un Îlot ou moment de contribution marquant : son plus électronique, à connotation 'victoire'" — note this PRD line is actually broader (any "significant contribution moment"), but this story's scope is narrowed to Frame completion specifically, per epics.md's own AC text (spines/epics win over PRD in case of scope tension, per this project's established doc hierarchy).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#State Patterns] — "Cadre complet" row: exact trigger condition, "pas de second contrôle contre l'image," the "Le puzzle est terminé — bravo à tout le Salon" copy example.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/DESIGN.md#Colors] — `accent` (`#A67518`) reserved for "présence en direct... et moments de complétion," explicitly never for placement — the visual basis for AC #1's "visibly different" requirement.
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR16] — factual-but-warm Voice and Tone register, explicit anti-gamification example.

## Previous Story Intelligence (from Story 3.6/3.11)

- Story 3.6's own two code-review rounds are the single most relevant precedent for this story: read its Change Log in full (`3-6-placement-feedback.md`) before implementing, specifically the entries about the optimistic-vs-confirmed detection bug and its fix (`piece-placement-events.ts`) — this story is that same pattern, one level up (Frame-wide instead of per-piece).
- `useSoundMuted`'s module-level cache + subscriber set (shared across every component instance in the tab) is the established pattern for "one mute preference, read from multiple places" — reuse it directly, don't add a parallel preference.
- This codebase's established pattern for synthesizing sounds without asset files (`play-tone.ts`) and for `prefers-reduced-motion`-aware Konva animations (`PlacementPulse`) — both direct templates, described above.
- No server-side changes are anticipated for this story (same as 3.6) — completion is derived entirely from data every client already receives; no schema change, no new Server Action.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via Claude Code.

### Debug Log References

None — every step passed cleanly (lint/build/test all green each time they were run).

### Completion Notes List

- All 6 ACs implemented as a purely client-side, purely-additive layer over data every client already syncs — no Server Action, schema, or migration touched, matching this story's own Dev Notes anticipation and Story 3.6/3.11's precedent.
- Applied Story 3.6's own hard-won lesson from the start instead of relearning it: completion detection is built confirmed-only from `collections.ts`'s Realtime handler, reusing the exact same `placedRow` null→non-null transition `emitPiecePlaced` already detects — never derived from the optimistically-blended `pieces` snapshot `useLiveQuery` exposes to components.
- `alreadyCompleteAtMount` (seeded once at `createRoomCollections` creation time) is what guarantees AC #6: a Participant loading an already-finished Room never sees the celebration replay, since the emit only ever fires on a live incomplete→complete transition observed during this client's own session.
- The victory sound (`playVictorySound`, a 4-note square-wave arpeggio) is deliberately a different waveform (square, not sine) from both the wood-click (filtered noise) and the success chime (sine sweep) — this is what makes it read as "more electronic," per PRD §6's own explicit contrast, without needing a filter or any DSP beyond a gain envelope.
- `FrameCompletionGlow` reuses `PlacementPulse`'s exact `Konva.Tween` scale+fade idiom rather than inventing a new animation technique — only the target rectangle (the whole Frame, not one tile), color (`accent` gold, never used for placement), and duration (1.2s vs. 0.32s) differ, which is precisely what makes it read as visibly distinct (AC #1) while staying consistent with the rest of the codebase's animation conventions.
- `pnpm build`/`pnpm lint`/`pnpm test` all clean (178 tests, 23 files). Per Task 5's own documented limitation, the actual sound/animation firing and the cross-Participant/no-replay-on-reload behavior need manual two-browser-session verification — not verifiable here (no headless browser).

### File List

- `src/lib/rooms/frame-completion-events.ts` (new; post-review: added pure `shouldFireFrameComplete()` helper)
- `src/lib/rooms/frame-completion-events.test.ts` (new, post-review: unit tests for `shouldFireFrameComplete()`)
- `src/lib/audio/play-tone.ts` (modified: new `playVictorySound()`/`victorySoundEnvelope`)
- `src/lib/audio/play-tone.test.ts` (modified: new tests for `victorySoundEnvelope`)
- `src/lib/db/collections.ts` (modified: `totalPieceCount` param, confirmed-placed-count tracking, `emitFrameComplete()` call; post-review: delegates the fire decision to `shouldFireFrameComplete()`)
- `src/components/canvas/room-canvas.tsx` (modified: `createRoomCollections` call site passes `totalPieceCount`; new `FrameCompletionGlow` component; `subscribeFrameComplete` subscription driving sound/glow/announcement; post-review: subscription moved to `useLayoutEffect`)
- `messages/fr.json` (modified: `Canvas.frameCompleteAnnouncement`)

## Change Log

| Date | Change |
|------|--------|
| 2026-09-02 | Implemented Story 3.7 (Celebrate a completed Frame): confirmed-only Frame-completion detection (`frame-completion-events.ts`, mirroring Story 3.6's `piece-placement-events.ts` pattern), a synthesized electronic "victory" arpeggio distinct from ordinary placement sounds, a full-Frame gold `Konva.Tween` glow distinct from per-piece pulses, and a factual-but-warm `aria-live` announcement reusing Story 3.6's existing mechanism. Fires at most once per Room, for every Participant present, never replayed for a Participant joining after completion. No server-side changes. |
| 2026-09-03 | Code review follow-up: closed a `useMemo`-vs-`useEffect` subscription race that could silently drop the one-time celebration (switched to `useLayoutEffect`); extracted the "fire exactly once" decision into a pure, unit-tested `shouldFireFrameComplete()` helper. See Review Findings below. |

## Review Findings (2026-09-03)

Three parallel review layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) examined this story's confirmed-only completion-detection logic, independently converging on the same core race.

**Patched:**
1. **Subscription race could silently drop the celebration** (Blind Hunter + Edge Case Hunter, independently). `createRoomCollections` opens the Realtime channel synchronously inside `useMemo` (render phase); the UI's `subscribeFrameComplete` listener was only registered in a `useEffect`, which runs after paint — a real gap where an already-arrived completion event has no listener to reach. Fixed by moving that subscription to `useLayoutEffect`, which commits synchronously in the same phase as the `useMemo` that opened the channel, leaving no point where the event loop could deliver the WebSocket message in between.
2. **No test coverage for the "exactly once, ever" invariant** (Blind Hunter + Acceptance Auditor, independently — directly contradicting this story's own Dev Notes framing of this as the highest-stakes logic in the feature). Extracted the counting/guard decision out of `collections.ts`'s Realtime handler into a pure `shouldFireFrameComplete()` (`frame-completion-events.ts`), with dedicated unit tests covering: normal threshold-crossing, not-yet-complete, already-complete-at-mount (no replay for late joiners), already-fired-this-session (no double-fire), and a burst of confirmations crossing the threshold together.

**Deferred** (added to `deferred-work.md`): a dropped/delayed Realtime message can permanently undercount `confirmedPlacedCount` for one client, who would then never see the celebration even though the Frame is genuinely complete — the same pre-existing Realtime-reliability limitation already accepted for per-piece feedback (Story 3.6), but worth flagging explicitly here since, unlike per-piece drift, this has zero self-correction: there is no later event that could ever retrigger it for that client.

**Dismissed** (reasoning only, no code change): the final piece's own "piece placed" announcement being overwritten by "frame complete" in the same `aria-live` region under React batching (arguably correct precedence, not a bug); the uncleared `setTimeout` hiding the glow (matches the identical pre-existing pattern in `triggerPulse`, harmless under React 18/19's no-op-on-unmount semantics); the `confirmedPlacedIds` grow-only assumption (matches the app's own documented "no un-place mechanic" invariant); a torn read of `muted` at the exact instant of firing (narrow, cosmetic, one-time-only); mixed-diff file/AC traceability noise (artifact of this session's uncommitted-diff review process, not a real code issue).
