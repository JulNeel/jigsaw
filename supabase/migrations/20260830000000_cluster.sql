-- Story 3.8/3.9: Cluster (Îlot) — pieces fused together away from the Frame,
-- and Cluster-to-Frame integration, both validated by the exact same true-
-- neighbor rule as solo Piece placement (Story 3.5). Revises Story 3.5's
-- original design: back then, every drop near the Frame was validated
-- immediately against Frame slots. In practice this let an untested piece
-- get "confirmed" into the wrong slot the moment it had zero already-placed
-- neighbors to contradict it (the common case early in a Room, since most
-- pieces are `interior` and indistinguishable by shape category alone).
--
-- The corrected model (AD-3): validation only ever fires for two things —
-- (1) fusing two pieces/Clusters whose edges are brought into genuine
-- contact (wherever in the Canvas, in the Frame or not), and (2) locking an
-- isolated piece/Cluster into the Frame when nothing is there yet to test it
-- against (the deliberate "physical puzzle" leniency — untested placements
-- are allowed to be wrong until a real neighbor arrives). Free repositioning
-- (no genuine contact) never runs validation and always succeeds.
--
-- A Cluster row exists only once >=2 Pieces are genuinely fused (AD-3) — an
-- isolated Piece keeps `cluster_id = NULL` and uses its own scatter_x/y or
-- placed_row/placed_col exactly as before. A Cluster is *always* free-
-- floating in the Canvas (`anchor_x`/`anchor_y`) — locking a Cluster into
-- the Frame converts every member back into an individually
-- `placed_row`/`placed_col` Piece (exactly like a solo Piece placement) and
-- deletes the Cluster row; the Frame itself has no notion of Clusters, only
-- of individually-placed Pieces that happen to be true neighbors.
create table cluster (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references room(id) on delete cascade,
  anchor_x double precision not null,
  anchor_y double precision not null,
  -- Bumped on every anchor update, same as `piece.version` — but unlike
  -- that column, nothing ever reads or compares this one against an
  -- `expectedVersion`. Optimistic concurrency for a Cluster's own mutations
  -- goes entirely through the dragged piece's own `version` (see
  -- `piece-actions.ts`'s Server Actions); the client's `clusterCollection`
  -- has no `onUpdate`/mutation path at all. This column is intentionally
  -- informational/Realtime-observability only (so a client can tell a
  -- Cluster's anchor genuinely changed) — not a gap, if you went looking
  -- for a missing concurrency check against it.
  version int not null default 0
);

-- `cluster_offset_row`/`cluster_offset_col` are the piece's position *within
-- the Cluster's own local bounding box* (0-based, recomputed on every fuse/
-- merge) — never the piece's true `grid_row`/`grid_col`, which stays off
-- every client payload (Story 3.1's code review). Revealing a Cluster's
-- internal relative shape is the whole point of fusing; revealing a piece's
-- absolute position in the full puzzle grid before it's actually locked to
-- the Frame is not.
alter table piece
  add column cluster_id uuid references cluster(id) on delete set null,
  add column cluster_offset_row int,
  add column cluster_offset_col int,
  add constraint piece_cluster_offset_consistent check (
    (cluster_id is null and cluster_offset_row is null and cluster_offset_col is null)
    or
    (cluster_id is not null and cluster_offset_row is not null and cluster_offset_col is not null)
  );

alter table cluster enable row level security;

create policy "cluster readable by anyone" on cluster
  for select using (true);

alter publication supabase_realtime add table cluster;
