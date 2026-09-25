-- Story 4.2: the Room remembers who did what (FR-13).
--
-- Until now nothing in this schema recorded a person at all — `room`,
-- `piece`, `piece_adjacency` and `cluster` describe a puzzle, never a
-- Participant. Story 4.1 kept live presence entirely ephemeral precisely so
-- that this decision would be made by its first real consumer instead of
-- guessed at in advance. This is that consumer, and Stories 4.3 (attaching a
-- Guest's contributions to a new account) and 4.4 (a returning Participant's
-- progress) both inherit the shape chosen here.
create table contribution (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references room(id) on delete cascade,
  piece_id uuid not null references piece(id) on delete cascade,

  -- What the Participant actually did. A plain reposition is deliberately
  -- absent: sliding a piece around the mat is not contributing, and a
  -- history that counted it would be unreadable within a minute. These two
  -- are also the app's own existing vocabulary — the placement chime and the
  -- pulse already fire on exactly these and on nothing else.
  kind text not null check (kind in ('placed', 'fused')),

  -- Exactly one of these two identifies the contributor, and which one it is
  -- says how much it can be trusted.
  --
  -- `user_id` is resolved *server-side* from the session inside the Server
  -- Action, never from anything the client sends. `guest_participant_id` is
  -- the opposite: a Guest has no session, so it is the id their own browser
  -- generated and is therefore forgeable. That is accepted rather than
  -- overlooked — what forging it buys is a wrong name on a history line, in
  -- a Room whose invite link the person already holds and where they could
  -- simply place the piece themselves. It stops being true the moment they
  -- sign up.
  user_id uuid references auth.users(id) on delete set null,
  guest_participant_id text,

  -- A snapshot, not a join, and deliberately so. A Guest's pseudo lives only
  -- in their own browser — there is nothing to join to. And a registered
  -- Participant who renames themselves must not silently rewrite what the
  -- Room remembers about last Tuesday. History records what happened.
  -- Nullable, because "no pseudo" is a fact rather than a string. The Room
  -- prompt is skippable by design (Story 4.1), so a Guest can genuinely
  -- contribute without one — and substituting "Invité" here would put
  -- French UI copy in the database and make an absent name indistinguishable
  -- from someone who typed that word.
  pseudo text,

  created_at timestamptz not null default now(),

  constraint contribution_has_a_contributor check (
    user_id is not null or guest_participant_id is not null
  )
);

-- The read this story actually performs: newest first, one Room at a time,
-- paginated by a cursor rather than an offset because rows are being
-- inserted at the head while someone is reading.
create index contribution_room_created_idx
  on contribution (room_id, created_at desc, id desc);

-- Story 4.3's entire mechanic is `update contribution set user_id = ...
-- where guest_participant_id = ...`. Indexed now so that story is a query
-- rather than a migration.
create index contribution_guest_idx
  on contribution (guest_participant_id)
  where guest_participant_id is not null;

alter table contribution enable row level security;

-- Readable by anyone, consistent with `room`, `piece`, `piece_adjacency` and
-- `cluster`. `using (true)` across these tables is a known, already-recorded
-- gap (`deferred-work.md`, deferred from Story 2.4's review): it is harmless
-- only because the Data API is disabled, which is one dashboard toggle away
-- from being untrue. Matching its neighbours is the right call here —
-- diverging quietly would make that pass harder, not easier.
create policy "contribution readable by anyone" on contribution
  for select using (true);

-- **No insert policy, on purpose.** Every write goes through a Server Action
-- on the direct Postgres pool (AD-2), which bypasses RLS entirely. Granting
-- an insert policy would open a path nothing uses — a client that could
-- insert here could attribute contributions to anyone, which is exactly the
-- thing the server-side identity resolution above exists to prevent.

alter publication supabase_realtime add table contribution;
