-- Story 2.4: Room creation.
--
-- First real domain tables (Room/Piece/PieceAdjacency), per the "create
-- tables only when needed" principle established in the baseline migration.
--
-- Cutting model: plain rectangular grid pieces (user-confirmed scope
-- decision, 2026-08-14) — PieceShape is a grid-position classification
-- (corner/edge/interior), not a curved interlocking-tab shape. Adjacency is
-- purely orthogonal grid neighbors, fully deterministic from (row, col).
--
-- All writes to these tables happen exclusively via a Server Action using
-- the direct Postgres connection (Architecture AD-2) — RLS below grants
-- read-only access to anon/authenticated and no write policies at all, so
-- the Supabase client SDK (anon/authenticated role) can never write here
-- even by accident.

create table room (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_slug text not null unique,
  image_source text not null check (image_source in ('library', 'upload')),
  image_library_id text,
  constraint room_image_source_library_id_consistent check (
    (image_source = 'library' and image_library_id is not null)
    or (image_source = 'upload' and image_library_id is null)
  ),
  piece_count int not null,
  grid_rows int not null,
  grid_cols int not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table piece (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references room(id) on delete cascade,
  grid_row int not null,
  grid_col int not null,
  shape_type text not null check (shape_type in ('corner', 'edge', 'interior')),
  image_asset_ref text not null,
  scatter_x double precision not null,
  scatter_y double precision not null,
  unique (room_id, grid_row, grid_col)
);

create table piece_adjacency (
  room_id uuid not null references room(id) on delete cascade,
  piece_id uuid not null references piece(id) on delete cascade,
  neighbor_piece_id uuid not null references piece(id) on delete cascade,
  primary key (piece_id, neighbor_piece_id)
);

alter table room enable row level security;
alter table piece enable row level security;
alter table piece_adjacency enable row level security;

create policy "room readable by anyone" on room
  for select using (true);

create policy "piece readable by anyone" on piece
  for select using (true);

create policy "piece_adjacency readable by anyone" on piece_adjacency
  for select using (true);

-- No INSERT/UPDATE/DELETE policies for any role — deny-by-default (AD-2).

-- Storage: authenticated Participants upload piece tiles client-side during
-- Room creation (AD-2 explicitly permits Storage via the Supabase client
-- SDK). No policy existed on storage.objects before this migration, so
-- storage.objects (RLS-enabled by default) denied every operation.
create policy "authenticated can upload piece tiles" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'piece-tiles');
