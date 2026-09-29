baseline_commit: NO_VCS

# Story 4.4: Returning Participant keeps their progress

Status: ready-for-dev

## Story

As a registered Participant,
I want to leave a Room and come back later,
So that my progress and stats are exactly where I left them.

## Acceptance Criteria

1. **Given** a registered Participant who previously contributed to a Room, **when** they return to that Room in a later session (same day or afterward), **then** their prior progress and stats are intact and reflected immediately.
2. **And** this holds whether they return via the Room's link or by selecting it from Home.

## What is already true, and what is not

Worth separating before planning anything, because half of this story is a claim about existing behaviour rather than work.

**Already true.** Nothing about a Room is scoped to a session: `get-room-by-slug.ts` has no owner check and no auth gate, so a returning Participant opening the link sees the Room exactly as they left it. Their contributions persist, attributed to their account, since Story 4.2. There is no "progress" held in a browser that could be lost.

**Not true.** "Or by selecting it from Home" — `get-rooms-for-user.ts` reads `where r.created_by = $1`. Home lists only Rooms you *created*. A Participant who contributed to someone else's Room has no route back to it short of still having the invite link.

That gap was found in real use (2026-09-29) rather than by reading this AC: a Guest who signed up to keep their contributions landed on an empty dashboard. Story 4.3 fixed the immediate contradiction by returning them to the Room instead. This story fixes the underlying one.

## Scope decisions

- **"Stats" here means "nothing was lost", not a statistics screen.** Epic 5 owns per-Participant counts, ranking and sorting, and `stats/[roomId]` stays its stub. What this story adds is one number per Room — how many contributions are *yours* — because "my progress" is not meaningful expressed only as the Room's overall progress, and because it is a single `count` over a table that already exists.
- **Owned and contributed Rooms belong in one list, distinguished.** Two sections would say the split matters more than it does; an undifferentiated list would be worse, because deleting is owner-only.

## Tasks / Subtasks

- [ ] Task 1: Home lists Rooms you contributed to (AC: #2)
  - [ ] `getRoomsForUser`: `where r.created_by = $1 or exists (select 1 from contribution c where c.room_id = r.id and c.user_id = $1)`.
  - [ ] Return `isOwner` per Room, and `myContributions` (a `count` filtered on `c.user_id = $1`).
  - [ ] **Index `contribution(user_id)`.** The existing index leads with `room_id`, so the `exists` above has nothing to seek on. One migration, one line.
  - [ ] Ordering: `created_at desc` is the Room's own age and says nothing about when *you* last touched it. Order by your most recent contribution, falling back to the Room's creation for one you own but never played.

- [ ] Task 2: Only an owner sees a delete button (AC: #2)
  - [ ] `RoomListItem`'s `action` is already optional, so this is a condition rather than a change of shape.
  - [ ] **The server already refuses**: `delete from room where id = $1 and created_by = $2` (`actions.ts`). So this is not a security fix — it is a fix for a button that would silently do nothing, which is worse than an error.

- [ ] Task 3: Saying which is which (AC: #2)
  - [ ] A Room you contributed to shows your own contribution count; one you created shows the Room's progress as it does today. Both, where both apply.
  - [ ] French copy in `messages/fr.json`. The empty state changes meaning too — "you have no Rooms" is now "you have neither created nor joined one".

- [ ] Task 4: Tests, and an honest account of what cannot be tested
  - [ ] Unit: the mapping and the `isOwner` derivation, wherever they can be isolated from the query.
  - [ ] **Home is behind `requireUser`, and the e2e harness never writes to `auth.users`.** So no browser test can reach this screen. That rule has held for four stories and is worth more than the coverage.
  - [ ] What *can* be reached is the part carrying all the risk — the SQL. The e2e harness already holds a direct `pg` pool and already borrows a real `auth.users` id for `room.created_by`. **Try importing `getRoomsForUser` there and asserting against seeded rows.** It is `import "server-only"`, which may or may not survive Playwright's loader; if it does not, extract the query into a plain module the test can import, rather than testing nothing.
  - [ ] Verify, and record, that a Room reached by its link is unchanged for a returning contributor — the half of AC #1 that is a claim about existing behaviour.

## Dev Notes

### Why this is small

Story 4.2 made contributions durable and attributed. Story 4.3 made a Guest's contributions claimable. Everything this story needs is already in the database; what is missing is one `or exists` and the honesty to show it differently from a Room you own.

### The thing most likely to go wrong

Ordering by "your most recent contribution" turns a simple `group by` into a query with two aggregates over different filters. Get it wrong and a Room you created but never played disappears from the list, or one you contributed to a month ago jumps to the top. Worth writing the SQL deliberately rather than by extending the existing string.

### Project Structure Notes

- New: one migration (an index).
- Modified: `src/lib/rooms/get-rooms-for-user.ts`, `src/app/room-list.tsx`, `messages/fr.json`.
- Untouched on purpose: `stats/[roomId]`, which is Epic 5's.

## Previous Story Intelligence

- **The gap this story closes was found by playing, not by reading the AC.** The AC had said it since the epic was written.
- **`server-only` and the e2e harness have not met yet.** Story 4.2's read path was tested through the browser instead; this story cannot do that, so the import question is a real unknown rather than a formality.
- **Four stories have now respected "the harness never writes to `auth.users`."** This is the second time it costs real coverage (Story 4.3's claim action was the first). Both times the answer was to say so rather than weaken it.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4] — the ACs above, verbatim.
- [Source: src/lib/rooms/get-rooms-for-user.ts] — the `where r.created_by = $1` this story widens.
- [Source: src/lib/rooms/actions.ts] — `delete from room where id = $1 and created_by = $2`, which is why Task 2 is ergonomics rather than authorisation.
- [Source: supabase/migrations/20260924000000_contribution.sql] — the table, and its `room_id`-leading index.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-29 | Story created, after a user asked the question the AC had been asking all along: how does a signed-in contributor get back to a Room they do not own? Separates what is already true (the Room itself is not session-scoped and needs nothing) from what is not (Home lists only Rooms you created). Scopes "stats" to one number — your own contribution count — leaving Epic 5's screen alone. |
