---
baseline_commit: 3828ae1408f2a90ac2a3539fb0fa69ec48f176be
---

# Story 3.2: First-access tutorial

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Guest entering a Room for the first time,
I want a short tutorial explaining the core gestures,
so that I know how to move, rotate, place a piece, and form a Cluster before I start.

## Acceptance Criteria

1. On a Guest's first visit to a given Room, once the Canvas loads, a modal tutorial appears automatically, covering four gestures: move a piece, rotate it, place it in the Frame, create a Cluster (FR-9).
2. The modal is built on shadcn `Dialog` (Radix under it): focus trap, `Escape` dismiss, `role="dialog"`/`aria-modal`, an explicit accessible title, sensible initial focus — all inherited from the component, not hand-rolled.
3. On a later visit to the **same Room**, within the **same browser session**, the tutorial does not reappear automatically.
4. The tutorial is Guest-specific (FR-9: "un Invité non connecté") — a signed-in Participant visiting a Room does not see it, regardless of whether they've visited before.

## Tasks / Subtasks

- [x] Task 1: Scaffold the shadcn `Dialog` component (AC: #2)
  - [x] Run `pnpm dlx shadcn@latest add dialog` — creates `src/components/ui/dialog.tsx`. This is the project's first shadcn component beyond `Button`/`Skeleton`; `radix-ui` (`^1.6.7`) is already a dependency (`package.json`), and DESIGN.md explicitly lists `Dialog` among the shadcn components "used as-is" (no override needed). Do not hand-write a Dialog from scratch — Radix's `Dialog.Root` already provides the focus trap, `Escape` handling, `role="dialog"`, `aria-modal`, and portal rendering AC #2 requires.
  - [x] Verify the generated file matches the project's existing conventions (`src/lib/utils` alias, Tailwind v4, `radix-nova` style already configured in `components.json`) — no manual edits should be needed beyond what the CLI produces.
- [x] Task 2: Per-Room, per-session "seen" tracking (AC: #1, #3) — pure, unit-testable logic
  - [x] Create `src/lib/rooms/tutorial-seen.ts` exporting two small functions:
    ```ts
    export type SimpleStorage = Pick<Storage, "getItem" | "setItem">;
    export function hasSeenTutorial(roomSlug: string, storage: SimpleStorage | null): boolean;
    export function markTutorialSeen(roomSlug: string, storage: SimpleStorage | null): void;
    ```
    Key format: `` `jigsaw:tutorial-seen:${roomSlug}` ``. `storage` is injected (not read from `window.sessionStorage` inside these functions) specifically so this stays a pure function testable under Vitest's `environment: "node"` (no `jsdom`/`window` global) — pass `null` for "storage unavailable" (both functions treat `null` as "always show" / "no-op save", never throw.
  - [x] **Use `sessionStorage`, not `localStorage`, at the call site.** EXPERIENCE.md's State Patterns are explicit: *"Invité, accès suivant (même **session**)"* — "same session" is the literal requirement (AC #3), not "ever again on this device". `sessionStorage` is per-tab and cleared when the tab/browser closes, which matches that wording; `localStorage` would over-persist (the tutorial would never reappear even in a brand-new session on the same device) and under-deliver the spec as written.
  - [x] Key by the Room's **invite slug** (the value already in the `/room/[id]` URL segment, per Story 3.1's Dev Notes — the codebase's convention is that this route never looks up a Room by raw UUID). `RoomDetail` (`get-room-by-slug.ts`) does not currently expose a stable Room id to the client and doesn't need to for this — the slug is already available in `RoomPage` from `params`, so thread it down as a plain prop instead of adding a new field to `RoomDetail`.
- [x] Task 3: The tutorial modal component (AC: #1, #2, #3)
  - [x] Create `src/components/room/first-access-tutorial.tsx` ("use client"), rendering the shadcn `Dialog` with content matching `ux-jigsaw-2026-07-28/mockups/key-tutorial-modal.html` exactly:
    - Title: `Tutorial.title` → "Bienvenue dans le Salon"
    - Subtitle: `Tutorial.subtitle` → "Quatre gestes pour commencer à contribuer"
    - Four steps, each an icon + short title + one-line description (see mockup for exact copy: move/rotate/place-in-Frame/create-Cluster — French strings specified in Dev Notes below)
    - Primary CTA: `Tutorial.start` → "Commencer"
    - Secondary/skip action: `Tutorial.later` → "Plus tard"
    - Close button: `aria-label` from `Tutorial.closeAriaLabel` → "Fermer le tutoriel" (shadcn's `DialogClose`/`DialogContent`'s built-in close `X` already provides this pattern — just supply the label)
  - [x] Props: `{ roomSlug: string }`. Internal state: `open` (boolean, `useState(false)` — **must default closed**, never `true`, to avoid a flash of the modal on every render before the session check resolves; see Dev Notes on why this can't be computed synchronously at render time).
  - [x] `useEffect(() => { if (!hasSeenTutorial(roomSlug, window.sessionStorage)) setOpen(true); }, [roomSlug])` — this is the correct, established pattern for "check an external, browser-only source and react to it" (same category as Story 3.1's `usePieceImage`, which does the equivalent for image loads); it is **not** the anti-pattern the `react-hooks/set-state-in-effect` lint rule flagged twice before (Story 2.3, Story 3.1) — those were cases where a value *could* be derived synchronously at render time and was being redundantly reset in an effect instead. `sessionStorage` cannot be read during SSR/first paint (no `window`), so there is no synchronous alternative here; this is a legitimate "subscribe to an external system" effect.
  - [x] Wire the Dialog's `onOpenChange` (fires on `Escape`, overlay click, and the built-in close `X` alike, per Radix's contract) plus the CTA and skip buttons' `onClick`, so that **every dismissal path** — CTA, skip, close `X`, `Escape`, overlay click — calls `markTutorialSeen(roomSlug, window.sessionStorage)` and closes the dialog. AC #3 says "does not reappear", not "only if dismissed via the primary button" — don't special-case one dismissal path to skip marking it seen.
- [x] Task 4: Wire into the Room page, Guest-only (AC: #1, #4)
  - [x] In `src/app/room/[id]/page.tsx`, after resolving `room` successfully (after the not-found/error branches, before/alongside rendering `RoomCanvasClient`), determine `isGuest`: call `createClient()` from `@/lib/auth/supabase-server` (the same helper `requireUser()` uses) and check whether `(await supabase.auth.getUser()).data.user` is null — **do not call `requireUser()` here**, it redirects on no-user, which is exactly the behavior Story 3.1 established this route must never have (AC #1 of that story). This is an informational check only, not a gate.
  - [x] Render `<FirstAccessTutorial roomSlug={slug} />` only `if (isGuest)`, as a sibling of `<RoomCanvasClient room={room} />`. It does not need the `ssr:false` dynamic-import treatment `RoomCanvasClient` needs (that's specifically for Konva, which touches `HTMLCanvasElement` during module init) — `Dialog` is SSR-safe out of the box (renders closed, matching the component's own default state), so a plain `"use client"` import is enough.
- [x] Task 5: Copy (AC: #1, #2)
  - [x] Add a new `Tutorial` namespace to `messages/fr.json` (see Dev Notes for exact strings) alongside the existing `Auth`/`Home`/`Rooms`/`Create`/`RoomView` namespaces — this project's established single source of UI copy (`next-intl`, fixed `fr` locale, per every prior story's Dev Notes).
- [x] Task 6: Tests
  - [x] Unit-test `tutorial-seen.ts` with a small in-memory fake implementing `SimpleStorage` (a `Map`-backed object with `getItem`/`setItem`) — no `jsdom` needed, consistent with `vitest.config.mts`'s `environment: "node"`. Cover: unseen room → `false`; after `markTutorialSeen` → `true` for that room's key; a *different* `roomSlug` is unaffected (independent keys); `storage: null` → `hasSeenTutorial` returns `false` and `markTutorialSeen` is a no-op that doesn't throw.
  - [x] No component-level test for `FirstAccessTutorial`/the wiring in `RoomPage` is required — this codebase's established pattern (every prior story) is that DOM-rendering/integration-level code (Dialog rendering, Server Component auth checks) is verified by `pnpm build`/`pnpm lint` plus a documented manual-browser-verification limitation, not component tests; there is no existing component-testing setup (`@testing-library/react`, `jsdom`) to extend.
- [x] Task 7: Regression check
  - [x] `pnpm build` — zero TypeScript errors
  - [x] `pnpm lint` — clean
  - [x] `pnpm test` — all existing tests pass, plus the new `tutorial-seen.test.ts` cases
  - [x] **Limitation, documented honestly (same as every story since 1.4):** no headless browser available. Recommend the user open a fresh (never-visited) Room's invite link in a **private/incognito window** (so no prior `sessionStorage` state exists) to verify: (a) the modal appears automatically covering all four gestures, (b) `Escape` and clicking outside the modal both dismiss it, (c) reloading the same tab afterward does NOT show it again, (d) opening the same Room in a *new* private window (fresh session) DOES show it again, (e) visiting the same Room while signed in (as its own creator, e.g.) does NOT show it at all.

## Dev Notes

- **Why `sessionStorage` over `localStorage` — this is the single most consequential decision in this story.** The epics AC text says "within the same session"; EXPERIENCE.md's State Patterns table is explicit: *"Invité, accès suivant (**même session**)"* → "Pas de re-tutoriel ; accès direct au canvas." Using `localStorage` would satisfy the literal words of the AC on a *first* read but silently violate the spec's intent the moment a Guest closes their browser and reopens the same invite link days later — EXPERIENCE.md's wording implies the tutorial *should* reappear then (a new session), and `localStorage` would suppress it forever. Don't "improve" this to `localStorage` for a smoother-seeming UX; it's a deliberate, named requirement.
- **This story does not create a Guest identity/session record either** — same boundary Story 3.1 drew ("Epic 4 is where an actual Guest session concept gets built"). `sessionStorage` here is purely a client-side UI-state cache, not a durable Guest session — it has zero relationship to Epic 4's `RoomPresence`/Guest→Participant work. Don't reach for cookies, a server-side session table, or anything beyond the browser's own `sessionStorage`.
- **`isGuest` determination is new to this codebase** — no existing code currently distinguishes an authenticated Participant from a Guest on `/room/[id]` (Story 3.1 deliberately built zero auth-awareness into this route beyond "never gate it"). This story adds the *first* informational (non-gating) auth check on this route. Reuse `createClient()` from `src/lib/auth/supabase-server.ts` exactly as `requireUser()` does internally — do not call `requireUser()` itself (it redirects), and do not build a second Supabase server-client helper.
- **Radix Dialog and SSR**: `Dialog.Root`'s content only mounts into a portal once the component has hydrated client-side; on the server it renders effectively nothing (closed state), which is exactly this component's `open` default. No hydration-mismatch risk as long as `open` starts `false` and only ever flips `true` from the `useEffect`, never computed inline during the render body.
- **Copy (exact strings for `messages/fr.json`'s new `Tutorial` namespace), sourced verbatim from `ux-jigsaw-2026-07-28/mockups/key-tutorial-modal.html`:**
  ```json
  "Tutorial": {
    "title": "Bienvenue dans le Salon",
    "subtitle": "Quatre gestes pour commencer à contribuer",
    "step1Title": "Déplacer une pièce",
    "step1Description": "Glissez-la où vous voulez dans l'espace",
    "step2Title": "Pivoter une pièce",
    "step2Description": "Double-tapez pour la faire tourner",
    "step3Title": "La positionner dans le Cadre",
    "step3Description": "Elle s'accroche seule si elle correspond",
    "step4Title": "Créer un Îlot",
    "step4Description": "Rapprochez deux pièces compatibles pour les assembler",
    "start": "Commencer",
    "later": "Plus tard",
    "closeAriaLabel": "Fermer le tutoriel"
  }
  ```
- **Accessibility Floor reminder (from the mockup's own caption):** the close `X` needs its accessible name (`aria-label`, not just a visual `×`), and every interactive target (CTA, skip, close `X`) must meet the project's minimum tap-target size — the mockup uses ≥44×44px for the close `X` specifically; shadcn's default `Button` sizing (already used everywhere else in this codebase) already satisfies this for the CTA/skip buttons, so only the close `X` needs explicit attention if the generated `Dialog` component's default is smaller.
- **Don't build a re-open/"help" affordance in this story.** EXPERIENCE.md separately notes the tutorial "réapparaît seulement si l'Invité redemande de l'aide" (reappears only if the Guest explicitly asks for help again), but that's not in this story's AC — the epics text for Story 3.2 only specifies auto-show-once-per-session, nothing about a manual re-trigger. Don't add a "?" help button or similar; if that's wanted, it belongs in a later story or a scope amendment.
- **Mockup shows a bottom-sheet visual style, but EXPERIENCE.md's Component Patterns text names `Dialog` specifically** (not the separate shadcn `Sheet` component, which also exists per DESIGN.md's component list). Per EXPERIENCE.md's own precedence rule ("Les spines gagnent en cas de conflit avec les maquettes" — the spine text wins over mockup visuals on conflict), build on `Dialog`; the mockup's rounded-top, slide-from-bottom look on the `< md` viewport (EXPERIENCE.md: "modale tutoriel adaptée plein écran" on mobile) is a responsive styling detail you can approximate with Tailwind classes on `DialogContent` (e.g. full-width/bottom-anchored below `md`), not a reason to swap components. Not a hard AC requirement — reasonable default styling is enough; don't over-invest here.
- **No pan/zoom/drag interactivity exists yet** (Story 3.3/3.5's scope) — the tutorial's four described gestures (move, rotate, place in Frame, create Cluster) are **explanatory copy only** in this story; none of the underlying interactions need to actually work yet for this story's ACs to be satisfied. Resist the temptation to start wiring drag handlers here.

### Project Structure Notes

- New: `src/components/ui/dialog.tsx` (shadcn-generated), `src/lib/rooms/tutorial-seen.ts` (+ `tutorial-seen.test.ts`), `src/components/room/first-access-tutorial.tsx` (new `src/components/room/` directory — first component of its kind; `src/components/canvas/` and `src/components/ui/` already exist as siblings).
- Modified: `src/app/room/[id]/page.tsx` (adds the `isGuest` check and conditionally renders `FirstAccessTutorial`), `messages/fr.json` (new `Tutorial` namespace), `package.json`/`components.json` (shadcn CLI may touch these when adding `Dialog` — expected, not a mistake).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.2-First-access-tutorial] — story statement and AC source
- [Source: _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md#FR-9] — "Au premier accès, un Invité non connecté voit un tutoriel rapide (modale)..." (confirms Guest-only, not all Participants)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md] — Component Patterns "Modale tutoriel" (shadcn Dialog/Radix requirements); State Patterns "Invité, premier accès" / "Invité, accès suivant (même session)" (the "same session" wording this story's `sessionStorage` choice is built on)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/mockups/key-tutorial-modal.html] — exact copy, layout, and accessibility annotations for the modal
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/DESIGN.md] — confirms `Dialog` is a shadcn component "used as-is" (no DESIGN.md override to apply)
- [Source: _bmad-output/implementation-artifacts/3-1-join-a-room-as-a-guest.md] — established `/room/[id]` route conventions (slug-not-UUID lookup, no auth gate), "Guest = no session record" boundary this story respects, `usePieceImage`'s effect pattern this story's `useEffect` mirrors
- [Source: src/lib/auth/require-user.ts, src/lib/auth/supabase-server.ts] — the `createClient()` pattern this story's non-gating `isGuest` check reuses

## Previous Story Intelligence (from Story 3.1)

- `src/app/room/[id]/page.tsx` currently has no auth-awareness at all (checked: reads `getRoomBySlug`, branches on not-found/error, otherwise renders `RoomCanvasClient` unconditionally) — this story is the first to add any auth check to this file, and it must remain strictly informational (never redirect/gate).
- `RoomDetail`/`get-room-by-slug.ts` intentionally omits fields not needed for rendering (e.g., `row`/`col` were removed in Story 3.1's code review specifically to avoid leaking data via Client Component props) — resist the urge to add a Room `id` field to `RoomDetail` just for this story's convenience; the invite slug already available in `RoomPage` from `params` is sufficient and keeps that payload minimal.
- The `react-hooks/set-state-in-effect` ESLint rule has now surfaced twice (Story 2.3, Story 3.1) for the *same* underlying mistake: synchronously resetting state in an effect body when the value was actually derivable at render time. This story's `useEffect` (checking `sessionStorage`) is a genuinely different case — there's no synchronous render-time alternative — but stay alert: if the linter still flags it, the fix pattern from Story 3.1 (`usePieceImage`: key the stored result by the input it was computed for, only ever `setState` from truly async/external callbacks) is the precedent to reapply, not a workaround.
- pnpm is the only package manager (`pnpm dlx shadcn@latest add dialog`, not `npx`/`yarn`).
- Direct Postgres connection (unrelated to this story — no DB access needed here) has hit `ENOTFOUND` from ProtonVPN's IPv6 blocking twice already (Stories 2.4, 3.1); not expected to recur since this story adds no migration, noted only in case `pnpm dlx shadcn@latest add dialog` or `pnpm build` behaves oddly for unrelated network reasons.
- 75 tests currently pass (`pnpm test`); this story adds `tutorial-seen.test.ts` on top, following the exact `is-unique-slug-violation.test.ts` structure (small pure-function module, `describe`/`it` with `vitest`, no mocking framework needed).

### Review Findings

- [x] [Review][Decision] AC #1 says the tutorial appears "once the Canvas loads", but the implementation renders `FirstAccessTutorial` as a plain sibling of `RoomCanvasClient` with no gate on canvas-load completion — Task 4's own literal instructions prescribed exactly this simple wiring, so the modal can appear immediately, overlaid on `RoomCanvasClient`'s "Loading canvas…" placeholder rather than after it resolves. **User decision (2026-08-24): make the modal wait for canvas readiness.** Resolved by adding a new `RoomView` Client Component (`src/components/room/room-view.tsx`) that coordinates a `canvasReady` signal: `RoomCanvas` (`src/components/canvas/room-canvas.tsx`) now accepts an `onReady?: () => void` prop fired once on mount (past the dynamic import's own loading placeholder), threaded through `RoomCanvasClient`'s dynamic-import type; `FirstAccessTutorial` now requires a `canvasReady: boolean` prop and its `open` computation is `canvasReady && !alreadySeen && !dismissed` [src/app/room/[id]/page.tsx, src/components/room/room-view.tsx, src/components/canvas/room-canvas-loader.tsx, src/components/canvas/room-canvas.tsx, src/components/room/first-access-tutorial.tsx]
- [x] [Review][Patch] The new `isGuest` check (`createClient()` + `auth.getUser()`) is completely unguarded — a thrown exception (missing env, network failure) crashes the entire Room route, and a returned `error` with `user: null` is silently treated as "is a Guest" with no logging. This directly contradicts the route's own explicit "zero friction, never gate" requirement (Story 3.1 AC #1) — an unhandled crash is strictly worse than the redirect this route was built to avoid. **Fixed**: wrapped in try/catch, defaulting `isGuest = true` (safe direction — worst case a signed-in Participant sees one extra tutorial modal, never a crash); a returned `error` is now logged via `console.warn` [src/app/room/[id]/page.tsx]
- [x] [Review][Patch] `window.sessionStorage` property access itself can throw (`SecurityError` in Safari private browsing, blocked-cookie contexts, sandboxed iframes) and is completely unguarded at both call sites in `first-access-tutorial.tsx`, even though `tutorial-seen.ts` was explicitly built with a `storage: SimpleStorage | null` escape hatch for exactly "storage unavailable" that's never exercised in practice — the throw happens inside `useSyncExternalStore`'s `getSnapshot`, during render, crashing the Room page for exactly the privacy-conscious/private-browsing Guests this route most needs to welcome frictionlessly. **Fixed**: added `getSafeSessionStorage()` (try/catches the property access itself, returns `null` on failure) and hardened `hasSeenTutorial`/`markTutorialSeen` to also try/catch `getItem`/`setItem` themselves (covers e.g. Safari private mode's `setItem` `QuotaExceededError`, an Edge Case Hunter finding on the same root cause) — both call sites now go through `getSafeSessionStorage()`, never raw `window.sessionStorage`. Added test coverage for a throwing storage and for the no-`window` case [src/components/room/first-access-tutorial.tsx, src/lib/rooms/tutorial-seen.ts, src/lib/rooms/tutorial-seen.test.ts]
- [x] [Review][Patch] Close `X` (`size="icon-sm"`, 28px) and primary CTA "Commencer" (default size, 32px) both fall below the story's own explicitly-flagged ≥44×44px accessibility floor — only the skip button ("Plus tard", `min-h-11`) meets it. The Dev Notes called this out by name as needing explicit attention and it wasn't addressed for either target. **Fixed**: both now carry explicit `min-h-11`/`min-w-11` overrides [src/components/room/first-access-tutorial.tsx]
- [x] [Review][Patch] Close button renders a literal `"✕"` text character instead of the design system's `XIcon` (from `lucide-react`, already imported in `dialog.tsx` and used everywhere else in the app) — the one legitimate reason to override the default close button (a custom French `aria-label`) doesn't require reinventing its visual, just relabeling it. **Fixed**: now renders lucide's `X` icon (`aria-hidden`), same as the rest of the app [src/components/room/first-access-tutorial.tsx]
- [x] [Review][Patch] "Plus tard" is a raw `<button>` bypassing the `Button` component — no `focus-visible` ring, no hover state, no design-system styling, unlike every other interactive element in this codebase. **Fixed**: now a `Button variant="ghost"` with the same `min-h-11` sizing [src/components/room/first-access-tutorial.tsx]
- [x] [Review][Patch] Initial focus lands on the close `X` (first focusable child in DOM order) rather than the primary "Commencer" action — technically satisfies AC #2's "inherited from component" wording, but is an unhelpful default: a Guest's first keyboard/AT interaction is "dismiss", not "proceed". **Fixed**: close button moved last in DOM order (its `absolute` positioning keeps it visually top-right regardless), and the CTA now carries an explicit `autoFocus` [src/components/room/first-access-tutorial.tsx]
- [x] [Review][Patch] `hasSeenTutorial`'s `=== "1"` comparison is a magic, undocumented sentinel value repeated separately at the read and write sites — extract a shared constant. **Fixed**: extracted `SEEN_VALUE` constant, used at both sites [src/lib/rooms/tutorial-seen.ts]
- [x] [Review][Defer] `sessionStorage` implements "same session" as "same browser tab" — opening the same invite link in two tabs (e.g. a messaging-app preview plus the real tap) re-shows the tutorial. This is the literal, deliberate consequence of this story's own extensively-documented sessionStorage-over-localStorage decision; no clean fix exists without a cross-tab mechanism, which is out of scope. Revisit only if this becomes a real reported annoyance [src/lib/rooms/tutorial-seen.ts]
- [x] [Review][Defer] shadcn's generated `dialog.tsx` ships hardcoded English "Close" strings (the default close button's `sr-only` span, `DialogFooter`'s close button) — unreachable via this story's actual usage (`showCloseButton={false}`, `DialogFooter` unused) but will surface in this French-only app if a future feature uses those defaults. The story explicitly instructs against hand-editing CLI-generated output preemptively; fix if/when a future usage actually exercises this path [src/components/ui/dialog.tsx]
- [x] [Review][Defer] The `jigsaw:tutorial-seen:<slug>` sessionStorage key carries no version segment — if a future story changes the tutorial's content/gesture set, already-dismissed sessions stay permanently suppressed with no migration path. Cheap to add later; not needed now, consistent with this project's established "no premature optimization" discipline [src/lib/rooms/tutorial-seen.ts]

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- `useEffect(() => setOpen(true), [roomSlug])` (as literally specified in Task 3's original subtask text) tripped `react-hooks/set-state-in-effect` on first lint run — a 3rd occurrence of this rule (after Stories 2.3 and 3.1), but a genuinely different shape: `sessionStorage` reads are synchronous, so there was no async callback to hang the `setState` off of the way Story 3.1's `usePieceImage` does. Resolved by switching to `useSyncExternalStore` (server snapshot always "seen" → closed on SSR/first hydration render, matching Radix Dialog's own default; client snapshot reads the real `sessionStorage` value) instead of forcing the effect pattern — the officially React-recommended API for exactly this "read a browser-only external source safely across SSR/hydration" case. No workaround/suppression needed; `pnpm lint` is clean.

### Completion Notes List

- Scaffolded the project's first shadcn component beyond `Button`/`Skeleton`: `pnpm dlx shadcn@latest add dialog` → `src/components/ui/dialog.tsx`, untouched from CLI output.
- `src/lib/rooms/tutorial-seen.ts` — pure `hasSeenTutorial`/`markTutorialSeen` pair, storage injected (not read from `window` internally) so it's unit-testable under Vitest's `environment: "node"`; keyed `jigsaw:tutorial-seen:<roomSlug>` in `sessionStorage` specifically (not `localStorage`) per EXPERIENCE.md's "même session" wording.
- `src/components/room/first-access-tutorial.tsx` — the tutorial `Dialog`, content matching the mockup exactly (title, subtitle, 4 gesture steps with `Hand`/`RotateCw`/`Frame`/`Group` lucide icons, "Commencer"/"Plus tard"/close-X actions). Every dismissal path (CTA, skip, close X, Escape, overlay click) funnels through one `onOpenChange` handler that marks the Room's tutorial seen — no path is special-cased to skip it.
- `src/app/room/[id]/page.tsx` — added the route's first auth-awareness: a non-gating `isGuest` check (`createClient()` + `auth.getUser()`, explicitly not `requireUser()`, which redirects). `FirstAccessTutorial` renders only for Guests, per FR-9.
- `messages/fr.json` — new `Tutorial` namespace, copy sourced verbatim from `key-tutorial-modal.html`.
- All ACs satisfied: #1 (auto-show on first Guest visit, all 4 gestures), #2 (shadcn `Dialog`/Radix — focus trap, `Escape`, `role="dialog"`/`aria-modal`, accessible title all inherited, not hand-rolled), #3 (`sessionStorage`-backed, doesn't reappear same session), #4 (Guest-only via the new `isGuest` check).
- `pnpm build`/`pnpm lint` clean; `pnpm test` — 79 tests passing (75 previous + 4 new in `tutorial-seen.test.ts`).
- **Limitation, documented honestly (same as every story since 1.4):** no headless browser available — the actual rendered modal (focus trap behavior, visual layout, real Escape/overlay-click dismissal, sessionStorage persistence across a real reload) couldn't be visually verified here. Recommend the user open a fresh Room invite link in a private/incognito window and confirm: the modal appears with all 4 steps, after the canvas has rendered; Escape and overlay-click both dismiss it; reloading the same tab doesn't reshow it; a *new* private window for the same Room does reshow it; visiting while signed in never shows it.

**Code review round (2026-08-24, Opus subagents):** 1 decision resolved, 7 patches applied, 3 items deferred (logged in `deferred-work.md`), 13 findings dismissed (mostly explicit spec requirements the reviewers hadn't cross-checked, or unreachable given this app's actual navigation/data shapes). User decision: gate the tutorial on canvas readiness rather than accept the simple sibling-wiring Task 4 had literally prescribed — added a `RoomView` coordinator Client Component threading an `onReady` signal from `RoomCanvas` through to `FirstAccessTutorial`. Most consequential patches: the new `isGuest` auth check was completely unguarded (a thrown exception would have crashed the "zero friction" Room route entirely — now wrapped in try/catch, defaulting safely to `isGuest = true`); `window.sessionStorage` access itself (not just the already-injectable storage parameter) could throw in private-browsing/blocked-storage contexts and was never guarded, despite the story's explicit "never throw" requirement — added `getSafeSessionStorage()` and hardened `hasSeenTutorial`/`markTutorialSeen` to also catch `getItem`/`setItem` failures. Also fixed: two of three interactive targets (close X, primary CTA) were below the story's own explicitly-flagged ≥44×44px accessibility floor; the close button rendered a literal `"✕"` character instead of the design system's icon; "Plus tard" was a raw unstyled `<button>`; initial keyboard focus landed on "dismiss" rather than the primary action; a magic string sentinel was extracted to a named constant. Verified via `pnpm build`, `pnpm lint`, `pnpm test` (81 tests, 79 previous + 2 new covering throwing storage and the no-`window` case).

### File List

**New:**
- `src/components/ui/dialog.tsx` (shadcn CLI-generated)
- `src/lib/rooms/tutorial-seen.ts`
- `src/lib/rooms/tutorial-seen.test.ts`
- `src/components/room/first-access-tutorial.tsx`
- `src/components/room/room-view.tsx` (code review: canvas-readiness coordinator, added to resolve the AC #1 timing decision)

**Modified:**
- `src/app/room/[id]/page.tsx` (adds non-gating `isGuest` check, now try/catch-guarded; renders `RoomView` instead of `RoomCanvasClient`/`FirstAccessTutorial` directly)
- `messages/fr.json` (new `Tutorial` namespace)
- `src/components/canvas/room-canvas-loader.tsx` (code review: threads an `onReady?: () => void` prop through the dynamic-import type)
- `src/components/canvas/room-canvas.tsx` (code review: accepts `onReady`, fires it once on mount)
- `src/lib/rooms/tutorial-seen.ts` (code review: `getSafeSessionStorage()` added; `hasSeenTutorial`/`markTutorialSeen` hardened against throwing storage; `SEEN_VALUE` constant extracted)
- `src/lib/rooms/tutorial-seen.test.ts` (code review: added throwing-storage and no-`window` test cases)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-24 | Story implemented: shadcn `Dialog` scaffolded, `sessionStorage`-backed per-Room "seen" tracking, Guest-only first-access tutorial modal wired into `/room/[id]` (AC #1–#4) |
| 2026-08-24 | Code review (Opus subagents): 1 decision resolved (gate tutorial on canvas readiness), 7 patches applied, 3 items deferred to `deferred-work.md`. Status → done. |
