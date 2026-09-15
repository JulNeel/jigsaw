-- `deleteRoom` (src/lib/rooms/actions.ts) cleans up a deleted Room's piece
-- tiles from Storage as a best-effort step after the Postgres row itself is
-- gone (every `piece`/`piece_adjacency`/`cluster` row already cascades via
-- `on delete cascade` — this migration is purely about Storage, which has
-- no equivalent cascade). No DELETE policy on `storage.objects` for the
-- `piece-tiles` bucket existed before this — only INSERT ("authenticated
-- can upload piece tiles", 20260814000000_rooms.sql) and SELECT ("anyone
-- can read piece tiles", 20260820000000_room_tile_dimensions.sql) — so this
-- was also a latent, pre-existing gap for `removePieceTiles`'s own
-- upload-failure cleanup path (upload-piece-tiles.ts), silently failing
-- (caught, logged) every time it ever ran, not something this migration
-- newly introduces a need for.
create policy "authenticated can delete piece tiles" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'piece-tiles');
