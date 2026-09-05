baseline_commit: NO_VCS

# Story 3.17: Update the first-access tutorial for the new Canvas features

Status: ready-for-dev

## Story

As a first-time Guest,
I want the onboarding tutorial to mention the Canvas buttons that were added after it was originally written,
so that I discover the reference-image view and the frame-piece highlight the same way I discover moving, rotating, and fusing a piece.

## Acceptance Criteria

1. **Given** the first-access tutorial (Story 3.2), which already teaches moving, rotating, placing into the Frame, and fusing into an Îlot, **when** a new Guest sees it for the first time in a Room, **then** it also includes a step introducing the reference-image button (Story 3.14, press-and-hold to see the full picture) and a step introducing the "highlight frame pieces" toggle (Story 3.16).
2. Every other existing behavior of the tutorial (first-visit-per-Room-per-session gating, every dismissal path, Guest-only visibility) is completely unchanged — this story only adds content, it never touches the mechanism.

**Note — scope decision (2026-09-05), confirmed with the user before this story was written:** Story 3.15 (auto-pan while dragging near an edge) deliberately gets **no** new tutorial step — it's a passive behavior that happens automatically during the gesture the tutorial already teaches (moving a piece), not a new button or a gesture a Guest has to learn; adding a step for it would teach nothing actionable. Revisit only if real usage shows Participants aren't discovering it on their own.

## Tasks / Subtasks

- [ ] Task 1: Add the two missing steps to the tutorial's content (AC: #1)
  - [ ] **Read `src/components/room/first-access-tutorial.tsx` in full before touching it.** `STEPS` (a `const` array near the top of the file) is the entire content model — each entry is `{ icon, titleKey, descriptionKey }`, rendered in order inside the dialog by a single `.map()` (no per-step conditional logic, no step count assumed elsewhere in the file or in `tutorial-seen.ts` — confirmed that file keys its `sessionStorage` entry purely by `roomSlug`, with no version/hash tied to step content, so adding steps needs no migration of any kind for a Guest who already dismissed the *old* 4-step version).
  - [ ] Append two new entries to `STEPS`, after the existing 4 (order: teach the base gestures first, the two newer helper features last) — one for the reference-image button (Story 3.14), one for the "highlight frame pieces" toggle (Story 3.16).
  - [ ] New translation keys in `messages/fr.json`'s `Tutorial` section, following the exact existing `step{N}Title`/`step{N}Description` naming convention (`step5Title`/`step5Description`, `step6Title`/`step6Description`) and this section's established tone (short, imperative, matching `step1Title: "Déplacer une pièce"`'s register) — content should describe *what the button does and why*, e.g. (adjust wording to match the app's own voice, these are a starting point, not mandated copy): step5 for the reference image ("Voir l'image complète" / "Maintenez le bouton enfoncé pour voir la photo d'origine"), step6 for frame-piece highlighting ("Repérer les pièces de cadre" / "Ce bouton assombrit les autres pièces pour vous aider à les trier").
  - [ ] Pick a `lucide-react` icon for each new step. **Check for a collision before choosing:** `STEPS` already uses the `Frame` icon for the existing step3 ("La positionner dans le Cadre") — Story 3.16's own `HighlightFramePiecesButton` (`src/components/canvas/highlight-frame-pieces-button.tsx`) also uses `Frame` for its own button. Using `Frame` a *second* time for this tutorial's new "highlight frame pieces" step would put two visually identical icons in the same dialog for two different meanings (placing into the Frame vs. highlighting frame pieces) — pick a distinct icon for this step instead (e.g. something evoking "reveal"/"spotlight", check the installed `lucide-react` icon list rather than assuming a name exists). For the reference-image step, reusing the same icon `ReferenceImageButton` itself already uses (`ImageIcon`, confirmed present, no collision with any existing tutorial-step icon) is recommended — matching a tutorial step's icon to the icon on the actual button it describes helps a Guest connect the two later.

