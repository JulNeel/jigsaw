import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { pgPool } from "@/lib/db/pg";
import { getSupabaseEnv } from "@/lib/auth/env";
import type { PieceShapeType } from "@/lib/piece-cutting/classify-piece-shape";
import { LIBRARY_IMAGES } from "@/lib/rooms/library-images";

const STORAGE_BUCKET = "piece-tiles";
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60; // 1 hour, arbitrary — revisit if too short/long

// `gridRow`/`gridCol` — each piece's exact position in the solved image —
// used to be deliberately withheld here (sending it, even unrendered, would
// serialize the whole solution into the page's data, readable via dev
// tools). Story 3.11 reverses that: the client now predicts placement/fusion
// validity locally (reusing the exact same pure validation functions the
// server runs), which needs each piece's true grid position to work at all.
// A conscious product call, not an oversight — see Story 3.11's "User-
// confirmed scope decisions" for the full record — and the data was already
// reachable regardless: `piece.grid_row`/`grid_col` carries a public
// `for select using (true)` RLS policy, so a curious client could already
// query it directly via the Supabase JS SDK before this change.
export type RoomDetailPiece = {
  id: string;
  shapeType: PieceShapeType;
  gridRow: number;
  gridCol: number;
  scatterX: number;
  scatterY: number;
  imageUrl: string | null; // null if the signed URL couldn't be generated
  rotation: number;
  placedRow: number | null;
  placedCol: number | null;
  version: number;
  // Story 3.8: which Cluster (if any) this piece is fused into, and its
  // position *within that Cluster's own local bounding box* — relative to
  // other fused pieces only, distinct from `gridRow`/`gridCol` above (the
  // piece's absolute position in the full solved grid).
  clusterId: string | null;
  clusterOffsetRow: number | null;
  clusterOffsetCol: number | null;
};

// A Cluster row only ever exists while >=2 Pieces are genuinely fused and
// free-floating (AD-3) — locking a Cluster into the Frame converts every
// member back into an individually-placed Piece and deletes the row.
export type RoomDetailCluster = {
  id: string;
  anchorX: number;
  anchorY: number;
  version: number;
};

// `id` (the Room's real UUID) is included from Story 3.5 onward — needed
// client-side to scope the Supabase Realtime subscription
// (`room_id=eq.<id>`, Architecture AD-1). Not sensitive data the way
// `grid_row`/`grid_col` is (see RoomDetailPiece's comment above).
export type RoomDetail = {
  id: string;
  name: string;
  gridRows: number;
  gridCols: number;
  tileWidth: number;
  tileHeight: number;
  pieces: RoomDetailPiece[];
  clusters: RoomDetailCluster[];
  // Story 3.14: the puzzle's full source image, for the press-and-hold
  // reference view. `null` for a Room created before this story shipped
  // (upload-sourced, no `reference.webp` ever persisted for it) — the
  // button degrades to disabled rather than the page failing to load.
  referenceImageUrl: string | null;
};

/**
 * Public Room lookup by invite slug — no auth required (Guests reach this
 * with no account, Story 3.1). A direct Postgres read via the same `pgPool`
 * `getRoomsForUser` uses (this is a read, Architecture AD-2 governs writes),
 * not a Server Action. Returns `null` on no match (invalid/expired link).
 * Throws on a genuine failure (DB/Storage error) — the caller distinguishes
 * "not found" from "something went wrong".
 */
export async function getRoomBySlug(slug: string): Promise<RoomDetail | null> {
  const roomResult = await pgPool.query(
    `select id, name, grid_rows, grid_cols, tile_width, tile_height, image_source, image_library_id
     from room
     where invite_slug = $1`,
    [slug],
  );

  const room = roomResult.rows[0];
  if (!room) {
    return null;
  }

  const pieceResult = await pgPool.query(
    `select id, shape_type, grid_row, grid_col, image_asset_ref, scatter_x, scatter_y, rotation, placed_row, placed_col,
            version, cluster_id, cluster_offset_row, cluster_offset_col
     from piece
     where room_id = $1`,
    [room.id],
  );

  const clusterResult = await pgPool.query(
    `select id, anchor_x, anchor_y, version from cluster where room_id = $1`,
    [room.id],
  );

  // A plain supabase-js client, not the `@supabase/ssr` browser/server
  // wrappers — those manage cookie-based sessions, irrelevant here since
  // Guests have no session at all. This just needs the anon role's
  // Storage read access (Task 1's new `storage.objects` policy).
  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createSupabaseClient(url, publishableKey);
  const paths = pieceResult.rows.map((row) => row.image_asset_ref as string);
  const { data: signedUrls } =
    paths.length > 0
      ? await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN_SECONDS)
      : { data: [] };

  const urlByPath = new Map(
    (signedUrls ?? [])
      // Skip per-entry failures rather than blindly mapping — a partial
      // failure response must not misattribute a URL to the wrong path.
      .filter((entry) => !entry.error && entry.signedUrl)
      .map((entry) => [entry.path, entry.signedUrl] as const),
  );

  const pieces: RoomDetailPiece[] = pieceResult.rows.map((row) => ({
    id: row.id,
    shapeType: row.shape_type,
    gridRow: row.grid_row,
    gridCol: row.grid_col,
    scatterX: row.scatter_x,
    scatterY: row.scatter_y,
    imageUrl: urlByPath.get(row.image_asset_ref) ?? null,
    rotation: row.rotation,
    placedRow: row.placed_row,
    placedCol: row.placed_col,
    version: row.version,
    clusterId: row.cluster_id,
    clusterOffsetRow: row.cluster_offset_row,
    clusterOffsetCol: row.cluster_offset_col,
  }));

  const clusters: RoomDetailCluster[] = clusterResult.rows.map((row) => ({
    id: row.id,
    anchorX: row.anchor_x,
    anchorY: row.anchor_y,
    version: row.version,
  }));

  const referenceImageUrl =
    room.image_source === "library"
      ? LIBRARY_IMAGES.find((entry) => entry.id === room.image_library_id)?.src ?? null
      : await resolveUploadReferenceImageUrl(supabase, room.id);

  return {
    id: room.id,
    name: room.name,
    gridRows: room.grid_rows,
    gridCols: room.grid_cols,
    tileWidth: room.tile_width,
    tileHeight: room.tile_height,
    pieces,
    clusters,
    referenceImageUrl,
  };
}

/**
 * Signed URL for an upload-sourced Room's persisted `reference.webp`
 * (Story 3.14) — which, for a Room created before this story shipped,
 * never exists: `createSignedUrl` against a missing object returns an
 * `error`, not a thrown exception, so this resolves to `null` rather than
 * letting a missing reference image break loading the Room.
 */
async function resolveUploadReferenceImageUrl(
  supabase: { storage: ReturnType<typeof createSupabaseClient>["storage"] },
  roomId: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(`${roomId}/reference.webp`, SIGNED_URL_EXPIRES_IN_SECONDS);

  return error ? null : data.signedUrl;
}
