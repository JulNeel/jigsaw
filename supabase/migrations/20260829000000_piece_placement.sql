-- Story 3.5: piece placement, rotation, and optimistic concurrency.
--
-- `placed_row`/`placed_col` are deliberately NOT the same columns as
-- `grid_row`/`grid_col` (the piece's hidden true position, kept off every
-- client payload since Story 3.1's code review) — a piece can be placed at
-- a slot different from its true grid position and stay there (FR-6: never
-- validated against the source image). `rotation` IS validated at
-- placement time (must be 0, its as-cut orientation) — see
-- src/lib/validation/validate-placement.ts.
--
-- `version` is the AD-6 optimistic-concurrency column, incremented on every
-- mutating write (move, rotate, place).

alter table piece
  add column rotation int not null default 0 check (rotation in (0, 90, 180, 270)),
  add column placed_row int,
  add column placed_col int,
  add column version int not null default 0;

-- A plain `unique (room_id, placed_row, placed_col)` would not work here:
-- Postgres treats every NULL as distinct, so it would not actually prevent
-- two *placed* pieces occupying the same slot. Scoping to
-- `where placed_row is not null` does.
create unique index piece_room_placed_slot_key
  on piece (room_id, placed_row, placed_col)
  where placed_row is not null;

-- Architecture AD-1 (amended 2026-08-28): live sync via Supabase Realtime
-- (postgres_changes), not ElectricSQL (Electric Cloud is being discontinued
-- following Databricks' acquisition of ElectricSQL). Tracked here as a
-- migration rather than a manual dashboard toggle, so it's reproducible.
alter publication supabase_realtime add table piece;