- [ ] Task 2: Regression + manual verification (AC: #1, #2)
  - [ ] `pnpm build && pnpm lint && pnpm test` clean.
  - [ ] Manual verification (this repo has no canvas/visual-regression or component-testing infrastructure, consistent with every other Canvas-interaction story this session): (1) as a Guest visiting a Room for the first time this session, confirm the tutorial dialog now shows 6 steps in order, the 2 new ones rendering correctly (icon, title, description); (2) confirm every existing dismissal path (Escape, overlay click, close X, "Commencer", "Plus tard") still closes the dialog and still marks it seen for the rest of the session, exactly as before; (3) confirm a Participant who already dismissed the *old* 4-step tutorial earlier in the same session (before this story's own deploy) is unaffected — no forced re-show, since `tutorial-seen.ts` was confirmed to key purely on `roomSlug`, not on step content/count.

## Dev Notes

### Why this needs no changes to `tutorial-seen.ts` or the dialog's own open/close mechanism

`hasSeenTutorial`/`markTutorialSeen` (`src/lib/rooms/tutorial-seen.ts`) key their `sessionStorage` entry purely by `roomSlug` — there is no content hash, version number, or step count baked into the storage key or value (`SEEN_VALUE = "1"`, a plain flag). Adding steps to `STEPS` therefore cannot desync from what's already been marked "seen" for anyone — this is a pure content addition to the `.map()` that renders `STEPS`, with zero interaction with the gating logic in `FirstAccessTutorial` itself (`open`, `dismissed`, `handleOpenChange`), all of which stay untouched per AC #2.

### The icon-collision this story must avoid

`STEPS`' existing step3 (`{ icon: Frame, titleKey: "step3Title", ... }`, "La positionner dans le Cadre") already uses lucide-react's `Frame` icon. Story 3.16 — implemented just before this story was written — separately chose the *same* `Frame` icon for its own new `HighlightFramePiecesButton`, without cross-checking the tutorial's existing icon usage (a gap this story's own creation surfaced). Reusing `Frame` a third time, for this tutorial's new "highlight frame pieces" step, would put two identically-iconed steps in one dialog conveying two different meanings — pick something else for that one step (Task 1's own instruction). This is *not* a requirement to go back and change Story 3.16's own button icon — that button is a separate, already-implemented/reviewed surface; if it hasn't merged yet by the time this story is picked up, changing its icon there is a reasonable opportunistic fix but is explicitly optional and outside this story's own AC's, not a blocking dependency.

### Project Structure Notes

- Modified only: `src/components/room/first-access-tutorial.tsx` (two new `STEPS` entries), `messages/fr.json` (`Tutorial` section, four new keys: `step5Title`/`step5Description`/`step6Title`/`step6Description`).
- No new files, no schema/migration/Server Action changes, no new component.

### Testing standards summary

- `FirstAccessTutorial` has no existing direct component test (consistent with this app's established convention for Dialog/UI-only components — `tutorial-seen.ts`'s own pure logic *does* have `tutorial-seen.test.ts`, unaffected by this story since its key/value contract doesn't change). Rely on Task 2's manual verification for the actual rendered content.

## Previous Story Intelligence (from this session's own recent work)

- This story exists specifically because Stories 3.14, 3.15, and 3.16 each added a new Canvas button/behavior without anyone checking back against the onboarding tutorial written for Story 3.2 — the user caught this gap by directly asking "tu as mis à jour le tuto ?" after Story 3.16 shipped. Worth remembering for any *future* new Canvas button/behavior story: check whether `first-access-tutorial.tsx`'s `STEPS` needs a new entry as part of that story's own scope, rather than accumulating another gap to close later.
- Story 3.16's own icon choice (`Frame`, for `HighlightFramePiecesButton`) is the direct, concrete example of why this story's Task 1 explicitly calls out checking for icon collisions first — an icon picked in isolation, without checking every other icon already visible to the same Guest in the same app, drifted into a collision with pre-existing tutorial content.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.17] — this story's own definition, added 2026-09-05.
- [Source: src/components/room/first-access-tutorial.tsx] — the `STEPS` array and dialog this story extends.
- [Source: src/lib/rooms/tutorial-seen.ts, src/lib/rooms/tutorial-seen.test.ts] — confirms the gating mechanism is content-agnostic, needing no change.
- [Source: src/components/canvas/reference-image-button.tsx, src/components/canvas/highlight-frame-pieces-button.tsx] — the two buttons this story's new steps describe, and the icon-collision source.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-05 | Story created: two new tutorial steps (reference image, highlight frame pieces) for features added by Stories 3.14/3.16 after the tutorial was originally written; Story 3.15 explicitly excluded (passive behavior, nothing to teach). Caught by the user directly asking whether the tutorial had been kept up to date. |
