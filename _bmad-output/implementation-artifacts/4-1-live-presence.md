baseline_commit: NO_VCS

# Story 4.1: Live presence

Status: review

## Story

As a Participant in a Room,
I want to see who else is currently active,
So that the Room feels like a shared, lived-in space rather than a static document.

## Acceptance Criteria

1. **Given** a Room with several Participants who have interacted recently, **when** any of them has had activity within the last 5 minutes, **then** they appear in the live presence list/avatars overlay.
2. **And** a Participant with no activity for more than 5 minutes disappears from the list.
2b. **And** a Participant who actually leaves — closes the tab, loses the connection — disappears immediately, without waiting out that window.
3. **And** presence updates are announced via an `aria-live="polite"` region for screen-reader users, decoupled from Canvas manipulation.
4. **And** presence is carried by the same synchronization channel as the rest of the Room's shared state — no separate real-time channel is introduced (NFR5).

## Scope decisions (confirmed with the user, 2026-09-23, before this story was written)

- **Identity: ask for a first name on entry**, remembered afterwards. Chosen over an auto-generated pseudonym and over numbered anonymity. This is a real product choice with a real cost, recorded here because the alternative was recommended and declined: the app's own documented principle is that a Guest reaches a Room with *zero friction*, and a name prompt is friction. The resolution below is "ask, never block" — see Task 2.
- **Ephemeral only.** Nothing is persisted: no `participant` table, no `contribution` table, no migration. Presence lives entirely in the Realtime channel and dies with the session. Stories 4.2 (contributor history) and 4.4 (returning Participant keeps progress) *will* need a persistent model, and will define it themselves — guessing now at what 4.2 needs is the classic way to get it wrong.
- **This document first**, per the repo's own convention for all nineteen prior stories.

## Tasks / Subtasks

