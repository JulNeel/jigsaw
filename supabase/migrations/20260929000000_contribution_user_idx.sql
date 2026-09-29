-- Story 4.4: a returning Participant finds their Rooms on Home.
--
-- Home now lists Rooms you *contributed to*, not only ones you created, and
-- the query does that with a `lateral` filtered on `contribution.user_id`
-- once per Room. The two indexes this table already has are no help there:
-- `contribution_room_created_idx` leads with `room_id` (the Room's own
-- history, Story 4.2) and `contribution_guest_idx` covers the opposite
-- column (a Guest claiming their rows, Story 4.3). Without this one, every
-- Home load sequentially scans `contribution` once per Room.
--
-- Leading with `user_id` and including `room_id` lets the lateral seek
-- straight to one Participant's rows in one Room; `created_at` is included
-- because the same lateral takes `max(created_at)` to order the list by
-- when *you* last played, rather than by the Room's age.
--
-- Partial, because the majority of rows are Guests': a contribution carries
-- either a `user_id` or a `guest_key`, never both, and there is no query
-- that looks for a null one.
create index contribution_user_room_idx
  on contribution (user_id, room_id, created_at desc)
  where user_id is not null;
