---
baseline_commit: 8cd39ba
---

# Story 2.3: Choose the piece count

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a registered Participant creating a Room,
I want to choose how many pieces the puzzle will have,
so that the difficulty matches what my household wants to tackle.

## Acceptance Criteria

1. On the Room-creation screen (`/create`), a piece-count selector is shown (mockup: `key-creation-salon.html`'s "Nombre de pièces" field) with a small fixed set of options — PRD doesn't specify exact values, so this story picks: 100, 300, 500, 1000, 1500 (documented as a provisional assumption, same treatment as Story 2.2's upload-format/size limits).
2. Selecting a piece count retains the choice (local form state, same discriminated-state pattern established in Story 2.2 — no submission happens yet, that's Story 2.4).
3. If the currently-chosen image's resolution is too low for the selected piece count, a blocking warning is shown offering to reduce the piece count or pick another image `[carried from PRD Open Question #3 — provisional behavior, explicitly not fully specified by the PRD]`. The piece-count choice is **not** retained as valid while the warning is showing — the Participant must either pick a smaller count or a different (higher-resolution) image before a piece count is considered set.

## Tasks / Subtasks

- [x] Task 1: Define piece-count options and the resolution-sufficiency heuristic (AC: #1, #3)
  - [x] Create `src/lib/rooms/piece-count-options.ts` exporting `PIECE_COUNT_OPTIONS: number[] = [100, 300, 500, 1000, 1500]`
  - [x] Create `src/lib/rooms/is-resolution-sufficient.ts` exporting `isResolutionSufficient(width: number, height: number, pieceCount: number): boolean` — heuristic: `width * height >= pieceCount * MIN_PIXELS_PER_PIECE` with `MIN_PIXELS_PER_PIECE = 3000`. This is an explicit, arbitrary placeholder (no real piece-cutting service exists yet — `src/lib/piece-cutting/` is still an empty `.gitkeep` per Story 1.1 — and the PRD itself flags this exact question as unresolved, §11 Q3). Document in a code comment that Epic 3's real piece-cutting service should replace this heuristic with an actual geometry-aware check once it exists.
  - [x] Create `src/lib/rooms/is-resolution-sufficient.test.ts` covering: a high-resolution image passing at the largest option (1500), a low-resolution image failing at a small option (100), and at least one case using the *actual* dimensions of the two real library images (2639×1799 and 1587×1123) at a piece count that should pass and one that should fail for each — this keeps the test grounded in real assets rather than only synthetic numbers
- [x] Task 2: Know the selected image's dimensions (AC: #3)
  - [x] Add `width`/`height` to each entry in `src/lib/rooms/library-images.ts` (`LIBRARY_IMAGES`) — these are static, already known (recorded via `sips` when the files were added: `lille-grand-place` 2639×1799, `office-workstation` 1587×1123)
  - [x] Create `src/lib/rooms/get-image-dimensions.ts` exporting `getImageDimensions(file: File): Promise<{ width: number; height: number }>` using `createImageBitmap(file)` (a standard browser API, no new dependency) — needed because an uploaded file's pixel dimensions aren't known synchronously the way a library image's are
- [x] Task 3: Extend `CreateRoomForm` with the piece-count selector and the blocking-warning flow (AC: #1, #2, #3)
  - [x] Add `pieceCount: number | null` state and `imageDimensions: { width: number; height: number } | null` state to `src/app/create/create-room-form.tsx`
  - [x] When a library image is selected, set `imageDimensions` synchronously from its known `width`/`height` (Task 2). When an upload is accepted, call `getImageDimensions()` and set `imageDimensions` once resolved (async — the dimensions aren't known at the instant of file selection)
  - [x] Render `PIECE_COUNT_OPTIONS` as a `<select>` (matching the mockup's dropdown), following the layout/copy from `key-creation-salon.html` ("Nombre de pièces")
  - [x] On selecting a piece count, if `imageDimensions` is known and `isResolutionSufficient(...)` is `false`, do **not** set `pieceCount` to the selected value — instead show a blocking inline warning (`role="alert"`) with the two remediation options described in AC #3 (reduce the piece count — i.e. suggest/link to the largest passing option below it, or pick another image — i.e. a reminder to use the image picker above). If `imageDimensions` is not yet known (e.g. an upload's dimensions are still resolving), disable the piece-count select rather than allowing a premature choice.
  - [x] **Implementation deviation, documented:** rather than an effect that re-runs the check and clears `pieceCount` on `imageDimensions` change (as originally worded), validity is instead *derived at render time* from `(pieceCount, imageDimensions)` on every render — `isPieceCountValid`/`resolutionWarningCount` are computed values, never a separately-synced piece of state. This achieves the same requirement (a stale valid-for-a-different-image count is never silently treated as valid) with no `useEffect` at all, which also sidesteps `react-hooks/set-state-in-effect` — the project's ESLint config rejected the effect-based version outright (`Calling setState synchronously within an effect can trigger cascading renders`).
- [x] Task 4: Regression check
  - [x] `pnpm build` — zero TypeScript errors
  - [x] `pnpm lint` — clean (including the `react-hooks/set-state-in-effect` rule that caught the first implementation attempt)
  - [x] `pnpm test` — 38 tests total (33 existing + 5 new `is-resolution-sufficient` tests), all pass
  - [x] Verified via `pnpm dev` + `curl` that `/create`'s auth gate is unaffected (307 → `/sign-in` when unauthenticated) — this diff doesn't touch the gate
  - [x] **Limitation, documented honestly (same as every story since 1.4):** no headless browser is available in this environment — the actual interactive flow (selecting an image, then a piece count, seeing the warning trigger/clear) can't be driven end-to-end here. Verified instead by static review of the state transitions plus the unit-tested resolution heuristic. Recommend the user do one manual browser pass, specifically trying the office-workstation image at 1000 or 1500 pieces to trigger the warning live.

### Review Findings

- [x] [Review][Patch] **Real bug, confirmed by all three review layers independently:** switching to an upload while a piece count is already chosen shows a false "resolution too low" warning during the async dimension-probing window — `imageDimensions` is nulled synchronously while `getImageDimensions()` resolves, and the current derivation treats "unknown" the same as "confirmed insufficient." Contradicts AC #3's premise that the warning reflects an actual determination [src/app/create/create-room-form.tsx]
- [x] [Review][Patch] Same placeholder text ("Choisissez d'abord une image") shows both when no image is selected and while an upload's dimensions are still being probed — confusing/wrong in the second case [src/app/create/create-room-form.tsx, messages/fr.json]
- [x] [Review][Patch] If `getImageDimensions()` fails (corrupt file, decode error, `createImageBitmap` unavailable), the piece-count select stays disabled forever with no error shown anywhere — silent permanent dead end [src/app/create/create-room-form.tsx]
- [x] [Review][Patch] No unmount guard around the async `getImageDimensions()` call — a resolved/rejected promise after unmount still calls state setters [src/app/create/create-room-form.tsx]
- [x] [Review][Patch] `pieceCount` is set to every selection unconditionally, including resolution-insufficient ones — contradicts Task 3's literal instruction ("do not set `pieceCount` to the selected value") even though the separately-derived `isPieceCountValid` correctly gates AC #3's "not retained as valid" requirement. Needs an explicit code comment (and story acknowledgment) clarifying this is an intentional, disclosed design choice — the derived-validity architecture is sound, but the deviation from the literal task wording was previously unacknowledged [src/app/create/create-room-form.tsx]
- [x] [Review][Patch] Missing required test case: Task 1 asks for a passing *and* a failing piece count for **each** real library image, but `is-resolution-sufficient.test.ts` never exercises a failing case for the Lille photo (it passes at every value in `PIECE_COUNT_OPTIONS`) — add an off-list value that demonstrably fails for it [src/lib/rooms/is-resolution-sufficient.test.ts]
- [x] [Review][Patch] Tests hardcode the library images' pixel dimensions as literals instead of importing them from `LIBRARY_IMAGES` — if the source dimensions ever change, these tests silently stop reflecting reality instead of failing [src/lib/rooms/is-resolution-sufficient.test.ts]
- [x] [Review][Patch] No boundary-equality test (`width*height === pieceCount * MIN_PIXELS_PER_PIECE`) and no zero/negative-dimension test coverage for `isResolutionSufficient` [src/lib/rooms/is-resolution-sufficient.test.ts]
- [x] [Review][Patch] The warning message never surfaces the specific "reduce to N pieces" remediation Task 3 called for ("suggest/link to the largest passing option"), and infeasible `<option>`s in the piece-count `<select>` aren't disabled up front, so a user only discovers a bad choice after picking it [src/app/create/create-room-form.tsx, messages/fr.json]
- [x] [Review][Defer] No unit test for `get-image-dimensions.ts` — would require mocking the global `createImageBitmap`, not used elsewhere in the test suite; consistent with the already-deferred component-testing-infra gap from Story 2.2's review [src/lib/rooms/get-image-dimensions.ts]
- [x] [Review][Defer] `isResolutionSufficient`'s heuristic ignores aspect ratio entirely (a very thin/wide image with enough total pixels would incorrectly pass) — already an explicitly disclosed provisional simplification; revisit once Epic 3's real piece-cutting service exists [src/lib/rooms/is-resolution-sufficient.ts]

## Dev Notes

- **This story still does not create a Room or touch Supabase Storage** — same boundary as Story 2.2, for the same reason (`Room.id` doesn't exist until Story 2.4). `pieceCount` and the selected image both stay in `CreateRoomForm`'s local state; nothing is submitted yet.
- **Piece-count options and the resolution heuristic are both explicit, documented assumptions**, not derived from any spec — the PRD's own Open Question #3 (§11) says this exact behavior is "not treated" by the PRD. Follow the same discipline as Story 2.2's upload limits: pick a reasonable placeholder, document it clearly, make it trivially findable (one named constant each) for whoever revisits it.
- **The `MIN_PIXELS_PER_PIECE = 3000` heuristic was deliberately calibrated against the two real library images so the warning path is actually exercisable, not just theoretical:** at this threshold, the Lille photo (2639×1799 ≈ 4.75M px) passes all five piece-count options up to 1500, while the office-workstation photo (1587×1123 ≈ 1.78M px) passes up to 500 but fails at 1000 and 1500. This means AC #3's blocking-warning path has a real, reachable trigger in this story's own test data — don't recalibrate the constant without checking it still leaves at least one real pass/fail case reachable with the two images actually in `public/library/`.
- **`createImageBitmap` for upload dimension-probing is a standard Web API available in all evergreen browsers** — no new npm dependency needed, consistent with keeping this story's footprint small. It's async, which is why `imageDimensions` needs its own state slot separate from `selectedImage` (an upload can be "selected" before its dimensions are known).
- **Re-validation on image change (Task 3's last bullet) is the trickiest part of this story — don't skip it.** A naive implementation would only check resolution sufficiency at the moment of piece-count selection and never revisit it, silently leaving a stale/invalid `pieceCount` set after the Participant switches to a smaller image. The state must be re-checked whenever `imageDimensions` changes, not just whenever `pieceCount` changes.
- **No automated component test for `CreateRoomForm` itself** — this is a continuation of the gap already deferred in Story 2.2's review (`deferred-work.md`: "would require introducing React Testing Library/jsdom... better addressed deliberately in its own story"). This story adds more untested interactive logic to that same component, which makes that deferred item more valuable to eventually pick up, but doesn't change the reasoning for deferring it again here.
- **NFR4 (accessibility) applies**: the piece-count `<select>` needs an associated `<label>`, and the blocking warning needs `role="alert"` — consistent with every prior form-error pattern in this project.

### Project Structure Notes

- New: `src/lib/rooms/piece-count-options.ts`, `src/lib/rooms/is-resolution-sufficient.ts` (+ test), `src/lib/rooms/get-image-dimensions.ts`.
- Modified: `src/lib/rooms/library-images.ts` (adds `width`/`height` per entry), `src/app/create/create-room-form.tsx` (adds piece-count state, dimension tracking, and the warning flow).
- No new directories — `src/lib/rooms/` already exists (Story 1.4).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.3-Choose-the-piece-count] — story statement and AC source, including the explicit `[carried from PRD Open Question #3...]` marker
- [Source: _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md#11] — Open Question #3: image-resolution/piece-count coherence explicitly unresolved by the PRD
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/mockups/key-creation-salon.html] — piece-count dropdown layout/copy ("Nombre de pièces", "500 pièces")
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md] — confirms `lib/piece-cutting/` is the eventual home of the real, deterministic piece-cutting algorithm (Epic 3) that this story's heuristic is explicitly a placeholder for
- [Source: _bmad-output/implementation-artifacts/2-2-choose-the-puzzle-image.md] — established conventions this story extends: `CreateRoomForm`'s local-state-only scope, provisional-assumption documentation style, deferred component-test gap

## Previous Story Intelligence (from Story 2.2)

- `CreateRoomForm` (`src/app/create/create-room-form.tsx`) already holds `selectedImage` discriminated-union state and `next-intl`'s `useTranslations` — this story adds to the same component rather than creating a parallel one.
- `messages/fr.json` is the single source of UI copy (Story 2.2's code review resolved a cross-story English/French inconsistency by adopting `next-intl`) — add this story's new strings ("Nombre de pièces", the warning message, option labels) to the `Create`/`Rooms` namespaces there, not as inline literals.
- `LIBRARY_IMAGES` currently has no `width`/`height` fields — Task 2 adds them; check `src/lib/rooms/library-images.ts`'s current shape before extending it.
- pnpm is the only package manager; Vitest is configured with 33 existing tests.
- Story 2.2's review established: don't add new npm dependencies for something a standard Web API already covers (`createImageBitmap` here, same spirit as avoiding a client-side image-cropping library, etc.).

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- First implementation attempt used a `useEffect` to re-clear `pieceCount` when `imageDimensions` changed. `pnpm lint` rejected it: `react-hooks/set-state-in-effect` — "Calling setState synchronously within an effect can trigger cascading renders." Refactored to derive validity at render time instead (no effect needed at all); this is arguably a better pattern regardless of the lint rule, since it makes stale-state bugs structurally impossible rather than relying on an effect firing correctly.
- Same environment limitation as every story since 1.4: no headless browser, so the interactive flow (image → piece count → warning trigger/clear) was verified by static review and the unit-tested resolution heuristic, not a live browser session.

### Completion Notes List

- `PIECE_COUNT_OPTIONS` (5 options) and `isResolutionSufficient()` (+ 5 tests) both documented as explicit provisional assumptions, per the PRD's own Open Question #3.
- `MIN_PIXELS_PER_PIECE = 3000` calibrated specifically against the two real library images so the warning path has a genuine pass/fail case with real assets, not just synthetic test numbers.
- `LIBRARY_IMAGES` extended with `width`/`height`; `getImageDimensions()` added for uploads via `createImageBitmap` (standard Web API, no new dependency).
- `CreateRoomForm` extended with piece-count state and a *derived* (not effect-synced) validity check — `isPieceCountValid`/`resolutionWarningCount` are computed every render from `(pieceCount, imageDimensions)`, so switching to a lower-resolution image after picking a piece count can never leave a stale "valid" count around.
- Race-condition guard on upload dimension-probing: a monotonic `dimensionRequestId` ref ensures a slow-resolving `getImageDimensions()` call from a previous file can't overwrite state after the user has already switched to a different image.
- `pnpm build`/`pnpm lint`/`pnpm test` all clean (38 tests). `/create`'s auth gate reconfirmed unaffected via `curl`.
- **Code review round (2026-08-14):** all 8 patches applied, 2 items deferred (logged in `deferred-work.md`). The headline fix: a real bug independently caught by all three review layers — switching to an upload while a piece count was already chosen showed a false "resolution too low" warning during the async dimension-probing window, because "unknown" and "confirmed insufficient" were indistinguishable. Fixed via a new `isProbingDimensions` state that suppresses the warning (and shows a distinct "Chargement de l'image…" placeholder) until dimensions are actually known. Also added: an unmount guard (`isMountedRef`) around the async probe; a user-visible error (`imageReadError`) when `getImageDimensions()` fails instead of a silent permanent dead end; a `getLargestSufficientPieceCount()` helper so the warning suggests a concrete smaller piece count instead of a generic "reduce it," and infeasible `<option>`s are now disabled in the select; a code comment explicitly acknowledging that `pieceCount` intentionally stores the raw attempt (validity is derived separately) rather than literally withholding the setter, per Task 3's wording; and 3 additional test cases (an off-list failing value for the Lille photo, a boundary-equality case, a zero-dimension case) plus the existing tests now import real dimensions from `LIBRARY_IMAGES` instead of duplicating them as literals. Verified via `pnpm build`, `pnpm lint`, `pnpm test` (45 tests, all clean).

### File List

**New:**
- `src/lib/rooms/piece-count-options.ts`
- `src/lib/rooms/is-resolution-sufficient.ts`
- `src/lib/rooms/is-resolution-sufficient.test.ts`
- `src/lib/rooms/get-image-dimensions.ts`

**Modified:**
- `src/lib/rooms/library-images.ts` (added `width`/`height` per entry)
- `src/app/create/create-room-form.tsx` (added piece-count selector + resolution-warning flow; code review added `isProbingDimensions`, unmount guard, error surfacing, and the piece-count suggestion)
- `src/lib/rooms/is-resolution-sufficient.ts` (code review added `getLargestSufficientPieceCount()`)
- `src/lib/rooms/is-resolution-sufficient.test.ts` (code review added boundary/zero/off-list-failure tests, imports real dimensions from `LIBRARY_IMAGES`)
- `messages/fr.json` (added `Create.pieceCountLabel`, `pieceCountOption`, `pieceCountPlaceholder`, `pieceCountLoading`, `resolutionWarningWithSuggestion`, `resolutionWarningNoSuggestion`, `Rooms.imageReadError`)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-14 | Story implemented: piece-count selector + resolution-sufficiency warning (AC #1–#3) |
| 2026-08-14 | Code review: 8 patches applied (including a real false-warning bug caught by all 3 review layers), 2 items deferred to `deferred-work.md`. Status → done. |
