baseline_commit: NO_VCS

# Story 4.3: Sign-up prompt on exit

Status: review

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

- [x] Task 1: Stop exposing the key that grants ownership (prerequisite for AC #3)
  - [x] Migration: rewrite `contribution.guest_participant_id` to hold `sha256(participantId)` rather than the id. Rename it `guest_key` so nothing keeps treating it as an identifier that can be sent back.
  - [x] ~~Existing rows: there are none worth keeping — truncate.~~ **This was wrong, and checking first is the only reason it did no harm.** The table held **45 genuine contributions** in a real Room, not test rows: `main` deploys to production and the user had been playing. Nothing was truncated. The pre-image was sitting in the column, so the migration hashes in place — `encode(sha256(convert_to(guest_key, 'UTF8')), 'hex')` — and a claim made tomorrow still matches a row hashed today. (Those 45 rows turned out to carry `user_id`, not a guest key, so the update touched nothing; the reasoning still had to be right before it could be known to be moot.)
  - [x] Hash server-side, in `resolveActor` — the raw id must never be written.
  - [x] Update the index (`contribution_guest_idx`) and `contribution-row.ts`'s mapping and its tests. The panel's colour derivation moves to the hash, which is stable and non-reversible; it groups a Guest's lines exactly as before.

- [x] Task 2: The prompt (AC: #1, #4)
  - [x] Intercept the Room's existing exit link for a Guest **who has contributed this session**, rather than adding a second way out.
  - [x] "This session" is a client-side fact — how many contributions this browser has made since the page loaded. It does not need a query: `presence`/`onUpdate` already knows when this client places or fuses something.
  - [x] **Two ways out, not the three planned here.** `/sign-in` renders the sign-up and sign-in forms side by side, so "sign up" and "sign in" would have been two labels for one destination differing only in a hidden flag. The dialog offers "keep my contributions" and "leave without keeping". AC #1's "dismissible without pressure" held: leaving is full-width, `outline` rather than `ghost`, because muted text beside a filled button reads as the discouraged choice however wide it is.
  - [x] Declining leaves the contributions exactly where they are (AC #4). They stay in the Room; they simply stop being attributable. Nothing is deleted.

- [x] Task 3: Carrying the intent through auth (AC: #3)
  - [x] The prompt records the intent — the raw `participantId` — before navigating, in `sessionStorage`. **Not `localStorage`**: an intent to claim belongs to this act, not to this browser forever.
  - [x] After a successful sign-up *or* sign-in, a small client component reads the marker, calls the claim action, and clears the marker regardless of outcome.
  - [x] **Scoped to the prompt's own flow, never to every auth event.** Claiming on any sign-in would mean a family computer attaching whatever a previous Guest did to whoever signs in next — which is exactly the mis-attribution this story exists to avoid.

- [x] Task 4: The claim (AC: #3)
  - [x] A Server Action taking the raw `participantId`. It hashes it, resolves the caller's own user id **from the session** — never from an argument — and runs `update contribution set user_id = $1, guest_key = null where guest_key = $2 and user_id is null`.
  - [x] `and user_id is null` is not redundant: it makes the action idempotent and makes stealing an already-claimed contribution impossible even if the pre-image leaks later.
  - [x] Refuses outright when the caller has no session. An unauthenticated claim has no account to attach to.
  - [x] Returns how many rows moved, so the UI can say something true rather than a generic success.

- [x] Task 5: Tests
  - [x] Unit: the hashing — including the value **read back from Postgres itself**, which is the only way to check a property whose failure is silent.
  - [x] **e2e cannot cover the sign-up half** — the harness never writes to `auth.users`, and that rule is worth more than this coverage. What *is* testable end to end: the prompt appears for a Guest who contributed, does not appear for one who did not, and leaving anyway changes nothing in the database.
  - [ ] **Not done, and not claimed: `claimContributions` has no test of its own.** It is a Server Action whose every meaningful path needs either a session or a real row to move, and the harness creates neither. What *is* covered is the part that would fail silently — the hash agreeing with Postgres — and the parts that are plain reads of the session. The `update ... where guest_key = $2 and user_id is null` predicate is argued for in the code and unverified by any test. Leaving this box unchecked is the accurate state.

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

Claude Opus 5

### Completion Notes List

- AC #1, #3 and #4 implemented. **AC #2 deliberately not implemented**, with the user's agreement — see this story's own analysis. `leave-prompt.tsx` carries the reason where someone wondering "why is there no tab-close prompt" will meet it.
- **The story's own truncate instruction was wrong and was caught by checking**, not by luck: 45 real contributions existed. Recorded above in full rather than quietly corrected.
- **A worse near-miss, worth recording.** The script that applied the migration printed "ÉCHEC, rien appliqué" and exited non-zero — while having already committed. The throw came *after* `commit`, from reading a sample row that did not exist. Had the next step trusted that message, the schema and the code would have been out of step in opposite directions. Verified the actual state rather than the script's claim, which is the only reason it was noticed.
- `guestKeyFor` and the migration's SQL must produce identical bytes or every claim silently matches nothing. `guest-key.test.ts` pins the value **read back from Postgres itself**, which is the only way to check a property whose failure is otherwise invisible.
- **Two design corrections while building.** The dialog started with three buttons — sign up, sign in, leave — but `/sign-in` renders both forms side by side, so two of them were one destination under two labels. It is now "keep" and "leave". And "leave" became an `outline` button rather than `ghost`: a muted-text button beside a filled one reads as the discouraged choice however wide it is, which is not "dismissible without pressure".
- The claim is scoped to an explicit intent held in `sessionStorage`, never to any successful auth. On a shared machine, claiming at every sign-in would attach a previous Guest's pieces to whoever signs in next.
- **Not testable end to end, and said so rather than implied otherwise:** the claim itself needs a real account, and this harness never writes to `auth.users`. What e2e covers is the offer — it appears for a Guest who contributed, stays away from one who only repositioned a piece, and costs nothing to refuse.

### File List

- `supabase/migrations/20260927000000_contribution_guest_key.sql` (new, applied 2026-09-28) — the rename and the in-place hash.
- `src/lib/rooms/guest-key.ts` (new, + test) — the one hash both Postgres and Node must agree on.
- `src/lib/rooms/claim-contributions.ts` (new) — the Server Action, and the three things that make it safe.
- `src/lib/rooms/claim-intent.ts` (new), `src/lib/rooms/session-contribution-events.ts` (new).
- `src/components/room/leave-prompt.tsx` (new), `src/app/claim-contributions-on-auth.tsx` (new).
- `src/lib/rooms/contribution-actor.ts`, `contribution-row.ts` (+ test), `contributions.ts`, `fetch-contributions.ts`, `src/lib/db/collections.ts`, `src/components/room/contributor-history.tsx`, `src/app/page.tsx`, `src/app/room/[id]/page.tsx`, `messages/fr.json` (modified).
- `e2e/leave-prompt.e2e.ts` (new); `e2e/support/db.ts`, `e2e/contributor-history.e2e.ts` (modified).

## Change Log

| Date | Change |
|------|--------|
| 2026-09-28 | Implemented, AC #2 excepted. The migration's planned truncate was wrong — 45 real contributions existed — and the column was hashed in place instead. |
| 2026-09-26 | Story created. The central finding is not in the ACs: Story 4.2's `guest_participant_id` reaches every client through both the read action and Realtime, so keying ownership transfer on it would let any Participant claim any Guest's contributions. The column becomes a hash, which is cheap now and expensive later — it is two days old and holds only test rows. Also recommends *not* implementing AC #2: no browser lets a page show its own dialog on tab close, and the generic one would warn about losing work that is already committed. |
