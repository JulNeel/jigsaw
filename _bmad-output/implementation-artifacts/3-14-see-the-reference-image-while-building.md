baseline_commit: NO_VCS

# Story 3.14: See the reference image while building

Status: done

## Story

As a Participant,
I want to glance at the full picture the puzzle is based on,
so that I can figure out where a piece belongs, the way a physical puzzle's box lid lets me.

## Acceptance Criteria

1. **Given** any Room (library-sourced or created from an uploaded photo), **when** a Participant presses and holds a visible button, on desktop or mobile, **then** the puzzle's full reference image displays fullscreen for as long as the button is held, and disappears the instant it's released.
2. Releasing the pointer anywhere — even after dragging off the button while still held — hides the image; there is no stuck-open state.
3. This is purely a transient, read-only view: it never blocks, delays, or otherwise interferes with the Canvas's own pan/zoom/drag state underneath.
4. A Room created from an *uploaded* photo shows the same feature identically to a library-sourced Room — no second-class experience for uploads.
5. A Room that already existed *before* this story shipped (upload-sourced, no reference image ever persisted for it) degrades gracefully — the button is disabled/hidden, never a broken image.

**Note — scope decision (2026-09-05), confirmed with the user before this story was written:** a Room created from an uploaded personal photo currently has **no accessible whole image anywhere** — only individually-sliced piece tiles exist, in the private `piece-tiles` Storage bucket (the same pre-existing gap `deferred-work.md` already flagged for Home's own thumbnail, 2026-08-17, never fixed). This story fixes it for real, at Room-creation time, for every *new* Room going forward — see AC #5 for why an already-existing Room is explicitly not retrofitted. A **permanent, resizable desktop drawer** was considered and explicitly deferred in favor of press-and-hold on both platforms — revisit as its own story only if real usage shows the need.

## Tasks / Subtasks

- [x] Task 1: Persist a reference image for upload-sourced Rooms at creation time (AC: #4)
  - [x] `src/app/create/create-room-form.tsx`'s `handleSubmit` already calls `loadImageBitmap(selectedImage)` (~L197) to get the full, unsliced original bitmap immediately before `sliceImageIntoTiles` cuts it into tiles — this is the one and only place the whole image ever exists client-side. Right there (before or after slicing, doesn't matter — the bitmap is unaffected by slicing), derive a resized copy: draw `bitmap` to a plain `<canvas>` scaled down to a capped long-edge dimension (new constant, e.g. `REFERENCE_IMAGE_MAX_DIMENSION = 2000` — reasonable default, not spec-mandated, tune visually later, matching this codebase's own convention for such constants), then `canvas.toBlob(..., "image/webp")`.
  - [x] Skip this entirely when `selectedImage.kind === "library"` — no reference image needs uploading; `LIBRARY_IMAGES`'s existing public `src` already serves this purpose (Task 2 reuses it directly).
  - [x] Upload the resized Blob via the same client SDK path `upload-piece-tiles.ts` already uses (`createClient` from `@/lib/auth/supabase-browser`, `.storage.from("piece-tiles")`), at a fixed, predictable path: `${roomId}/reference.webp`. **No new Storage bucket or policy needed** — confirmed both required policies already exist and already cover this path with zero changes: `authenticated can upload piece tiles` (INSERT, `supabase/migrations/20260814000000_rooms.sql`) and `anyone can read piece tiles` (SELECT, `supabase/migrations/20260820000000_room_tile_dimensions.sql`) are both scoped only by `bucket_id = 'piece-tiles'`, not by path pattern.
  - [x] Do this upload *before* `createRoom` is called (same ordering already used for piece tiles) so a failure here can still abort Room creation cleanly, consistent with the existing pipeline's own error-handling shape.

- [x] Task 2: Expose the reference image URL to the client (AC: #1, #4, #5)
  - [x] `src/lib/rooms/get-room-by-slug.ts`'s own `room` query (~L77-81) currently selects only `id, name, grid_rows, grid_cols, tile_width, tile_height` — it doesn't even fetch `image_source`/`image_library_id` today (unlike `get-rooms-for-user.ts`, which already does, for Home's own thumbnail). Add both columns to this query.
  - [x] Compute `referenceImageUrl: string | null`:
    - `image_source === "library"` → look up `LIBRARY_IMAGES` (`src/lib/rooms/library-images.ts`, already a plain server-safe data module, no `"use client"`) by `image_library_id`, use its `src` directly (already a public asset path, no signed URL needed).
    - `image_source === "upload"` → generate a signed URL for `${roomId}/reference.webp`, reusing the exact same `createSignedUrls`-via-anon-key pattern this file already uses for per-piece `imageUrl` (~L106) — mirror it for a single path rather than inventing a new mechanism. **If the signed-URL call fails or the object doesn't exist (AC #5 — an old Room predating this story), resolve to `null` rather than throwing** — a missing reference image must never break loading the Room itself.
  - [x] Add `referenceImageUrl: string | null` to `RoomDetail` (~L56-65).

- [x] Task 3: Press-and-hold fullscreen overlay button (AC: #1, #2, #3, #5)
  - [x] New component, e.g. `src/components/canvas/reference-image-button.tsx`, following `RecenterButton`/`SoundMuteButton`'s exact established pattern (plain DOM `Button`, absolutely positioned sibling of the Canvas under `RoomView` — **not** a Konva node, no canvas-coordinate concerns). Stack it in the same `right-6` corner column, above the mute button (which sits at `bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]` — this one goes further up, e.g. `+9.5rem`).
  - [x] Use native Pointer Events, not separate mouse/touch handlers — `onPointerDown` calls `e.currentTarget.setPointerCapture(e.pointerId)` and shows the overlay; `onPointerUp`/`onPointerCancel` hide it. Pointer capture is what correctly satisfies AC #2 (releasing after dragging off the button still fires `onPointerUp` on the *original* element, not wherever the pointer physically ended up) — do not reach for separate `mousedown`/`touchstart` handlers, which would need manual work to get this right and this codebase's own recent pinch-zoom fix already had to reason carefully about exactly this kind of touch-vs-mouse event-model mismatch.
  - [x] The fullscreen overlay itself: a `position: fixed` full-viewport layer, semi-transparent/solid backdrop, an `<img>` (not a Konva node) with `object-fit: contain` showing `room.referenceImageUrl`, `pointer-events: none` on the image itself so it can never intercept the *same* pointer that's holding the button down, `draggable={false}` and `style={{ touchAction: "none", userSelect: "none" }}` to avoid a mobile browser's native long-press "save image"/text-selection affordance competing with the hold gesture (the exact class of native-gesture conflict Story 3.3's pinch-zoom fix already had to work around for the Canvas itself).
  - [x] `room.referenceImageUrl == null` (AC #5) → render the button `disabled`, same convention `RecenterButton` already uses for its own `disabled` prop before the Canvas is ready. Never attempt to show a broken/missing image.
  - [x] New `aria-label` translation key in `messages/fr.json`'s `Canvas` section (French, matching this app's established tone — something like `"referenceImageAriaLabel": "Voir l'image de référence"`), and an `Icon` from `lucide-react` (already used for `RecenterButton`'s `Crosshair`/`SoundMuteButton`'s `Volume2`/`VolumeX` — pick something clearly distinct, e.g. `Image` or `ImageIcon`, avoiding a name collision with `next/image`'s own `Image` import already used elsewhere in this codebase — check for that collision specifically before choosing the identifier name in this new file).
  - [x] Wire into `RoomView` (`src/components/room/room-view.tsx`) as a new sibling alongside `RecenterButton`/`SoundMuteButton`, passed `room.referenceImageUrl` straight from the `RoomDetail` prop already available there.

- [x] Task 4: Regression + manual verification (AC: all)
  - [x] `pnpm build && pnpm lint && pnpm test` clean.
  - [ ] Manual verification (this repo has no canvas/visual-regression or component-testing infrastructure, see Previous Story Intelligence): (1) create a *new* Room from an uploaded photo, confirm the button shows the correct full image on press-and-hold, on both desktop (mouse) and a real touch device; (2) create a *new* library-sourced Room, confirm the same; (3) press, drag the pointer well outside the button's own bounds while still holding, then release — the overlay must still hide correctly; (4) open an Room created *before* this story shipped (upload-sourced) — confirm the button is disabled, not broken; (5) confirm holding the button doesn't trigger a mobile browser's native long-press menu (image save / text selection) over the overlay.

## Dev Notes

### The exact insertion point for Task 1

`src/app/create/create-room-form.tsx`'s `handleSubmit` (read it fully before touching):
```ts
const bitmap = await loadImageBitmap(selectedImage);           // ~L197 — full original image, here and only here
const { tiles, tileWidth, tileHeight } = await sliceImageIntoTiles(bitmap, rows, cols); // ~L198-202
```
`loadImageBitmap` (~L32-46) already handles both `kind: "upload"` (`createImageBitmap(selectedImage.file)`) and `kind: "library"` (fetches the public asset) uniformly — but Task 1 only needs the upload branch; gate the new resize-and-upload step on `selectedImage.kind === "upload"` specifically, skipping it for `"library"` entirely (AC #4's "no second-class experience" cuts both ways — library Rooms don't need *this* work done, they already have an equivalent asset).

### Storage: reuse `piece-tiles`, do not create a new bucket

Confirmed by reading both relevant migrations — `supabase/migrations/20260814000000_rooms.sql` (INSERT policy) and `supabase/migrations/20260820000000_room_tile_dimensions.sql` (SELECT policy, with its own comment: *"stays private — this only permits generating signed URLs... not public access"*) — both are scoped by `bucket_id = 'piece-tiles'` alone, no path restriction. A `${roomId}/reference.webp` object is already fully covered by both, with zero new migration. Do not introduce a second bucket for this — it would need both policies duplicated for no benefit.

### `get-room-by-slug.ts`'s existing per-piece signed-URL pattern to mirror (Task 2)

```ts
// ~L106, existing pattern for piece imageUrl:
const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, SIGNED_URL_EXPIRES_IN_SECONDS);
```
Task 2 needs the same call shape for a single path (`${roomId}/reference.webp`), not a batch — either reuse `createSignedUrl` (singular) or call the plural form with a one-element array, whichever reads more clearly at the call site. `SIGNED_URL_EXPIRES_IN_SECONDS` (already defined, 1 hour) is reused as-is — no new expiry constant needed.

### Why `referenceImageUrl` must resolve to `null`, never throw, on a missing object

AC #5 exists specifically because Task 1 only runs for *new* Rooms going forward — every upload-sourced Room created before this story shipped has no `reference.webp` object in Storage at all. `createSignedUrls`/`createSignedUrl` against a non-existent object either errors or returns a per-item error in its response array (check Supabase JS SDK's actual behavior for this rather than assuming) — either way, this must be caught and treated as "no reference image for this Room," not allowed to propagate into a broken `getRoomBySlug` call that would take down the whole Room page for an old Room. Mirrors this codebase's own repeated backward-compatibility discipline this session (Story 3.12's `naturalWidth`/`naturalHeight` self-describing check for old, un-padded tiles is the closest precedent: detect the old/missing case from data already at hand, degrade gracefully, never assume every Room was created after the newest feature shipped).

### Pointer Events, not separate mouse/touch handlers (Task 3)

This app already has direct, hard-won experience with mouse-vs-touch event-model mismatches this session (the Firefox-for-Android pinch-zoom fixes, Story 3.3's lineage) — Pointer Events (`onPointerDown`/`onPointerUp`/`onPointerCancel` + `setPointerCapture`) exist precisely to unify this instead of hand-rolling it again. `setPointerCapture` is what makes AC #2 (release-after-dragging-off) work correctly with minimal code — without it, `onPointerUp`/a native `mouseup`/`touchend` would only fire if the pointer is still over the *original* element when released, which a press-and-hold gesture that wanders can easily violate.

### Project Structure Notes

- New file: `src/components/canvas/reference-image-button.tsx` — mirrors `recenter-button.tsx`/`sound-mute-button.tsx` exactly in shape and positioning convention.
- Modified: `src/app/create/create-room-form.tsx` (Task 1), `src/lib/rooms/get-room-by-slug.ts` (Task 2), `src/components/room/room-view.tsx` (wiring), `messages/fr.json` (new translation key).
- No schema/migration changes — `room`'s existing `image_source`/`image_library_id` columns already carry everything needed; only the *query* in `get-room-by-slug.ts` was incomplete.

### Testing standards summary

- No new automated test expected for Task 3 (Konva-adjacent but plain-DOM UI interaction, no component-testing infrastructure in this repo — consistent with `RecenterButton`/`SoundMuteButton` having none either).
- Task 1/2 touch Server Actions/Server Components with no existing direct test harness in this repo (confirmed again this session, Story 3.13) — matches established convention, not a gap to fix here.
- Rely on manual verification (Task 4) for the actual interaction/visual result, as with every other Canvas-interaction story this session.

## Previous Story Intelligence (from this session's own recent work)

- Story 3.12 (real puzzle-piece cut shape) hit the *exact* same "old Room vs. new Room" backward-compatibility shape this story needs for AC #5 — its own fix (reading `naturalWidth`/`naturalHeight` off the loaded image to self-describe whether padding exists, rather than assuming) is the direct precedent for "detect the missing/old case from data already in hand, don't crash, don't stretch/guess."
- This session's pinch-to-zoom fixes (Story 3.3's lineage, 2026-09-04/05) are the direct precedent for why Pointer Events — not hand-rolled mouse+touch handling — are worth reaching for by default now, having already been burned twice by subtle cross-browser touch-event differences.
- `deferred-work.md`'s "Home thumbnail for upload-sourced Rooms" entry (2026-08-17) is the original, never-fixed instance of "no whole image exists for uploads" — this story is the first one to actually close that gap; once done, consider whether Home's own `RoomThumbnail` (`src/app/room-list.tsx`) should also be updated to use the same new reference image instead of its gradient placeholder fallback for upload-sourced Rooms — **not in this story's own AC list, worth flagging to the user as a natural, cheap follow-up once this lands**, not attempting it unprompted here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.14] — this story's own definition, added 2026-09-05.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred: Home thumbnail for upload-sourced Rooms] — the original gap this story closes.
- [Source: src/app/create/create-room-form.tsx, src/lib/piece-cutting/slice-image.ts] — Room-creation image pipeline Task 1 extends.
- [Source: src/lib/rooms/get-room-by-slug.ts, src/lib/rooms/get-rooms-for-user.ts] — the two existing, slightly-diverged query patterns Task 2 reconciles.
- [Source: src/components/canvas/recenter-button.tsx, src/components/canvas/sound-mute-button.tsx, src/components/room/room-view.tsx] — the exact overlay-button convention Task 3 follows.
- [Source: supabase/migrations/20260814000000_rooms.sql, supabase/migrations/20260820000000_room_tile_dimensions.sql] — confirms no new Storage policy/migration is needed.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `pnpm build` — clean (one TS fix needed mid-implementation: `resolveReferenceImageUrl`'s `supabase` parameter, typed via `ReturnType<typeof createSupabaseClient>`, didn't structurally match the call-site's inferred client type due to generic-default mismatch on the Postgrest version parameter; fixed by narrowing the parameter type to just `{ storage: ... }` and renaming the helper to `resolveUploadReferenceImageUrl`, called only from the upload branch, with the library branch resolved inline).
- `pnpm lint` — clean.
- `pnpm test` — 26 files / 203 tests passed, no regressions.

### Completion Notes List

- Task 1: `createReferenceImageBlob` added to `slice-image.ts` (same module as `sliceImageIntoTiles`, same canvas/`toBlob` convention) with `REFERENCE_IMAGE_MAX_DIMENSION = 2000`, scaling down only (never up). `uploadReferenceImage` added to `upload-piece-tiles.ts`, reusing the same bucket/client. Wired into `create-room-form.tsx`'s `handleSubmit`, gated on `selectedImage.kind === "upload"`, uploaded before `uploadPieceTiles`/`createRoom`; both failure branches (`!result.success` and the `catch`) now clean up the reference image alongside the tile paths via the existing `removePieceTiles` (a generic Storage-remove helper despite its name).
- Task 2: `get-room-by-slug.ts`'s `room` query extended with `image_source, image_library_id`; `referenceImageUrl` resolved inline for `"library"` (direct `LIBRARY_IMAGES` lookup, no signed URL) and via the new `resolveUploadReferenceImageUrl` helper for `"upload"` (signed URL for `${roomId}/reference.webp`, resolving to `null` on any error rather than throwing — covers AC #5 for pre-existing Rooms). Added to `RoomDetail`.
- Task 3: New `ReferenceImageButton` (`src/components/canvas/reference-image-button.tsx`) using Pointer Events + `setPointerCapture`/`releasePointerCapture` on `onPointerDown`/`onPointerUp`/`onPointerCancel`; disabled when `referenceImageUrl == null`; fullscreen overlay is a plain `fixed` div with a `pointer-events-none`, non-draggable `<img>` (`touchAction: "none"`). Used `ImageIcon` from `lucide-react` (no collision with `next/image`'s `Image`, since this file doesn't import it). New `referenceImageAriaLabel` key added to `messages/fr.json`'s `Canvas` section. Wired into `RoomView` as a new sibling, stacked above `SoundMuteButton` at `+9.5rem`.
- Task 4: `pnpm build && pnpm lint && pnpm test` all clean. Manual verification left unchecked — this environment has no browser/touch device to actually exercise press-and-hold, signed-URL delivery, or the native long-press-menu suppression; needs the user's own pass per the story's Task 4 checklist.
- Follow-up already recorded in `deferred-work.md` (2026-09-05, before this implementation pass): once this story lands, `src/app/room-list.tsx`'s `RoomThumbnail` should be revisited to reuse this same `reference.webp` asset for upload-sourced Rooms instead of its gradient placeholder — not part of this story's own scope.

### File List

- `src/lib/piece-cutting/slice-image.ts` (modified — new `REFERENCE_IMAGE_MAX_DIMENSION` constant, new `createReferenceImageBlob`)
- `src/lib/rooms/upload-piece-tiles.ts` (modified — new `uploadReferenceImage`)
- `src/app/create/create-room-form.tsx` (modified — reference image upload wired into `handleSubmit`, both cleanup paths)
- `src/lib/rooms/get-room-by-slug.ts` (modified — `image_source`/`image_library_id` added to the `room` query, `referenceImageUrl` added to `RoomDetail`, new `resolveUploadReferenceImageUrl` helper)
- `src/components/canvas/reference-image-button.tsx` (new)
- `src/components/room/room-view.tsx` (modified — `ReferenceImageButton` wired in)
- `messages/fr.json` (modified — new `Canvas.referenceImageAriaLabel` key)

## Change Log

| Date | Change |
|------|--------|
| 2026-09-05 | Story created: press-and-hold fullscreen reference image (desktop + mobile), closing the pre-existing "no whole image for uploads" gap for real. A permanent resizable desktop drawer was considered and explicitly deferred in favor of press-and-hold on both platforms, per user decision. |
| 2026-09-05 | Implemented all 4 tasks: reference-image persistence at Room creation, `referenceImageUrl` exposed via `get-room-by-slug.ts`, `ReferenceImageButton` (Pointer Events + capture) wired into `RoomView`. `pnpm build && pnpm lint && pnpm test` clean. Status → review; manual verification left to the user (no browser/touch device in this environment). |
