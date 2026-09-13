"use server";

import { getTranslations } from "next-intl/server";
import { getAuthorizedUser } from "@/lib/auth/get-authorized-user";
import { createClient as createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { pgPool } from "@/lib/db/pg";
import { generateInviteSlug } from "@/lib/rooms/generate-invite-slug";
import { isUniqueSlugViolation } from "@/lib/rooms/is-unique-slug-violation";
import { computeAdjacency } from "@/lib/piece-cutting/compute-adjacency";
import { classifyPieceShape } from "@/lib/piece-cutting/classify-piece-shape";

const STORAGE_BUCKET = "piece-tiles";

// `shapeType` is deliberately NOT part of this payload — it's recomputed
// server-side (below) from (row, col, grid), the same authoritative
// treatment already given to adjacency. The client only supplies what it
// alone knows: which tile file it uploaded where, where it scattered, and
// what random initial orientation it starts in (a piece must be rotated
// back to 0° before it can ever be tested for Frame placement — Story
// 3.5's `rotatePiece`/`placePiece` are what re-validate this later; the
// database's own `rotation in (0, 90, 180, 270)` check constraint is what
// actually guards this insert against a malformed value, not app code).
export type CreateRoomPieceInput = {
  row: number;
  col: number;
  imageAssetRef: string;
  scatterX: number;
  scatterY: number;
  rotation: number;
};

export type CreateRoomInput = {
  roomId: string;
  name: string;
  imageSource: "library" | "upload";
  imageLibraryId: string | null;
  pieceCountNominal: number;
  grid: { rows: number; cols: number };
  tileWidth: number;
  tileHeight: number;
  pieces: CreateRoomPieceInput[];
};

export type CreateRoomResult =
  | { success: true; inviteUrl: string }
  | { success: false; error: { message: string } };

const MAX_SLUG_ATTEMPTS = 5;

export async function createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
  const t = await getTranslations("Create");

  const auth = await getAuthorizedUser();
  if ("error" in auth) {
    return { success: false, error: { message: t("notSignedIn") } };
  }

  if (!input.name.trim()) {
    return { success: false, error: { message: t("roomNameRequired") } };
  }
  if (input.pieces.length !== input.grid.rows * input.grid.cols) {
    return { success: false, error: { message: t("genericError") } };
  }
  if (
    !Number.isInteger(input.tileWidth) ||
    input.tileWidth <= 0 ||
    !Number.isInteger(input.tileHeight) ||
    input.tileHeight <= 0
  ) {
    return { success: false, error: { message: t("genericError") } };
  }

  // Bounds/duplicate check — the client computes these, but the server
  // never trusts client-computed grid positions without verifying them.
  const seenPositions = new Set<string>();
  for (const piece of input.pieces) {
    const inBounds =
      Number.isInteger(piece.row) &&
      Number.isInteger(piece.col) &&
      piece.row >= 0 &&
      piece.row < input.grid.rows &&
      piece.col >= 0 &&
      piece.col < input.grid.cols;
    const key = `${piece.row}-${piece.col}`;
    if (!inBounds || seenPositions.has(key)) {
      return { success: false, error: { message: t("genericError") } };
    }
    seenPositions.add(key);
  }

  const adjacencyPairs = computeAdjacency(input.grid.rows, input.grid.cols);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const inviteSlug = generateInviteSlug(input.name);

    let client;
    try {
      client = await pgPool.connect();
    } catch (err) {
      // A connection failure (e.g. a transient network blip) must return a
      // graceful error, not throw out of the Server Action entirely.
      console.error("createRoom: pgPool.connect() failed:", err);
      return { success: false, error: { message: t("genericError") } };
    }

    try {
      await client.query("BEGIN");

      await client.query(
        `insert into room
           (id, name, invite_slug, image_source, image_library_id, piece_count, grid_rows, grid_cols, tile_width, tile_height, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          input.roomId,
          input.name,
          inviteSlug,
          input.imageSource,
          input.imageLibraryId,
          input.pieceCountNominal,
          input.grid.rows,
          input.grid.cols,
          input.tileWidth,
          input.tileHeight,
          auth.user.id,
        ],
      );

      // One batched multi-row INSERT instead of one round-trip per piece —
      // sequential single-row inserts made Room creation take minutes for
      // larger piece counts.
      const pieceIdByPosition = new Map<string, string>();
      const pieceValues: unknown[] = [];
      const piecePlaceholders: string[] = [];
      let paramIndex = 1;
      for (const piece of input.pieces) {
        const pieceId = crypto.randomUUID();
        pieceIdByPosition.set(`${piece.row}-${piece.col}`, pieceId);
        const shapeType = classifyPieceShape(
          piece.row,
          piece.col,
          input.grid.rows,
          input.grid.cols,
        );
        piecePlaceholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
        );
        pieceValues.push(
          pieceId,
          input.roomId,
          piece.row,
          piece.col,
          shapeType,
          piece.imageAssetRef,
          piece.scatterX,
          piece.scatterY,
          piece.rotation,
        );
      }
      await client.query(
        `insert into piece
           (id, room_id, grid_row, grid_col, shape_type, image_asset_ref, scatter_x, scatter_y, rotation)
         values ${piecePlaceholders.join(", ")}`,
        pieceValues,
      );

      // Stored symmetrically (both directions) so "neighbors of X" is a
      // single-column lookup later, at the cost of doubled row count.
      const adjacencyValues: unknown[] = [];
      const adjacencyPlaceholders: string[] = [];
      let adjParamIndex = 1;
      for (const pair of adjacencyPairs) {
        const pieceId = pieceIdByPosition.get(`${pair.row}-${pair.col}`);
        const neighborId = pieceIdByPosition.get(
          `${pair.neighborRow}-${pair.neighborCol}`,
        );
        if (!pieceId || !neighborId) {
          throw new Error(
            `Adjacency mapping missing for (${pair.row},${pair.col})-(${pair.neighborRow},${pair.neighborCol})`,
          );
        }
        adjacencyPlaceholders.push(
          `($${adjParamIndex++}, $${adjParamIndex++}, $${adjParamIndex++})`,
        );
        adjacencyValues.push(input.roomId, pieceId, neighborId);
        adjacencyPlaceholders.push(
          `($${adjParamIndex++}, $${adjParamIndex++}, $${adjParamIndex++})`,
        );
        adjacencyValues.push(input.roomId, neighborId, pieceId);
      }
      if (adjacencyPlaceholders.length > 0) {
        await client.query(
          `insert into piece_adjacency (room_id, piece_id, neighbor_piece_id)
           values ${adjacencyPlaceholders.join(", ")}`,
          adjacencyValues,
        );
      }

      await client.query("COMMIT");
      return { success: true, inviteUrl: `/room/${inviteSlug}` };
    } catch (err) {
      await client.query("ROLLBACK");
      if (isUniqueSlugViolation(err)) {
        continue;
      }
      console.error("createRoom failed:", err);
      return { success: false, error: { message: t("genericError") } };
    } finally {
      client.release();
    }
  }

  return { success: false, error: { message: t("genericError") } };
}

export type DeleteRoomResult =
  | { success: true }
  | { success: false; error: { message: string } };

/**
 * Deletes a Room the current user owns — every `piece`/`piece_adjacency`/
 * `cluster` row cascades automatically (`on delete cascade` on each of
 * their `room_id` foreign keys, see the `rooms`/`cluster` migrations), so
 * the Postgres delete alone is sufficient at the data-model level. Scoped
 * by `created_by`, not just `id` — never trust a client-supplied Room id
 * alone to authorize a destructive write (same reasoning as `createRoom`
 * writing `created_by` itself, just the read-side mirror of it).
 */
export async function deleteRoom(roomId: string): Promise<DeleteRoomResult> {
  const t = await getTranslations("Home");

  const auth = await getAuthorizedUser();
  if ("error" in auth) {
    return { success: false, error: { message: t("notSignedIn") } };
  }

  let client;
  try {
    client = await pgPool.connect();
  } catch (err) {
    console.error("deleteRoom: pgPool.connect() failed:", err);
    return { success: false, error: { message: t("deleteError") } };
  }

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `delete from room where id = $1 and created_by = $2 returning id`,
      [roomId, auth.user.id],
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, error: { message: t("deleteNotFound") } };
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("deleteRoom failed:", err);
    return { success: false, error: { message: t("deleteError") } };
  } finally {
    client.release();
  }

  // Best-effort Storage cleanup, after the fact — the Room is already gone
  // from the database at this point (the only state that actually matters
  // for "did the delete work"); a failure here just leaves orphaned tile
  // files behind, same "log and move on" tolerance as `removePieceTiles`
  // elsewhere in this file's own sibling module, never blocking or
  // rolling back the real (already-committed) deletion.
  try {
    const supabase = await createSupabaseServerClient();
    const { data: files } = await supabase.storage.from(STORAGE_BUCKET).list(roomId);
    if (files && files.length > 0) {
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(files.map((file) => `${roomId}/${file.name}`));
    }
  } catch (err) {
    console.warn("deleteRoom: Storage cleanup failed:", err);
  }

  return { success: true };
}
