baseline_commit: NO_VCS

# Story 4.3: Sign-up prompt on exit

Status: ready-for-dev

## Story

As a Guest about to leave a Room,
I want to be offered a way to keep my progress,
So that my contribution isn't lost the moment I close the tab.

## Acceptance Criteria

1. **Given** a Guest who has contributed during the current session, **when** they take an explicit exit action (a "leave" button), **then** a prompt offers to sign up or sign in before leaving, dismissible without pressure.
2. **And** the same prompt fires on a best-effort basis on tab/app close where the platform allows it, with no reliability guarantee in that case.
3. **And** if the Guest signs up from this prompt, every contribution made during the current session is retroactively attached to the new account — the contribution counter does not reset to zero.
4. **And** if the Guest declines or the prompt cannot fire, their contribution remains in the shared Room but is no longer traceable to a personal account afterward.

## The thing this story actually has to fix first

Story 4.2 shipped `contribution.guest_participant_id` two days ago, and **that column reaches every client in the Room, twice**: `fetchContributions` returns it, and Realtime broadcasts the whole row on insert.

That was harmless while nothing acted on it. This story makes it the key that transfers ownership of a contribution — so as designed, any Participant could read every Guest's id straight out of the history they are already shown, and claim their pieces.

**The fix is to stop storing the raw id.** `contribution.guest_participant_id` becomes a hash of it. The hash is what gets broadcast and displayed, which is fine — it is stable, it groups a Guest's own lines together, and it is not reversible. Claiming requires the pre-image, which only that Guest's browser has.

This is cheap now and expensive later, and that is the whole argument for doing it in this story: the column is two days old and holds nothing but test rows.

## Scope decisions to confirm

- **AC #2 cannot be implemented as written, and the AC half-knows it** ("no reliability guarantee"). No current browser lets a page show its own dialog during `beforeunload` — you get the generic "Leave site?" string or nothing, and only after an interaction. A sign-up offer is not expressible there.
  Worse, the generic prompt would be actively wrong here: **nothing is unsaved.** Every contribution is already committed. Warning someone that they might lose work they cannot lose is user-hostile noise.
  **Recommendation: implement AC #1 and #3 fully, and deliberately not #2** — recording that decision rather than shipping a prompt that lies. Flagged for the user; overrule it and it becomes a one-line `beforeunload` handler with a generic browser string.
- **A Guest's only way out today already goes to `/sign-in`.** The top-left link in a Room is `href={isGuest ? "/sign-in" : "/"}`. So AC #1's "leave button" exists — it simply doesn't ask anything first. This story intercepts it, which is smaller than adding a new affordance.
- **Only a Guest who actually contributed is asked.** AC #1 says so, and it matters: prompting someone who watched for thirty seconds and left is the kind of thing that makes people distrust a product.

## Tasks / Subtasks

