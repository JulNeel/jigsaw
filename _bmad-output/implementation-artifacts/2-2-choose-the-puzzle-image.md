---
baseline_commit: 731db1f
---

# Story 2.2: Choose the puzzle image

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a registered Participant creating a Room,
I want to pick an image from a provided library or upload a personal photo,
so that the Room's puzzle shows a picture I actually want to share with my household.

## Acceptance Criteria

1. On the Room-creation screen (`/create`, already gated by Story 2.1), a library of provided image thumbnails is shown; selecting one marks it visually selected (outline, per `key-creation-salon.html`) and it becomes the active choice.
2. Uploading a personal photo replaces the library selection as the active choice — only one image (library thumbnail *or* uploaded photo) is active at a time.
3. An upload that fails validation (wrong format or too large) shows an inline error message; the Participant stays on the creation screen and no other state already entered is lost (EXPERIENCE.md State Patterns: "Création de Salon, erreur d'upload").

## Tasks / Subtasks

- [x] Task 1: Seed the image library (AC: #1)
  - [x] Create `src/lib/rooms/library-images.ts` exporting a `LIBRARY_IMAGES` constant: an array of `{ id: string; src: string; alt: string }`, one entry per file the user placed in `public/library/` — `lille-grand-place` → `/library/Lille_vue_gd_place_jigsaw.JPG` (alt: "Vue de la Grand Place, Lille"), `office-workstation` → `/library/jbee_office_workstation_jigsaw.png` (alt: "Poste de travail de bureau"). This is a static, hand-curated list — Story 2.4 (real Room creation) is what actually reads from it, this story just needs it to exist and be renderable.
- [x] Task 2: Extract and unit-test upload validation (AC: #3)
  - [x] Create `src/lib/rooms/validate-uploaded-image.ts` exporting `validateUploadedImage(file: { type: string; size: number }): { valid: true } | { valid: false; message: string }` — accepts `image/jpeg`, `image/png`, `image/webp` only; rejects anything over 10 MB (`10 * 1024 * 1024` bytes). Both constraints are provisional decisions (PRD doesn't specify them — same "carried as an assumption, documented, revisit if wrong" treatment as prior stories' `[ASSUMPTION]` markers). The parameter type is a structural subset of `File` (not `File` itself) specifically so this stays a pure function testable with plain objects — no `File`/`Blob` construction needed in tests, same rationale as `formatRoomProgress`/`classifySignUpError`.
  - [x] Create `src/lib/rooms/validate-uploaded-image.test.ts` covering: valid JPEG under the limit, valid PNG, valid WebP, oversized file, unsupported MIME type (e.g. `application/pdf`), a file at exactly the size boundary
- [x] Task 3: Build the image-selection UI as a Client Component (AC: #1, #2, #3)
  - [x] Create `src/app/create/create-room-form.tsx` (Client Component) with local state `selectedImage: { kind: "library"; id: string } | { kind: "upload"; file: File } | null` and `uploadError: string | null`
  - [x] Render `LIBRARY_IMAGES` as a grid of thumbnails (`next/image`, since these are static local assets — follow whatever `next/image` conventions the project uses; none established yet, so configure minimally as needed) — clicking one sets `selectedImage = { kind: "library", id }`, clears `uploadError`, and applies the `.selected` outline style from `key-creation-salon.html` (`outline: 3px solid var(--primary)` equivalent via Tailwind, e.g. `outline outline-3 outline-offset-2 outline-primary` conditionally applied)
  - [x] Render a file `<input type="file" accept="image/jpeg,image/png,image/webp">` styled as the dashed upload button from the mockup ("📷 Importer une photo personnelle"); on change, run `validateUploadedImage()` — on success set `selectedImage = { kind: "upload", file }` (replacing any library selection) and clear `uploadError`; on failure set `uploadError` to the returned message and leave `selectedImage` untouched (AC #3: nothing already entered is lost)
  - [x] Render `uploadError` as an inline `role="alert"` message near the upload control when present
  - [x] Update `src/app/create/page.tsx` to render `<CreateRoomForm />` in place of the current `<div>Create Room</div>` placeholder (the `requireUser()` gate from Story 2.1 stays exactly as-is, above it)
- [x] Task 4: Regression check
  - [x] `pnpm build` — zero TypeScript errors
  - [x] `pnpm lint` — clean
  - [x] `pnpm test` — 31 tests total (25 existing + 6 new `validateUploadedImage` tests), all pass
  - [x] Verified via `pnpm dev` + `curl` that `/create`'s auth gate (Story 2.1) still redirects unauthenticated requests (307 → `/sign-in`) — this diff doesn't touch the gate. **Limitation, documented honestly (same as Stories 1.4/2.1):** no headless browser is available in this environment, so the authenticated visual behavior (thumbnail selection outline, upload replacing library choice, inline error rendering) could not be driven end-to-end here. Recommend the user do one manual browser pass on `/create` as a final human check.

### Review Findings

- [x] [Review][Patch] The file `<input type="file">`'s DOM value isn't cleared when a library thumbnail is subsequently clicked after an upload — `selectedImage` state correctly moves to `{kind: "library"}`, but the input element still holds the previously chosen file, an inconsistency a later interaction could surface [src/app/create/create-room-form.tsx]
- [x] [Review][Patch] `validateUploadedImage` accepts a 0-byte (empty) file — `size > MAX_SIZE_BYTES` is false for `size: 0`, so nothing rejects it [src/lib/rooms/validate-uploaded-image.ts]
- [x] [Review][Patch] `validateUploadedImage` accepts a non-finite `size` (e.g. `NaN`) — `NaN > MAX_SIZE_BYTES` evaluates to `false`, so a corrupt/invalid size value passes as valid [src/lib/rooms/validate-uploaded-image.ts]
- [x] [Review][Patch] `event.target.value = ""` in the upload change handler is an uncommented DOM side-effect inside an otherwise declarative handler — add a one-line comment explaining it exists so the same rejected file can be re-selected and re-trigger `onChange` [src/app/create/create-room-form.tsx]
- [x] [Review][Defer] No automated test covers `create-room-form.tsx` itself (library selection, `aria-pressed` toggling, upload-rejection preserving prior selection) — only the pure `validateUploadedImage` function is unit-tested. Adding component tests would require introducing React Testing Library/jsdom, a testing-infrastructure decision similar to Story 1.2's Vitest adoption; better addressed deliberately in its own story than pulled in silently during a patch round [src/app/create/create-room-form.tsx]
- [x] [Review][Defer] The product's user-facing copy is inconsistently bilingual across already-completed stories — Stories 1.2/1.3 (Sign-in/Sign-up: "Email is required.", "Invalid email or password.") use English, while Stories 1.4/2.1/2.2 (Home/Create: "Aucun Salon pour l'instant", "Format non supporté...") use French, matching the PRD/UX's French-speaking target users. This is a real, accumulated cross-story inconsistency that Story 2.2 alone didn't introduce and can't fix — worth a dedicated pass (or an explicit i18n decision) rather than picking a language story-by-story [src/lib/auth/actions.ts, src/app/sign-in/*, src/app/page.tsx, src/app/room-list.tsx, src/app/create/*]

## Dev Notes

- **This story does not create a Room, does not touch Supabase Storage, and does not submit anything.** `Room` doesn't exist as a table until Story 2.4, and Architecture's Storage convention (`piece-tiles` bucket, "un dossier par `Room.id`") requires a `Room.id` to even name the upload destination — one doesn't exist yet at this point in the flow. This story is purely client-side local state (which image is "active") plus format/size validation; the actual network upload to Supabase Storage happens in Story 2.4, once a Room (and therefore an id) is actually being created. Do not add any Supabase Storage calls in this story.
- **Library image source — user-provided, not fabricated.** The PRD doesn't specify where library images come from, and no curated content existed in the repo. Rather than inventing content (fake stock-photo URLs, generated placeholders) the user was asked directly and placed two real image files in `public/library/`: `Lille_vue_gd_place_jigsaw.JPG` (2639×1799) and `jbee_office_workstation_jigsaw.png` (1587×1123) — both comfortably high-resolution for any piece count this app will offer. `LIBRARY_IMAGES` in Task 1 is a hand-written list of exactly these two, not a dynamic directory scan — if more images are added later, extend the list explicitly.
- **Format/size upload constraints are a provisional decision, flagged the same way prior `[ASSUMPTION]`s were:** JPEG/PNG/WebP only, 10 MB max. Nothing in the PRD or EXPERIENCE.md specifies exact values (EXPERIENCE.md's State Pattern just says "format, taille" without numbers) — these are reasonable, common web-upload defaults, not derived from a spec. Revisit if the user wants different limits.
- **One active image at a time (AC #2), enforced by the state shape itself:** `selectedImage` is a single discriminated-union value, not two independent booleans/refs — selecting a library thumbnail after an upload (or vice versa) necessarily replaces the other, by construction, not by an extra "clear the other one" step that could be forgotten.
- **This form component is the seed Stories 2.3 and 2.4 extend, not a final, closed component.** Story 2.3 adds the piece-count selector to the same screen/form; Story 2.4 adds the actual submit action (real Room creation, real Storage upload, invite-link generation) and the second mockup state (link generated). Don't build stubs for those now (no disabled piece-count dropdown, no non-functional submit button) — per the project's established convention (Stories 1.4, 2.1) of not building UI for behavior that isn't wired to anything real yet.
- **`next/image` for local static assets under `public/`** — this is the first use of `next/image` in the project; no existing convention to follow or conflict with. Use it directly for `public/library/*` assets since they're build-time-known local files, which is exactly `next/image`'s well-supported case (no remote-pattern config needed, unlike user-uploaded photos which aren't rendered via `next/image` in this story since they're never uploaded anywhere — a local preview via `URL.createObjectURL` would be a nice-to-have but isn't required by any AC; skip it unless trivial).
- **NFR4 (accessibility) applies**, consistent with all prior stories: each library thumbnail needs a meaningful `alt` (already specified per-entry in Task 1), the upload input needs an associated label, and `uploadError` needs `role="alert"` for the same reason Stories 1.2/1.3 used it.

### Project Structure Notes

- New: `src/lib/rooms/library-images.ts`, `src/lib/rooms/validate-uploaded-image.ts` (+ test), `src/app/create/create-room-form.tsx`.
- Modified: `src/app/create/page.tsx` (renders the new form instead of the placeholder div).
- New static assets: `public/library/Lille_vue_gd_place_jigsaw.JPG`, `public/library/jbee_office_workstation_jigsaw.png` (already placed by the user, not created by this story — just referenced).
- `src/lib/rooms/` already exists (created in Story 1.4) — this story adds to it, doesn't create the directory.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.2-Choose-the-puzzle-image] — story statement and AC source
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/mockups/key-creation-salon.html] — library grid layout, selected-thumbnail outline style, upload button copy/style
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#State-Patterns] — "Création de Salon, erreur d'upload": inline error, nothing lost (line 80)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md] — `piece-tiles` Storage bucket convention, one folder per `Room.id` (confirms why actual upload is deferred to Story 2.4)
- [Source: _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md#FR-18] — "bibliothèque fournie par l'application, soit en important une photo personnelle"

## Previous Story Intelligence (from Story 2.1)

- `/create` is already gated by `requireUser()` (Story 2.1) — this story adds UI *inside* that already-protected page, no auth changes needed.
- pnpm is the only package manager; Vitest is configured with 25 existing tests.
- Established pattern for pure/testable logic: extract into its own module under `src/lib/`, colocate a `.test.ts`, keep the function signature minimal (structural typing over `File` here, same spirit as avoiding over-coupling elsewhere).
- Story 2.1's review reinforced: don't build speculative UI/logic for future stories' scope, and add a regression test for the specific behavior a story exists to introduce (here: the validation function and the selection state machine, not the whole future form).

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- Same environment limitation as Stories 1.4/2.1: no headless browser available, so the authenticated visual behavior of the new form (thumbnail selection, upload replacing library choice, inline validation error) was verified by static code review and unit tests only, not a live browser session.

### Completion Notes List

- `src/lib/rooms/library-images.ts` hand-lists the two real images the user placed in `public/library/` — no dynamic scan, no fabricated content.
- `src/lib/rooms/validate-uploaded-image.ts` (+ 6 tests) — pure function accepting a structural `{ type, size }` subset of `File` so tests don't need real `File`/`Blob` construction; format (JPEG/PNG/WebP) and size (10 MB) limits are documented as provisional, PRD-unspecified defaults.
- `src/app/create/create-room-form.tsx` — Client Component with a single discriminated-union `selectedImage` state, so "only one active image" (AC #2) is structural, not an extra bookkeeping step.
- No Supabase Storage calls anywhere in this story — deliberately deferred to Story 2.4, since a `Room.id` (needed to name the Storage folder) doesn't exist until then.
- No piece-count selector or submit button added — those are Stories 2.3/2.4's scope; kept the form intentionally incomplete rather than stubbing ahead.
- `pnpm build`/`pnpm lint`/`pnpm test` all clean (31 tests). `/create`'s existing auth gate (Story 2.1) reconfirmed unaffected via `curl` (307 → `/sign-in` when unauthenticated).
- **Code review round (2026-08-13):** 4 patches applied, 2 items deferred (logged in `deferred-work.md` — component test coverage requires a testing-infra decision; UI-language inconsistency spans 5 already-completed stories, not fixable from within this one). Details: the file `<input>`'s DOM value is now cleared when a library thumbnail is selected after a prior upload; `validateUploadedImage` now rejects 0-byte and non-finite `size` values, with a doc comment noting it's a client-side UX check only (server-side re-validation is still required once Story 2.4 wires the real upload); the `event.target.value = ""` reset now has an explanatory comment. Verified via `pnpm build`, `pnpm lint`, `pnpm test` (33 tests, all clean).

### File List

**New:**
- `src/lib/rooms/library-images.ts`
- `src/lib/rooms/validate-uploaded-image.ts`
- `src/lib/rooms/validate-uploaded-image.test.ts`
- `src/app/create/create-room-form.tsx`

**Modified:**
- `src/app/create/page.tsx` (renders `<CreateRoomForm />` instead of the placeholder div)
- `src/app/create/create-room-form.tsx` (code review: file-input reset on library selection, explanatory comment)
- `src/lib/rooms/validate-uploaded-image.ts` (code review: zero/non-finite size guards, doc comment)
- `src/lib/rooms/validate-uploaded-image.test.ts` (code review: 2 new edge-case tests)

**External (already present, not created by this story):**
- `public/library/Lille_vue_gd_place_jigsaw.JPG`
- `public/library/jbee_office_workstation_jigsaw.png`

## Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | Story implemented: image-library selection + personal upload with validation (AC #1–#3) |
| 2026-08-13 | Code review: 4 patches applied, 2 items deferred to `deferred-work.md`. Status → done. |
