baseline_commit: NO_VCS

# Story 4.1: Live presence

Status: ready-for-dev

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

- [ ] Task 1: Identity — a name and a stable id that survive a reload (AC: #1)
  - [ ] `src/lib/rooms/display-name.ts`, mirroring `tutorial-seen.ts` *exactly*: injected `SimpleStorage`, `null` meaning "storage unavailable", never throwing, and a `getSafeLocalStorage()` alongside the existing `getSafeSessionStorage()`. That file's own comment explains why this matters — a privacy-configured browser can throw on the *property access itself*, and a Guest reaching this app with zero friction is exactly the person likely to have one.
  - [ ] **`localStorage`, not `sessionStorage`, and deliberately not per-Room.** The tutorial is per-tab and per-Room on purpose; a name is neither. Key `jigsaw:display-name`, plus `jigsaw:participant-id` (a `crypto.randomUUID()` minted once).
  - [ ] **`participantId` is not cosmetic**: it is the Realtime presence *key*, which is what makes a reconnect replace an entry rather than duplicate it. It must exist before the channel is created (see Task 3), so mint it at module load, not when the name is known.
  - [ ] Unit tests mirroring `tutorial-seen.test.ts`, including the storage-throws case.

- [ ] Task 2: The name prompt — ask, never block (AC: #1)
  - [ ] **Read `first-access-tutorial.tsx` and `room-view.tsx` in full first.** The tutorial is already a blocking dialog for Guests, gated on `isGuest && canvasReady`. A second blocking gate in front of it would make entering a Room a two-step form.
  - [ ] Shown to **everyone without a stored name**, not only Guests: sign-up collects email and password and nothing else (`src/lib/auth/actions.ts` — verified 2026-09-23), so a registered Participant has no display name either. An e-mail must never be shown to other Participants.
  - [ ] **Skippable, with a fallback** — this is the compromise that keeps the zero-friction principle intact. Dismissing gives the Participant `Invité` plus their colour, and they can still be seen and seen by. The name is an invitation, not a toll. **Flagged for the user**: if you would rather the prompt be mandatory, say so — it is a one-line change here and a principle change in the product.
  - [ ] Sequenced after the tutorial for a Guest, shown alone otherwise.
  - [ ] A colour derived deterministically from `participantId` (a small fixed palette drawn from `globals.css`, never a random hex — the palette is warm and narrow, and an arbitrary colour will clash).

- [ ] Task 3: Presence on the existing channel (AC: #4)
  - [ ] **Read `collections.ts`'s `ensureChannel`/`releaseChannel` in full before touching either.** That module owns the single channel (AD-1) and is reference-counted across two collections.
  - [ ] Supabase Presence rides the same channel — `track`, `untrack`, `presenceState` confirmed present in `@supabase/realtime-js` 2.112.2 (verified 2026-09-23). No second channel, no second client: AC #4 is satisfied structurally rather than by promise.
  - [ ] The presence **key** is set in `.channel(name, { config: { presence: { key } } })`, i.e. at creation. So `participantId` must be passed into `createRoomCollections`. The *name* need not — it arrives later through `track()` once the prompt resolves, which is exactly why the two are separate in Task 1.
  - [ ] **`.subscribe()` deliberately has no status callback today, and the reason is written into the code**: a dead channel still reports `SUBSCRIBED`, so status is worthless as a health signal. Presence needs one anyway — `track()` can only be called once joined. Re-add it for *that* purpose only, and leave the existing comment's warning intact rather than quietly deleting it: it is still true, and someone will otherwise "restore" health-checking on the back of this change.
  - [ ] Expose presence from `createRoomCollections` (`{ pieceCollection, clusterCollection, presence }`) rather than leaking the channel object. Leaking it would make AD-1 unenforceable by inspection.

- [ ] Task 4: What "active" means, and how someone disappears (AC: #1, #2)
  - [ ] Activity is a **piece interaction** — a completed drag or a rotation — not merely being connected, and not pan/zoom.
  - [ ] **The window is 5 minutes, and the AC was changed to say so (user decision, 2026-09-23).** It read 30 seconds, which this story's first draft flagged as producing a list that answers "who is working" rather than "who is here" — someone watching you play would have vanished after half a minute, in a feature whose stated purpose is to make the Room "feel like a shared, lived-in space". Five minutes answers the question the story actually asks.
  - [ ] **The two ways of disappearing are not the same mechanism, and only one of them uses that window.** A Participant who closes the tab drops the socket, Supabase emits a presence `leave`, and they are gone at once (AC #2b) — the window never applies to someone who has actually left. It governs only the person still connected and idle. That is what makes five minutes safe rather than stale: the cost of a longer window is a lingering *idle* entry, never a ghost.
  - [ ] Payload: `{ participantId, name, colour, lastActivityAt }`. Re-`track()` on activity, throttled to at most once every ~5s — presence broadcasts to every subscriber, and a drag-heavy session would otherwise chatter.
  - [ ] **Disappearing costs no traffic at all.** An idle Participant simply stops re-tracking; their payload goes stale in everyone's `presenceState()`, and each client filters locally. Nothing needs to be sent for someone to fade out, which is what makes this cheap.
  - [ ] The local re-evaluation ticker should be sized to the window, not copied from it: ~30s is ample for a 5-minute cutoff, where a 5s tick would be sixty wake-ups to notice one change. Precision here buys nothing — nobody can tell whether a name vanished at 5:00 or 5:20.
  - [ ] The window is a named constant, and the *pure* predicate (`isActive(lastActivityAt, now)`) plus the state-to-list reduction (dedupe by key, stable ordering) live in their own module so they can be unit-tested without a browser.

- [ ] Task 5: The overlay and its announcements (AC: #1, #3)
  - [ ] Avatars overlay top-right — the only free corner: top-left holds the back link and Room name, the right edge holds the vertical tool stack.
  - [ ] **Its own `aria-live="polite"` region, not `RoomCanvas`'s.** AC #3 says "decoupled from Canvas manipulation", and the existing region is already carrying placement announcements — sharing it would have presence changes compete with a piece being placed, and lose.
  - [ ] Announce arrivals and departures as names, not counts, and never on the first render (an initial list of four people must not be announced as four arrivals).
  - [ ] French copy in `messages/fr.json` under `Canvas` or a new `Presence` namespace.

- [ ] Task 6: Tests and the harness debt this creates (AC: all)
  - [ ] Unit: the storage helpers, `isActive`, the presence-state reduction, and the colour derivation.
  - [ ] **e2e: every existing test breaks unless this is handled.** `fixtures.ts`'s `openRoom` pre-seeds `jigsaw:tutorial-seen` to get past the tutorial; a new prompt needs the same treatment (`jigsaw:display-name`), and so do the *three* files that build their own contexts by hand rather than using the fixture — `realtime-gap.e2e.ts`, `cluster-lock-in.e2e.ts`, `out-of-order-events.e2e.ts`. Miss one and it fails on a blocked click, which looks nothing like the cause.
  - [ ] e2e: two contexts, one drags a piece, the other sees them appear in the overlay. The 30s expiry is **not** worth an e2e test at real time — that is a 30-second wall-clock wait for something a unit test proves exactly. Assert appearance in the browser, prove expiry in Vitest.
  - [ ] `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`, and the full `pnpm e2e` suite green. CI now runs the first four on the PR.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-23 | **AC amended after the first draft, at the user's decision: the activity window goes from 30 seconds to 5 minutes**, in this story and in `epics.md` where the AC originates. The draft had flagged 30s as answering "who is working" rather than "who is here", which contradicts the story's own purpose. Added AC #2b in the same pass, because the change exposed that the two ways of disappearing are different mechanisms: a real departure is a presence `leave` and is immediate, so the window only ever governs an idle-but-connected Participant. Lengthening it risks a stale entry, never a ghost. |
| 2026-09-23 | Story created. Three scope decisions taken with the user first: ask for a first name on entry (over an auto-generated pseudonym), ephemeral presence with no persistence (4.2/4.4 will define their own model), and this document before implementation. Verified while writing rather than assumed: Presence is available on the installed `realtime-js` 2.112.2 and rides the existing channel (so NFR5 holds structurally); the app has no display-name concept at all, so the prompt applies to registered Participants too; and a new first-load gate will break all four e2e entry points unless they are updated together. |
