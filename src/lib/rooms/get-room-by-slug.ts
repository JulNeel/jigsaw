import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { pgPool } from "@/lib/db/pg";
import { getSupabaseEnv } from "@/lib/auth/env";
import type { PieceShapeType } from "@/lib/piece-cutting/classify-piece-shape";

const STORAGE_BUCKET = "piece-tiles";
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60; // 1 hour, arbitrary — revisit if too short/long

// Deliberately does NOT include grid_row/grid_col — that's each piece's
// exact position in the solved image. Sending it to the client (even
// unrendered) would be serialized into the page's data and readable via
// dev tools, handing away the answer before anyone has placed anything.
export type RoomDetailPiece = {
  id: string;
  shapeType: PieceShapeType;
  scatterX: number;
  scatterY: number;
  imageUrl: string | null; // null if the signed URL couldn't be generated
};

export type RoomDetail = {
  name: string;
  gridRows: number;
  gridCols: number;
  tileWidth: number;
  tileHeight: number;
  pieces: RoomDetailPiece[];
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
    `select id, name, grid_rows, grid_cols, tile_width, tile_height
     from room
     where invite_slug = $1`,
    [slug],
  );

  const room = roomResult.rows[0];
  if (!room) {
    return null;
  }

  const pieceResult = await pgPool.query(
    `select id, shape_type, image_asset_ref, scatter_x, scatter_y
     from piece
     where room_id = $1`,
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
    scatterX: row.scatter_x,
    scatterY: row.scatter_y,
    imageUrl: urlByPath.get(row.image_asset_ref) ?? null,
  }));

  return {
    name: room.name,
    gridRows: room.grid_rows,
    gridCols: room.grid_cols,
    tileWidth: room.tile_width,
    tileHeight: room.tile_height,
    pieces,
  };
}