- [x] Task 1: Identity — a name and a stable id that survive a reload (AC: #1)
  - [x] `src/lib/rooms/display-name.ts`, mirroring `tutorial-seen.ts` *exactly*: injected `SimpleStorage`, `null` meaning "storage unavailable", never throwing, and a `getSafeLocalStorage()` alongside the existing `getSafeSessionStorage()`. That file's own comment explains why this matters — a privacy-configured browser can throw on the *property access itself*, and a Guest reaching this app with zero friction is exactly the person likely to have one.
  - [x] **`localStorage`, not `sessionStorage`, and deliberately not per-Room.** The tutorial is per-tab and per-Room on purpose; a name is neither. Key `jigsaw:display-name`, plus `jigsaw:participant-id` (a `crypto.randomUUID()` minted once).
  - [x] **`participantId` is not cosmetic**: it is the Realtime presence *key*, which is what makes a reconnect replace an entry rather than duplicate it. It must exist before the channel is created (see Task 3), so mint it at module load, not when the name is known.
  - [x] Unit tests mirroring `tutorial-seen.test.ts`, including the storage-throws case.

- [x] Task 2: The name prompt — ask, never block (AC: #1)
  - [x] **Read `first-access-tutorial.tsx` and `room-view.tsx` in full first.** The tutorial is already a blocking dialog for Guests, gated on `isGuest && canvasReady`. A second blocking gate in front of it would make entering a Room a two-step form.
  - [x] Shown to **everyone without a stored name**, not only Guests: sign-up collects email and password and nothing else (`src/lib/auth/actions.ts` — verified 2026-09-23), so a registered Participant has no display name either. An e-mail must never be shown to other Participants.
  - [x] **Skippable, with a fallback** — this is the compromise that keeps the zero-friction principle intact. Dismissing gives the Participant `Invité` plus their colour, and they can still be seen and seen by. The name is an invitation, not a toll. **Flagged for the user**: if you would rather the prompt be mandatory, say so — it is a one-line change here and a principle change in the product.
  - [x] Sequenced after the tutorial for a Guest, shown alone otherwise.
  - [x] A colour derived deterministically from `participantId` (a small fixed palette drawn from `globals.css`, never a random hex — the palette is warm and narrow, and an arbitrary colour will clash).

- [x] Task 3: Presence on the existing channel (AC: #4)
  - [x] **Read `collections.ts`'s `ensureChannel`/`releaseChannel` in full before touching either.** That module owns the single channel (AD-1) and is reference-counted across two collections.
  - [x] Supabase Presence rides the same channel — `track`, `untrack`, `presenceState` confirmed present in `@supabase/realtime-js` 2.112.2 (verified 2026-09-23). No second channel, no second client: AC #4 is satisfied structurally rather than by promise.
  - [x] The presence **key** is set in `.channel(name, { config: { presence: { key } } })`, i.e. at creation. So `participantId` must be passed into `createRoomCollections`. The *name* need not — it arrives later through `track()` once the prompt resolves, which is exactly why the two are separate in Task 1.
  - [x] **`.subscribe()` deliberately has no status callback today, and the reason is written into the code**: a dead channel still reports `SUBSCRIBED`, so status is worthless as a health signal. Presence needs one anyway — `track()` can only be called once joined. Re-add it for *that* purpose only, and leave the existing comment's warning intact rather than quietly deleting it: it is still true, and someone will otherwise "restore" health-checking on the back of this change.
  - [x] Expose presence from `createRoomCollections` (`{ pieceCollection, clusterCollection, presence }`) rather than leaking the channel object. Leaking it would make AD-1 unenforceable by inspection.

- [x] Task 4: What "active" means, and how someone disappears (AC: #1, #2)
  - [x] Activity is a **piece interaction** — a completed drag or a rotation — not merely being connected, and not pan/zoom.
  - [x] **The window is 5 minutes, and the AC was changed to say so (user decision, 2026-09-23).** It read 30 seconds, which this story's first draft flagged as producing a list that answers "who is working" rather than "who is here" — someone watching you play would have vanished after half a minute, in a feature whose stated purpose is to make the Room "feel like a shared, lived-in space". Five minutes answers the question the story actually asks.
  - [x] **The two ways of disappearing are not the same mechanism, and only one of them uses that window.** A Participant who closes the tab drops the socket, Supabase emits a presence `leave`, and they are gone at once (AC #2b) — the window never applies to someone who has actually left. It governs only the person still connected and idle. That is what makes five minutes safe rather than stale: the cost of a longer window is a lingering *idle* entry, never a ghost.
  - [x] Payload: `{ participantId, name, colour, lastActivityAt }`. Re-`track()` on activity, throttled to at most once every ~5s — presence broadcasts to every subscriber, and a drag-heavy session would otherwise chatter.
  - [x] **Disappearing costs no traffic at all.** An idle Participant simply stops re-tracking; their payload goes stale in everyone's `presenceState()`, and each client filters locally. Nothing needs to be sent for someone to fade out, which is what makes this cheap.
  - [x] The local re-evaluation ticker should be sized to the window, not copied from it: ~30s is ample for a 5-minute cutoff, where a 5s tick would be sixty wake-ups to notice one change. Precision here buys nothing — nobody can tell whether a name vanished at 5:00 or 5:20.
  - [x] The window is a named constant, and the *pure* predicate (`isActive(lastActivityAt, now)`) plus the state-to-list reduction (dedupe by key, stable ordering) live in their own module so they can be unit-tested without a browser.

- [x] Task 5: The overlay and its announcements (AC: #1, #3)
  - [x] Avatars overlay top-right — the only free corner: top-left holds the back link and Room name, the right edge holds the vertical tool stack.
  - [x] **Its own `aria-live="polite"` region, not `RoomCanvas`'s.** AC #3 says "decoupled from Canvas manipulation", and the existing region is already carrying placement announcements — sharing it would have presence changes compete with a piece being placed, and lose.
  - [x] Announce arrivals and departures as names, not counts, and never on the first render (an initial list of four people must not be announced as four arrivals).
  - [x] French copy in `messages/fr.json` under `Canvas` or a new `Presence` namespace.

- [x] Task 6: Tests and the harness debt this creates (AC: all)
  - [x] Unit: the storage helpers, `isActive`, the presence-state reduction, and the colour derivation.
  - [x] **e2e: every existing test breaks unless this is handled.** `fixtures.ts`'s `openRoom` pre-seeds `jigsaw:tutorial-seen` to get past the tutorial; a new prompt needs the same treatment (`jigsaw:display-name`), and so do the *three* files that build their own contexts by hand rather than using the fixture — `realtime-gap.e2e.ts`, `cluster-lock-in.e2e.ts`, `out-of-order-events.e2e.ts`. Miss one and it fails on a blocked click, which looks nothing like the cause.
  - [x] e2e: two contexts, one drags a piece, the other sees them appear in the overlay. The 30s expiry is **not** worth an e2e test at real time — that is a 30-second wall-clock wait for something a unit test proves exactly. Assert appearance in the browser, prove expiry in Vitest.
  - [x] `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`, and the full `pnpm e2e` suite green. CI now runs the first four on the PR.

## Dev Notes

### Why presence does not need a table

Nothing here outlives the session by design, so there is no migration, no RLS policy to get wrong, and nothing to clean up. That is also why this story cannot be quietly extended into 4.2: contributor history needs a durable record of *who did what*, which is a different shape from *who is here now*, and deserves its own schema decision.

### The constraint that shaped everything

AC #4 (NFR5) forbids a second channel. That is not a formality — this project already spent two days on Realtime failure modes (a channel reporting `SUBSCRIBED` while delivering nothing, and row changes arriving out of order), and a second channel would double that surface. Supabase Presence multiplexes over the channel that already exists, which is why this is a small story rather than a large one.

### What this story must not undo

`collections.ts` carries hard-won comments about the channel lying about its own health and about out-of-order delivery. Task 3 re-adds a `.subscribe()` status callback, which is precisely the shape of the thing those comments warn against. Re-add it for `track()` and say so in the code, or the next person will read the callback as permission to trust the status.

### Project Structure Notes

- New: `src/lib/rooms/display-name.ts` (+ test), `src/lib/rooms/presence.ts` (+ test, the pure predicate and reduction), `src/components/room/name-prompt.tsx`, `src/components/room/presence-overlay.tsx`.
- Modified: `src/lib/db/collections.ts` (presence on the shared channel), `src/components/room/room-view.tsx` (mount the two new components), `src/app/room/[id]/page.tsx` or `room-view` (thread `participantId`), `messages/fr.json`, and the four e2e files named in Task 6.
- No migration. No Server Action. No change to any existing table.

### Testing standards summary

Pure logic in its own modules under `src/lib/rooms/`, unit-tested under Vitest's node environment — the established pattern here (`tutorial-seen.test.ts`, `predicted-fusion-events.test.ts`). Anything needing a real browser goes to `e2e/`, which now has 23 tests and a harness that seeds rooms declaratively. React components themselves still have no test harness in this repo, which is a known and accepted gap.

## Previous Story Intelligence

- **Story 3.19's Task 4 sat unverified for ten days** because the environment had no browser. It does now. Do not write "verify manually" into this story's tasks — verify it, or record precisely what could not be verified and why.
- **Two days of Realtime debugging (2026-09-20 to 09-22)** produced three durable lessons this story inherits: the channel can lie about its health; row changes can arrive out of order; and a client's own optimistic state can mask what the server confirmed. Presence is read-only and ephemeral, so none of these are fatal here — but the same channel is carrying it.
- **`e2e/support/fixtures.ts`'s `openRoom` is not the only way a test opens a Room.** Three specs build their own `BrowserContext` for `routeWebSocket`. Any change to what blocks the canvas on first load has to touch all four.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1] — the ACs above, verbatim.
- [Source: src/lib/db/collections.ts] — `ensureChannel`/`releaseChannel`, the single channel (AD-1), and the comments on channel health and delivery order.
- [Source: src/lib/rooms/tutorial-seen.ts] — the storage idiom Task 1 mirrors, including why property access itself is wrapped.
- [Source: src/components/room/room-view.tsx, src/components/room/first-access-tutorial.tsx] — the first-access flow Task 2 has to sequence behind.
- [Source: src/lib/auth/actions.ts] — sign-up collects email and password only; no display name exists anywhere.

## Dev Agent Record

### Agent Model Used

Claude Opus 5

### Completion Notes List

- All six tasks implemented. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (270 tests) and `pnpm build` clean; `pnpm e2e` 25/25.
- **Task 4's activity hook landed somewhere better than the story proposed.** Rather than reporting activity from the canvas's drag handlers, `presence.reportActivity()` is called from `collections.ts`'s `onUpdate` — every move, rotation and placement this client dispatches already passes through there, so it is one place and impossible to forget when a new interaction is added.
- **Task 2's sequencing needed a signal the story had not anticipated.** Gating the name prompt on "the tutorial was dismissed" would never fire for a returning Guest, who never sees the tutorial at all — they would never be asked for a name. `FirstAccessTutorial` now reports `onResolved` in *both* cases.
- A skip is "not now", not "never": it sets this visit's answer without writing anything, so the prompt returns on the next visit. Recorded because it is a product decision taken during implementation, not one the story specified.
- **Not verified, and deliberately so:** the 5-minute expiry has no browser test. It is a pure function of a timestamp and a clock, proved exactly in `presence.test.ts`; an e2e version would mean a five-minute wall-clock wait for a weaker result. AC #2b (immediate departure) *is* verified in a browser, because that one depends on Supabase's own `leave` event rather than on our arithmetic.
- **Harness debt, as predicted, and it was all four entry points.** The fixture plus the three specs that build their own `BrowserContext` for `routeWebSocket` all needed the name seeded; missing one fails on a blocked click.
- **`e2e/move-rejection.e2e.ts` failed once across eleven full runs during this work** (~9%), with the same signature as the flake declared resolved on 2026-09-22. That "resolved" was called on ten consecutive green runs, which at this rate happen 39% of the time by chance. `deferred-work.md` has been corrected and the item reopened. This story's presence work cannot be cleanly exonerated, though the signature points at the gesture rather than at the channel.

### Completion Notes — pseudo at sign-up (2026-09-23, user request)

- **Sign-up now collects a pseudo**, carried in `user_metadata` rather than in a table of our own: it is the only thing the app knows about the person, it belongs to the account, and a `participant` table is Story 4.2/4.4's decision to make.
- **`RoomView` prefers it over anything this browser remembers**, and never opens the prompt for a Participant who has one. The prompt now covers exactly two cases: a Guest, and someone who signed up before the field existed.
- **The rule for "what a pseudo is" is shared, not duplicated.** `normalizePseudo` and `MAX_PSEUDO_LENGTH` live in `participant-identity.ts` and the Server Action imports them. Two independent caps would mean an account whose pseudo is silently truncated the first time it is displayed.
- Terminology settled on *pseudo* throughout, including the in-Room prompt, which previously said "prénom".
- **A mistake worth recording, caught by the existing tests.** The edit that added the pseudo guard to `signUp` also landed in `signIn`, which has a byte-identical field-reading block — `signIn` began demanding a pseudo nobody was sending, and rejected every sign-in as a malformed submission. Seven pre-existing tests failed immediately and named it precisely. Nothing about this was caught by types.
- No e2e for the sign-up flow, deliberately: the harness never writes to `auth.users`, and that rule is worth more than the coverage.

### File List

- `src/lib/rooms/participant-identity.ts` (new, + test) — name, id and colour, mirroring `tutorial-seen.ts`'s storage contract.
- `src/lib/rooms/presence.ts` (new, + test) — the window, the pure state reduction, the arrival/departure diff.
- `src/lib/rooms/use-presence.ts` (new) — the two clocks: channel events, and a 30s ticker for going quiet.
- `src/components/room/name-prompt.tsx` (new), `src/components/room/presence-overlay.tsx` (new).
- `src/lib/db/collections.ts` (modified) — presence on the existing channel, the `.subscribe()` callback and its warning, `reportActivity` from `onUpdate`.
- `src/components/canvas/room-canvas.tsx`, `src/components/room/room-view.tsx`, `src/components/room/first-access-tutorial.tsx`, `messages/fr.json` (modified).
- `src/lib/auth/actions.ts`, `src/app/sign-in/sign-up-form.tsx`, `src/lib/auth/actions.test.ts`, `src/app/room/[id]/page.tsx` (modified, 2026-09-23) — the pseudo at sign-up.
- `e2e/presence.e2e.ts` (new); `e2e/support/fixtures.ts`, `e2e/support/drag.ts`, `e2e/realtime-gap.e2e.ts`, `e2e/cluster-lock-in.e2e.ts`, `e2e/out-of-order-events.e2e.ts` (modified).

## Change Log

| Date | Change |
|------|--------|
| 2026-09-23 | **AC amended after the first draft, at the user's decision: the activity window goes from 30 seconds to 5 minutes**, in this story and in `epics.md` where the AC originates. The draft had flagged 30s as answering "who is working" rather than "who is here", which contradicts the story's own purpose. Added AC #2b in the same pass, because the change exposed that the two ways of disappearing are different mechanisms: a real departure is a presence `leave` and is immediate, so the window only ever governs an idle-but-connected Participant. Lengthening it risks a stale entry, never a ghost. |
| 2026-09-23 | Sign-up collects a pseudo (user request), stored in `user_metadata`; a registered Participant is never asked again in a Room. The validation rule is shared with the Room prompt rather than duplicated. |
| 2026-09-23 | Story created. Three scope decisions taken with the user first: ask for a first name on entry (over an auto-generated pseudonym), ephemeral presence with no persistence (4.2/4.4 will define their own model), and this document before implementation. Verified while writing rather than assumed: Presence is available on the installed `realtime-js` 2.112.2 and rides the existing channel (so NFR5 holds structurally); the app has no display-name concept at all, so the prompt applies to registered Participants too; and a new first-load gate will break all four e2e entry points unless they are updated together. |