- [ ] Task 1: Stop exposing the key that grants ownership (prerequisite for AC #3)
  - [ ] Migration: rewrite `contribution.guest_participant_id` to hold `sha256(participantId)` rather than the id. Rename it `guest_key` so nothing keeps treating it as an identifier that can be sent back.
  - [ ] **Existing rows: there are none worth keeping** — the column is two days old and has only ever held e2e rows, which are deleted with their Rooms. Truncate rather than attempt a migration of values that cannot be hashed retroactively anyway (the pre-images are in browsers, not in the database). Say so in the migration, so a future reader does not assume data was silently dropped.
  - [ ] Hash server-side, in `resolveActor` — the raw id must never be written.
  - [ ] Update the index (`contribution_guest_idx`) and `contribution-row.ts`'s mapping and its tests. The panel's colour derivation moves to the hash, which is stable and non-reversible; it groups a Guest's lines exactly as before.

- [ ] Task 2: The prompt (AC: #1, #4)
  - [ ] Intercept the Room's existing exit link for a Guest **who has contributed this session**, rather than adding a second way out.
  - [ ] "This session" is a client-side fact — how many contributions this browser has made since the page loaded. It does not need a query: `presence`/`onUpdate` already knows when this client places or fuses something.
  - [ ] Three ways out of the dialog, all equal: sign up, sign in, leave anyway. AC #1's "dismissible without pressure" is a design constraint, not a nicety — no dark pattern, no pre-checked anything, and leaving must not be the small grey option.
  - [ ] Declining leaves the contributions exactly where they are (AC #4). They stay in the Room; they simply stop being attributable. Nothing is deleted.

- [ ] Task 3: Carrying the intent through auth (AC: #3)
  - [ ] The prompt records the intent — the raw `participantId` — before navigating, in `sessionStorage`. **Not `localStorage`**: an intent to claim belongs to this act, not to this browser forever.
  - [ ] After a successful sign-up *or* sign-in, a small client component reads the marker, calls the claim action, and clears the marker regardless of outcome.
  - [ ] **Scoped to the prompt's own flow, never to every auth event.** Claiming on any sign-in would mean a family computer attaching whatever a previous Guest did to whoever signs in next — which is exactly the mis-attribution this story exists to avoid.

- [ ] Task 4: The claim (AC: #3)
  - [ ] A Server Action taking the raw `participantId`. It hashes it, resolves the caller's own user id **from the session** — never from an argument — and runs `update contribution set user_id = $1, guest_key = null where guest_key = $2 and user_id is null`.
  - [ ] `and user_id is null` is not redundant: it makes the action idempotent and makes stealing an already-claimed contribution impossible even if the pre-image leaks later.
  - [ ] Refuses outright when the caller has no session. An unauthenticated claim has no account to attach to.
  - [ ] Returns how many rows moved, so the UI can say something true rather than a generic success.

- [ ] Task 5: Tests
  - [ ] Unit: the hashing, and the claim's SQL predicate reasoning where it can be isolated.
  - [ ] **e2e cannot cover the sign-up half** — the harness never writes to `auth.users`, and that rule is worth more than this coverage. What *is* testable end to end: the prompt appears for a Guest who contributed, does not appear for one who did not, and leaving anyway changes nothing in the database.
  - [ ] The claim action itself needs a test that does not create an account. A unit test of the query construction, plus a manual verification recorded in the Dev Agent Record, is the honest ceiling here — say so rather than implying more.

## Dev Notes

### Why the hash is not security theatre

The raw `participantId` is a `crypto.randomUUID()` living in one browser's `localStorage`. Hashing it changes exactly one thing: what the Room's other Participants can see. Before, the history handed them a working claim key for every Guest; after, it hands them an opaque grouping token. The Guest's own browser still holds the pre-image, which is the only thing that can transfer ownership.

### What "session" means here, and what it does not

AC #3 says "every contribution made during the current session". The implementation claims **every unclaimed contribution from this browser**, which is a superset: a Guest who played yesterday on the same browser and signs up today gets those too. That is more generous than the AC and strictly better for the person — recorded here as a deliberate difference, not an accident.

### Project Structure Notes

- New: one migration; `src/lib/rooms/claim-contributions.ts` (Server Action); a prompt component; a small post-auth claim component.
- Modified: `src/lib/rooms/contribution-actor.ts` (hash), `src/lib/rooms/contribution-row.ts` (+ tests), `src/components/room/contributor-history.tsx` (colour source), `src/app/room/[id]/page.tsx` or `room-view.tsx` (intercept the exit), `messages/fr.json`.

## Previous Story Intelligence

- **Story 4.2's `user_id` nullable / guest-key nullable shape is what makes this a query rather than a migration** — the deliberate payoff of that decision.
- **The e2e suite never writes to `auth.users`.** Three stories have now respected that; this one is the first where it genuinely costs coverage, and the cost is worth paying.
- **`react-hooks/set-state-in-effect` has shaped four files here.** A post-auth claim component runs an effect that sets state; expect it, and reach for the shape that satisfies the rule rather than a disable comment.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3] — the ACs above, verbatim.
- [Source: supabase/migrations/20260924000000_contribution.sql] — the column this story rewrites, and why it was shaped that way.
- [Source: src/lib/rooms/contribution-actor.ts] — where the hash has to happen.
- [Source: src/app/room/[id]/page.tsx] — the exit link this story intercepts.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-09-26 | Story created. The central finding is not in the ACs: Story 4.2's `guest_participant_id` reaches every client through both the read action and Realtime, so keying ownership transfer on it would let any Participant claim any Guest's contributions. The column becomes a hash, which is cheap now and expensive later — it is two days old and holds only test rows. Also recommends *not* implementing AC #2: no browser lets a page show its own dialog on tab close, and the generic one would warn about losing work that is already committed. |
