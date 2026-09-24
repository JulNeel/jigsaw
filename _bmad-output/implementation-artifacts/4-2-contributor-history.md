baseline_commit: NO_VCS

# Story 4.2: Contributor history

Status: ready-for-dev

## Story

As a Participant,
I want to browse who has contributed to the Room and when,
So that I can see the Room's story, not just its current state.

## Acceptance Criteria

1. **Given** a Room with prior contributions, **when** the Participant opens the contributor history (from the Room or from Statistics), **then** a chronological list of contribution events is shown, accessible from both entry points without a dedicated separate screen.
2. **And** the list updates as new contributions happen, without requiring a manual refresh.

## What this story really is

The first three Epic 4 stories all need the same thing and none of them has it: **the database has no idea who did anything.** Four tables — `room`, `piece`, `piece_adjacency`, `cluster` — and not one of them records a person. Story 4.1 deliberately kept presence ephemeral so that this decision would be made by its first real consumer rather than guessed at in advance.

This is that consumer. 4.3 (retroactively attaching a Guest's contributions on sign-up) and 4.4 (a returning Participant's progress) both attach to what this story creates, so the shape chosen here is the one they inherit.

## Scope decisions

- **The "Statistics" entry point does not exist yet.** `src/app/stats/[roomId]/page.tsx` is `<div>Room Stats</div>` — Epic 5's screen, unbuilt. So the history is built as a **panel component** with the Room as its entry point, and Statistics mounts the same component in one line when Epic 5 arrives. AC #1's "without a dedicated separate screen" is satisfied by a panel either way; a history route would have violated it.
- **A contribution is a placement or a fusion, never a plain reposition.** Sliding a piece around the mat is not contributing, and a history that counted it would be unreadable within a minute. This is also the app's own existing vocabulary: the chime and the pulse already fire on exactly those two events and on nothing else.
- **Volume is real and must be designed for, not discovered.** A 1500-piece Room ends its life with at least 1500 rows. The panel shows the most recent page and fetches older ones on demand; the live feed prepends.

## Tasks / Subtasks

