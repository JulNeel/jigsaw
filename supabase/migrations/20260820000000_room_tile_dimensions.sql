-- Story 3.1: persist the real tile pixel size per Room.
--
-- Every tile in a Room is the same size (computed once client-side in
-- sliceImageIntoTiles, Story 2.4) but was never stored — this closes that
-- gap so the Frame's true size (grid_cols * tile_width x grid_rows *
-- tile_height) can be rendered accurately for Guests (Story 3.1).

alter table room add column tile_width int;
alter table room add column tile_height int;

-- Backfill the 3 Rooms created during Story 2.4's manual testing (all
-- library-sourced from office-workstation.png, 1587x1123) — recomputed
-- with the exact same formula sliceImageIntoTiles used, not fabricated.
update room set tile_width = 1587 / grid_cols, tile_height = 1123 / grid_rows
where tile_width is null;

alter table room alter column tile_width set not null;
alter table room alter column tile_height set not null;

-- Storage: Guests (unauthenticated, per Story 3.1) need to read piece
-- tiles to render the Canvas. The bucket stays private — this only
-- permits generating signed URLs for objects in it, not public access.
create policy "anyone can read piece tiles" on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'piece-tiles');