- [ ] Task 1: The `contribution` table (AC: #1)
  - [ ] New migration, following the existing five. Columns: `id`, `room_id` (fk, cascade), `piece_id` (fk), `kind` (`'placed' | 'fused'`, a `check` like `shape_type`'s), `user_id` (nullable, fk `auth.users`), `guest_participant_id` (nullable text), `pseudo` (text), `created_at`.
  - [ ] **`pseudo` is a snapshot, not a join.** A Guest's pseudo lives only in their own browser, so there is nothing to join to; and a registered Participant who renames themselves must not silently rewrite what the Room remembers about last Tuesday. History records what happened.
  - [ ] Index `guest_participant_id`: Story 4.3's whole mechanic is `update contribution set user_id = ... where guest_participant_id = ...`.
  - [ ] `alter publication supabase_realtime add table contribution;` — the same line `piece` and `cluster` each needed.
  - [ ] RLS mirroring the existing tables: read for everyone, **no insert policy at all**. Writes go through the pg pool inside a Server Action (AD-2), which bypasses RLS — so granting an insert policy would open a hole for nothing. Note in the migration that `using (true)` is the *existing, already-deferred* gap (see `deferred-work.md`), deliberately consistent with its neighbours rather than quietly diverging.

- [ ] Task 2: Recording a contribution (AC: #1, #2)
  - [ ] Written **inside the same transaction** as the placement/fusion it describes, in `piece-actions.ts`. Any other arrangement allows a contribution for a placement that rolled back, or a placement with no trace — and this codebase has already spent days on states that disagree with each other.
  - [ ] One row per placed piece, not one per gesture: locking an Îlot of six is six contributions, which is what "who placed which piece" means and what Story 4.4's counting will need.

- [ ] Task 3: Who did it — and how much of that can be trusted (AC: #1)
  - [ ] `movePiece` currently takes `{ pieceId, x, y, expectedVersion }` and has **no idea who is calling**. It gains an actor.
  - [ ] **A signed-in Participant is identified server-side**, from the session, inside the Server Action — never from what the client claims. The pseudo comes from `user_metadata` (Story 4.1). Trustworthy.
  - [ ] **A Guest cannot be.** There is no session, so their `participantId` and pseudo are client-supplied and therefore forgeable. **Say this out loud rather than discover it later:** a Guest could attribute their placement to any name. What that buys an attacker is a wrong name on a history line, in a Room whose invite link they already hold and where they could simply place the piece themselves. It is accepted, not overlooked — and it stops being true for anyone who signs up.
  - [ ] Guard the pseudo through `normalizePseudo` server-side. It arrives from a client; length and blankness are not the client's to decide.

- [ ] Task 4: Reading it back (AC: #1)
  - [ ] A Server Action over the pg pool, matching `room-state.ts` — not PostgREST. Same two reasons: it is how everything else in this app reaches the database (AD-2), and the project's PostgREST was returning `PGRST002` for every anon read as recently as 2026-09-20.
  - [ ] Paginated by `created_at` + `id` (a cursor, not an offset — rows are being inserted at the head while someone reads).

- [ ] Task 5: Keeping it live (AC: #2)
  - [ ] `contribution` joins the **existing** channel as its third table. AD-1 forbids a second channel, not a second table — `piece` and `cluster` already share this one.
  - [ ] New rows prepend. A contribution is immutable once written (4.3's back-fill is the one exception, and it changes `user_id`, not what is displayed), so there is no update path to reconcile and none of Story 4.1's out-of-order hazard applies.

- [ ] Task 6: The panel (AC: #1, #2)
  - [ ] One component, mounted from the Room now and from Statistics later. A button in the Room's chrome, alongside the existing ones.
  - [ ] Each line: who, what, when. Relative time ("il y a 3 min") with an exact `title`/`datetime`, because "14:32" is useless without a date and a full timestamp is noise in a list.
  - [ ] Empty state via the existing `EmptyState` component.
  - [ ] French copy in `messages/fr.json`.
  - [ ] The panel is chrome, not canvas: its own `aria-live` is **not** wanted here — the list is read on demand, and announcing every placement would fight the Room's existing announcements.

- [ ] Task 7: Tests (AC: all)
  - [ ] Unit: the pure parts — grouping, relative-time formatting, the cursor's shape.
  - [ ] e2e: two clients, one places a piece, the other's panel gains the line without a refresh. The harness already seeds rooms and drives two contexts.
  - [ ] **The e2e suite must still never write to `auth.users`.** Contributions from a Guest are testable end to end; a signed-in contribution is not, and should be covered by a unit test of the identity resolution rather than by weakening that rule.
  - [ ] `pnpm lint`, `tsc --noEmit`, `pnpm test`, `pnpm build`, `pnpm e2e` — CI runs the first four on the PR.

## Dev Notes

### The one thing to get right

`user_id` nullable plus `guest_participant_id` nullable is what makes Story 4.3 possible at all: converting a Guest is then an `update ... where guest_participant_id = ?`, touching no other table and losing no history. A design that identified contributors only by pseudo, or only by account, would make 4.3 either impossible or a migration.

### What this story does not do

No counting, no ranking, no per-Participant statistics — that is Epic 5, and `stats/[roomId]` staying a stub is the correct state until then. This story writes the rows those will later aggregate, and displays them chronologically, which is all FR-13 asks for.

### Project Structure Notes

- New: one migration; `src/lib/rooms/contributions.ts` (+ test) and its read Server Action; `src/components/room/contributor-history.tsx`; a chrome button.
- Modified: `src/lib/rooms/piece-actions.ts` (the actor and the insert), `src/lib/db/collections.ts` (third table on the channel), `src/components/room/room-view.tsx`, `messages/fr.json`.

### Testing standards summary

Pure logic under `src/lib/rooms/`, unit-tested in Vitest's node environment. Anything needing a browser goes to `e2e/`. React components have no test harness in this repo — a known, accepted gap.

## Previous Story Intelligence

- **Story 4.1 kept presence deliberately ephemeral so this story could decide the persistent shape.** That deferral is now due.
- **A new first-load surface breaks all four e2e entry points**, not just the fixture — three specs build their own `BrowserContext`. A panel button does not block the canvas, so this should not recur, but check before assuming.
- **`deferred-work.md` carries an open security item about `using (true)` RLS** across the existing tables. This story adds a table to that set. Consistency is the right call for now; making it *worse* is not, hence no insert policy.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2] — the ACs above, verbatim.
- [Source: _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md#FR-13] — "Le Salon conserve et affiche l'historique des personnes ayant contribué."
- [Source: src/lib/rooms/piece-actions.ts] — the transaction a contribution must join, and `movePiece`'s current signature.
- [Source: src/lib/rooms/room-state.ts] — the read-path precedent, and why it is not PostgREST.
- [Source: supabase/migrations/20260830000000_cluster.sql] — the migration and publication pattern to follow.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-24 | Story created. Verified while writing rather than assumed: the Statistics entry point named in AC #1 is an unbuilt stub, so the history is a panel the Room mounts now and Statistics mounts later; `movePiece` has no notion of a caller today, so identity has to be threaded in; and a Guest's identity is client-supplied and therefore forgeable, which is recorded as accepted rather than left to be discovered. |
