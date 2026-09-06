"use server";

import type { PoolClient } from "pg";
import { pgPool } from "@/lib/db/pg";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors";
import {
  canBootstrapWithoutNeighbor,
  validatePieceOrientationAndShape,
  validatePlacementNeighbors,
  type OrthogonalDirection,
} from "@/lib/validation/validate-placement";
import {
  findContactCandidates,
  validateFusion,
  type ScreenPositioned,
} from "@/lib/validation/validate-fusion";
import { overlapsAnyFreePiece } from "@/lib/validation/validate-overlap";
import type { PieceShapeType } from "@/lib/piece-cutting/classify-piece-shape";

// No auth gate on any of these — placing/moving/rotating/fusing a piece is
// exactly the "contribute with zero friction" mechanic Guests get (FR-6,
// Story 3.1's Consistency Conventions: "un Guest est une session sans
// compte"). Room *creation* is gated (Story 2.1); playing is not.

export type PieceActionResult =
  // `fused` mirrors `placed`'s own role from Story 3.11 (AC #4), for Story
  // 3.13's own analogous case: it tells the client whether this specific
  // write actually fused the dragged group with another piece/Cluster —
  // never inferred from position/version, always the transaction's own
  // ground truth (`repositionOrFuse`'s own return). Present whenever a
  // reposition attempt happened at all (`movePiece`, and `placePiece`'s own
  // fallback when a Frame lock didn't validate) — absent only for actions
  // that never call `repositionOrFuse` (`rotatePiece`, and `placePiece`'s
  // successful-lock path, which never attempts a fusion).
  | { success: true; version: number; placed?: boolean; fused?: boolean }
  | { success: false; error: { code: ErrorCode } };

// Postgres's own SQLSTATE for `unique_violation` — the exact error a
// concurrent double-placement raises against `piece_room_placed_slot_key`
// (the check that decides a slot is free reads without a lock; the unique
// index is what actually stops two placements from both landing on it —
// see the story's Review Findings). Mapped to `STALE_WRITE`, not a generic
// failure: it means exactly what `STALE_WRITE` already means to the
// client — "the world changed under you, abandon this optimistic write and
// wait for the next Realtime-confirmed state" (AD-6) — not a real bug.
const POSTGRES_UNIQUE_VIOLATION = "23505";
// Two concurrent transactions row-locking mutually-adjacent pieces in
// opposite orders (Participant A drags piece 1 onto piece 2 while
// Participant B drags piece 2 onto piece 1, at nearly the same moment) can
// deadlock — there's no canonical lock-acquisition ordering between
// `loadDraggedGroup`'s own-piece lock and `repositionOrFuse`'s later
// touched-piece lock. Postgres's own detector aborts one side with this
// SQLSTATE; mapped to `STALE_WRITE` for the same reason as the unique-
// violation above (the abort itself is a correct, safe outcome — only the
// error code reported for it was misleading). Full prevention would need a
// shared canonical lock order across both call sites — deferred, tracked
// in `deferred-work.md`.
const POSTGRES_DEADLOCK_DETECTED = "40P01";

function mapUnexpectedError(err: unknown): ErrorCode {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  if (code === POSTGRES_UNIQUE_VIOLATION || code === POSTGRES_DEADLOCK_DETECTED) {
    return ERROR_CODES.STALE_WRITE;
  }
  return ERROR_CODES.UNEXPECTED_ERROR;
}

// A drop counts as "genuinely touching" a neighbor within this fraction of
// a tile's own size — a snapping window, not a loose "nearby" radius (Story
// 3.8's AC: sorting pieces near each other must have zero effect unless
// they actually touch). Deferred parameter per Architecture's own note
// ("seuil de proximité... à fixer en implémentation") — tuned during manual
// verification, not spec-mandated. Widened 0.3 → 0.45 (user feedback,
// 2026-09-06: the fusion contact window felt too tight) — must exactly
// mirror `predict-fusion.ts`'s own copy of this constant.
const CONTACT_TOLERANCE_FACTOR = 0.45;

// How far beyond a target slot's own footprint `placePiece`'s overlap guard
// widens its unlocked first-pass scan before row-locking whatever it finds
// there — deliberately more generous than the exact overlap test itself
// (which uses a plain `tileWidth`/`tileHeight` margin), so a piece that's
// merely close (not yet exactly overlapping) but could complete its own
// concurrent move into the slot before this transaction commits still gets
// locked and re-checked rather than slipping through. Reasonable default,
// not spec-mandated — tune if manual testing shows it too tight or loose.
const NEARBY_LOCK_MARGIN_FACTOR = 2;

type GroupMember = {
  pieceId: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
  shapeType: PieceShapeType;
  offsetRow: number;
  offsetCol: number;
};

type DraggedGroup = {
  roomId: string;
  tileWidth: number;
  tileHeight: number;
  gridRows: number;
  gridCols: number;
  clusterId: string | null;
  members: GroupMember[];
  draggedMember: GroupMember;
};

/**
 * Loads (and row-locks) the piece being dragged plus every piece fused with
 * it into the same Cluster — dragging any member moves the whole group
 * (Story 3.9). A solo, unclustered piece is simply a group of one.
 */
async function loadDraggedGroup(
  client: PoolClient,
  pieceId: string,
): Promise<
  | { ok: true; group: DraggedGroup; version: number; placedRow: number | null }
  | { ok: false; code: ErrorCode }
> {
  const pieceResult = await client.query(
    `select room_id, version, placed_row, grid_row, grid_col, rotation, shape_type,
            cluster_id, cluster_offset_row, cluster_offset_col
     from piece where id = $1 for update`,
    [pieceId],
  );
  const row = pieceResult.rows[0];
  if (!row) {
    return { ok: false, code: ERROR_CODES.NOT_FOUND };
  }

  const roomResult = await client.query(
    `select tile_width, tile_height, grid_rows, grid_cols from room where id = $1`,
    [row.room_id],
  );
  const room = roomResult.rows[0];

  const draggedMember: GroupMember = {
    pieceId,
    gridRow: row.grid_row,
    gridCol: row.grid_col,
    rotation: row.rotation,
    shapeType: row.shape_type,
    offsetRow: row.cluster_id ? row.cluster_offset_row : 0,
    offsetCol: row.cluster_id ? row.cluster_offset_col : 0,
  };

  let members = [draggedMember];
  if (row.cluster_id) {
    // Lock the Cluster row itself too — a concurrent fuse/move of the same
    // Cluster from another client must serialize against this one.
    await client.query(`select id from cluster where id = $1 for update`, [row.cluster_id]);
    const membersResult = await client.query(
      `select id, grid_row, grid_col, rotation, shape_type, cluster_offset_row, cluster_offset_col
       from piece where cluster_id = $1 for update`,
      [row.cluster_id],
    );
    members = membersResult.rows.map((m) => ({
      pieceId: m.id,
      gridRow: m.grid_row,
      gridCol: m.grid_col,
      rotation: m.rotation,
      shapeType: m.shape_type,
      offsetRow: m.cluster_offset_row,
      offsetCol: m.cluster_offset_col,
    }));
  }

  return {
    ok: true,
    version: row.version,
    placedRow: row.placed_row,
    group: {
      roomId: row.room_id,
      tileWidth: room.tile_width,
      tileHeight: room.tile_height,
      gridRows: room.grid_rows,
      gridCols: room.grid_cols,
      clusterId: row.cluster_id,
      members,
      draggedMember,
    },
  };
}

/**
 * Every not-yet-Frame-anchored piece elsewhere in the Room, positioned at
 * its current screen coordinates (free scatter position, or its Cluster's
 * anchor + this piece's offset within it). Frame-anchored pieces are
 * excluded — once locked into the Frame a piece never moves again (no
 * "un-place" mechanic exists), so they can never be a fusion target; the
 * only way to interact with one is the Frame-locking path in `placePiece`.
 */
function mapFreePieceRows(
  rows: Array<Record<string, unknown>>,
  tileWidth: number,
  tileHeight: number,
): ScreenPositioned[] {
  return rows.map((row) => {
    const screenX =
      row.anchor_x != null
        ? (row.anchor_x as number) + (row.cluster_offset_col as number) * tileWidth
        : (row.scatter_x as number);
    const screenY =
      row.anchor_y != null
        ? (row.anchor_y as number) + (row.cluster_offset_row as number) * tileHeight
        : (row.scatter_y as number);
    return {
      pieceId: row.id as string,
      gridRow: row.grid_row as number,
      gridCol: row.grid_col as number,
      rotation: row.rotation as number,
      screenX,
      screenY,
    };
  });
}

async function loadStationaryFreeCandidates(
  client: PoolClient,
  roomId: string,
  excludePieceIds: string[],
  tileWidth: number,
  tileHeight: number,
): Promise<ScreenPositioned[]> {
  const result = await client.query(
    `select p.id, p.grid_row, p.grid_col, p.rotation,
            p.scatter_x, p.scatter_y, p.cluster_offset_row, p.cluster_offset_col,
            c.anchor_x, c.anchor_y
     from piece p
     left join cluster c on c.id = p.cluster_id
     where p.room_id = $1 and p.placed_row is null and p.id <> all($2::uuid[])`,
    [roomId, excludePieceIds],
  );
  return mapFreePieceRows(result.rows, tileWidth, tileHeight);
}

/**
 * Row-locks and re-reads exactly the given (not-yet-Frame-anchored) pieces
 * — used to close the race window between `placePiece`'s first, unlocked
 * overlap scan and its final write: lock only the handful of pieces that
 * scan already found near the target slots (never every free piece in the
 * Room, which would cost real contention at scale), then re-check their
 * now-guaranteed-fresh position. `FOR UPDATE` on this `LEFT JOIN` also
 * locks each matched piece's Cluster row, if any, blocking a concurrent
 * move of that whole Cluster for the same window.
 */
async function loadAndLockFreePiecesByIds(
  client: PoolClient,
  pieceIds: string[],
  tileWidth: number,
  tileHeight: number,
): Promise<ScreenPositioned[]> {
  if (pieceIds.length === 0) {
    return [];
  }
  // Plain `for update` on this `left join` throws — Postgres rejects
  // locking the nullable side of an outer join ("FOR UPDATE cannot be
  // applied to the nullable side of an outer join", confirmed live against
  // the database). `for update of p` restricts the lock to `piece`; any
  // associated Cluster row is locked in a separate, explicit follow-up
  // query instead — still within the same transaction, still closing the
  // same race this function exists for.
  const result = await client.query(
    `select p.id, p.grid_row, p.grid_col, p.rotation, p.cluster_id,
            p.scatter_x, p.scatter_y, p.cluster_offset_row, p.cluster_offset_col,
            c.anchor_x, c.anchor_y
     from piece p
     left join cluster c on c.id = p.cluster_id
     where p.id = any($1::uuid[]) and p.placed_row is null
     for update of p`,
    [pieceIds],
  );
  const clusterIds = [...new Set(result.rows.map((row) => row.cluster_id).filter(Boolean))];
  if (clusterIds.length > 0) {
    await client.query(`select id from cluster where id = any($1::uuid[]) for update`, [
      clusterIds,
    ]);
  }
  return mapFreePieceRows(result.rows, tileWidth, tileHeight);
}

async function loadTrueNeighborSets(
  client: PoolClient,
  pieceIds: string[],
): Promise<Map<string, Set<string>>> {
  const result = await client.query(
    `select piece_id, neighbor_piece_id from piece_adjacency where piece_id = any($1::uuid[])`,
    [pieceIds],
  );
  const map = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const set = map.get(row.piece_id) ?? new Set<string>();
    set.add(row.neighbor_piece_id);
    map.set(row.piece_id, set);
  }
  return map;
}

/**
 * Repositions a dragged group's (piece or Cluster) anchor to a plain free
 * position — no contact/fusion check at all. The lowest-level primitive;
 * `repositionOrFuse` below is what everything else actually calls.
 */
async function repositionPlain(
  client: PoolClient,
  group: DraggedGroup,
  x: number,
  y: number,
): Promise<number> {
  if (group.clusterId) {
    const newAnchorX = x - group.draggedMember.offsetCol * group.tileWidth;
    const newAnchorY = y - group.draggedMember.offsetRow * group.tileHeight;
    await client.query(
      `update cluster set anchor_x = $2, anchor_y = $3, version = version + 1 where id = $1`,
      [group.clusterId, newAnchorX, newAnchorY],
    );
  } else {
    await client.query(`update piece set scatter_x = $2, scatter_y = $3 where id = $1`, [
      group.draggedMember.pieceId,
      x,
      y,
    ]);
  }
  const versionResult = await client.query(
    `update piece set version = version + 1 where id = $1 returning version`,
    [group.draggedMember.pieceId],
  );
  return versionResult.rows[0].version;
}

/**
 * The one place that ever fuses pieces/Clusters together (Story 3.8),
 * reused by every drag-end path — `movePiece` (a free-space drop) and
 * `placePiece`'s fallback (a drop near the Frame that didn't lock in).
 * Checks whether the dragged group has been genuinely brought into contact
 * with another not-yet-Frame-anchored piece/Cluster anywhere in the Room
 * (in the Frame's visual area or not — Story 8's AC #1 doesn't distinguish)
 * and fuses on a genuine match. A false or absent contact is never
 * rejected — it's simply a plain reposition instead, same principle as
 * `placePiece`: only ever confirm a *positive* match, never bounce a drop
 * back for failing one.
 */
async function repositionOrFuse(
  client: PoolClient,
  group: DraggedGroup,
  x: number,
  y: number,
): Promise<{ version: number; fused: boolean }> {
  const newAnchorX = x - group.draggedMember.offsetCol * group.tileWidth;
  const newAnchorY = y - group.draggedMember.offsetRow * group.tileHeight;
  const draggedScreenMembers: ScreenPositioned[] = group.members.map((m) => ({
    pieceId: m.pieceId,
    gridRow: m.gridRow,
    gridCol: m.gridCol,
    rotation: m.rotation,
    screenX: newAnchorX + m.offsetCol * group.tileWidth,
    screenY: newAnchorY + m.offsetRow * group.tileHeight,
  }));

  const stationary = await loadStationaryFreeCandidates(
    client,
    group.roomId,
    group.members.map((m) => m.pieceId),
    group.tileWidth,
    group.tileHeight,
  );
  const tolerance = Math.min(group.tileWidth, group.tileHeight) * CONTACT_TOLERANCE_FACTOR;
  const candidates = findContactCandidates(
    draggedScreenMembers,
    stationary,
    group.tileWidth,
    group.tileHeight,
    tolerance,
  );

  if (candidates.length === 0) {
    return { version: await repositionPlain(client, group, x, y), fused: false };
  }

  const trueNeighborsByPieceId = await loadTrueNeighborSets(
    client,
    group.members.map((m) => m.pieceId),
  );
  const genuine = validateFusion(candidates, trueNeighborsByPieceId);
  if (!genuine) {
    return { version: await repositionPlain(client, group, x, y), fused: false };
  }

  // Fuse: gather every distinct touched group's full membership, not just
  // the one contacting piece — an entire touched Cluster comes along.
  const touchedClusterIds = new Set<string>();
  const touchedSoloPieceIds = new Set<string>();
  const stationaryRowsById = new Map(stationary.map((s) => [s.pieceId, s]));
  const touchedResult = await client.query(
    `select id, cluster_id from piece where id = any($1::uuid[]) for update`,
    [candidates.map((c) => c.b.pieceId)],
  );

  // Re-verify contact with the now-locked, guaranteed-fresh position —
  // `candidates` above came from an unlocked read, so a concurrent
  // `movePiece` could have relocated a touched piece in the window between
  // that read and this lock. Fusing on the stale geometry anyway would
  // silently override whatever the other Participant just did. Same
  // "scan unlocked, then lock-and-recheck" shape as `placePiece`'s overlap
  // guard.
  const freshTouched = await loadAndLockFreePiecesByIds(
    client,
    candidates.map((c) => c.b.pieceId),
    group.tileWidth,
    group.tileHeight,
  );
  const freshCandidates = findContactCandidates(
    draggedScreenMembers,
    freshTouched,
    group.tileWidth,
    group.tileHeight,
    tolerance,
  );
  if (freshCandidates.length === 0) {
    return { version: await repositionPlain(client, group, x, y), fused: false };
  }
  const stillGenuine = validateFusion(freshCandidates, trueNeighborsByPieceId);
  if (!stillGenuine) {
    return { version: await repositionPlain(client, group, x, y), fused: false };
  }

  for (const row of touchedResult.rows) {
    if (row.cluster_id) {
      touchedClusterIds.add(row.cluster_id);
    } else {
      touchedSoloPieceIds.add(row.id);
    }
  }

  const allMembers = new Map<string, { gridRow: number; gridCol: number }>();
  for (const m of group.members) {
    allMembers.set(m.pieceId, { gridRow: m.gridRow, gridCol: m.gridCol });
  }
  for (const soloId of touchedSoloPieceIds) {
    const s = stationaryRowsById.get(soloId)!;
    allMembers.set(soloId, { gridRow: s.gridRow, gridCol: s.gridCol });
  }
  for (const otherClusterId of touchedClusterIds) {
    const membersResult = await client.query(
      `select id, grid_row, grid_col from piece where cluster_id = $1 for update`,
      [otherClusterId],
    );
    for (const m of membersResult.rows) {
      allMembers.set(m.id, { gridRow: m.grid_row, gridCol: m.grid_col });
    }
  }

  const minGridRow = Math.min(...[...allMembers.values()].map((m) => m.gridRow));
  const minGridCol = Math.min(...[...allMembers.values()].map((m) => m.gridCol));
  const mergedAnchorX = x - (group.draggedMember.gridCol - minGridCol) * group.tileWidth;
  const mergedAnchorY = y - (group.draggedMember.gridRow - minGridRow) * group.tileHeight;

  const survivingClusterId =
    group.clusterId ??
    [...touchedClusterIds][0] ??
    (await client.query(`insert into cluster (room_id, anchor_x, anchor_y) values ($1, $2, $3) returning id`, [
      group.roomId,
      mergedAnchorX,
      mergedAnchorY,
    ])).rows[0].id;

  if (group.clusterId || touchedClusterIds.has(survivingClusterId)) {
    await client.query(
      `update cluster set anchor_x = $2, anchor_y = $3, version = version + 1 where id = $1`,
      [survivingClusterId, mergedAnchorX, mergedAnchorY],
    );
  }

  const redundantClusterIds = [...touchedClusterIds, ...(group.clusterId ? [group.clusterId] : [])].filter(
    (id) => id !== survivingClusterId,
  );

  for (const [pieceId, pos] of allMembers) {
    const offsetRow = pos.gridRow - minGridRow;
    const offsetCol = pos.gridCol - minGridCol;
    // `scatter_x`/`scatter_y` are left as-is (stale, unused while
    // `cluster_id` is set — the column is `not null`, so there's nothing
    // meaningful to reset them to; rendering always prefers
    // `cluster_id`/offset over scatter position, see `pieceRenderPosition`).
    // `version` bumps here for *every* member, not just the dragged piece
    // (AD-6) — a joined member's cluster membership just changed just as
    // much as its position did, so a stale client-cached version for it
    // must stop matching too, or a future `expectedVersion` check against
    // that piece would wrongly pass despite this write.
    await client.query(
      `update piece
       set cluster_id = $2, cluster_offset_row = $3, cluster_offset_col = $4, version = version + 1
       where id = $1`,
      [pieceId, survivingClusterId, offsetRow, offsetCol],
    );
  }

  if (redundantClusterIds.length > 0) {
    await client.query(`delete from cluster where id = any($1::uuid[])`, [redundantClusterIds]);
  }

  const versionResult = await client.query(`select version from piece where id = $1`, [
    group.draggedMember.pieceId,
  ]);
  return { version: versionResult.rows[0].version, fused: true };
}

/**
 * Repositions an unplaced piece/Cluster in free space, checking along the
 * way whether it's been genuinely brought into contact with another
 * piece/Cluster (Story 3.8) — never a per-frame check, only at drag-end,
 * same performance reasoning as Story 3.3.
 */
export async function movePiece(input: {
  pieceId: string;
  x: number;
  y: number;
  expectedVersion: number;
}): Promise<PieceActionResult> {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    const loaded = await loadDraggedGroup(client, input.pieceId);
    if (!loaded.ok) {
      await client.query("ROLLBACK");
      return { success: false, error: { code: loaded.code } };
    }
    if (loaded.version !== input.expectedVersion) {
      await client.query("ROLLBACK");
      return { success: false, error: { code: ERROR_CODES.STALE_WRITE } };
    }
    if (loaded.placedRow !== null) {
      await client.query("ROLLBACK");
      return { success: false, error: { code: ERROR_CODES.ALREADY_PLACED } };
    }

    const { version, fused } = await repositionOrFuse(client, loaded.group, input.x, input.y);
    await client.query("COMMIT");
    return { success: true, version, fused };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("movePiece failed:", err);
    return { success: false, error: { code: mapUnexpectedError(err) } };
  } finally {
    client.release();
  }
}

/**
 * Rotates an unplaced, unfused piece by a fixed 90° increment (click/tap).
 * Locked once placed (AC #5's own validation gate) or once fused into a
 * Cluster with another piece — a fused piece's rotation=0 is exactly what
 * the fusion that formed the Cluster already validated; rotating it
 * afterwards would silently invalidate that.
 *
 * Deliberately skips AD-6's `expectedVersion` check every other piece
 * mutation uses. That check exists to detect a genuine lost update (the
 * world changed under you in a way that matters — a slot filled, a piece
 * moved). A `+90°` rotation has no such property: it's commutative and
 * order-independent, so two rotations — from the same click firing twice
 * before its own Realtime confirmation arrives, or from two different
 * Participants rotating the same piece at once — always sum to the same
 * final angle no matter which commits first. Requiring a matching version
 * here would only ever reject the *second* of two legitimate, simultaneous
 * rotations, which is exactly the "double-click only turns it once" bug
 * this fixes. `version` is still bumped on every write, so an unrelated
 * concurrent `placePiece`/`movePiece` still correctly detects *this*
 * rotation as a conflict via its own `expectedVersion` check.
 */
export async function rotatePiece(input: {
  pieceId: string;
}): Promise<PieceActionResult> {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    const pieceResult = await client.query(
      `select placed_row, cluster_id from piece where id = $1 for update`,
      [input.pieceId],
    );
    const piece = pieceResult.rows[0];
    if (!piece) {
      await client.query("ROLLBACK");
      return { success: false, error: { code: ERROR_CODES.NOT_FOUND } };
    }
    if (piece.placed_row !== null || piece.cluster_id !== null) {
      await client.query("ROLLBACK");
      return { success: false, error: { code: ERROR_CODES.ALREADY_PLACED } };
    }

    const updateResult = await client.query(
      `update piece set rotation = (rotation + 90) % 360, version = version + 1
       where id = $1
       returning version`,
      [input.pieceId],
    );

    await client.query("COMMIT");
    return { success: true, version: updateResult.rows[0].version };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("rotatePiece failed:", err);
    return { success: false, error: { code: mapUnexpectedError(err) } };
  } finally {
    client.release();
  }
}

/**
 * Attempts to lock a piece/Cluster into the Frame at (targetRow, targetCol)
 * — `targetRow`/`targetCol` are where `pieceId` specifically (not
 * necessarily the group's own offset-(0,0) member) would land, and `x`/`y`
 * is the raw drop point (used only as the fallback position if locking
 * doesn't validate). Validates shape + orientation for *every* member
 * (never position/identity — FR-6) and, for any already-Frame-placed
 * orthogonal neighbor of any member, that it's a true neighbor per the
 * precomputed `PieceAdjacency` graph (AD-3) — zero tolerance, one bad
 * member falls the whole group back to `repositionOrFuse` at the raw drop
 * point instead of locking in (so a drop near the Frame that doesn't
 * validate still gets a chance to fuse with another loose piece/Cluster
 * resting nearby — this rule doesn't stop applying just because the drop
 * happened to land close to a Frame slot). On success every member becomes
 * an individually `placed_row`/`placed_col` Piece (the Frame has no notion
 * of Clusters) and the Cluster row, if any, is dropped. A single atomic
 * transaction — no partial state is ever observable.
 */
export async function placePiece(input: {
  pieceId: string;
  targetRow: number;
  targetCol: number;
  x: number;
  y: number;
  expectedVersion: number;
}): Promise<PieceActionResult> {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    const loaded = await loadDraggedGroup(client, input.pieceId);
    if (!loaded.ok) {
      await client.query("ROLLBACK");
      return { success: false, error: { code: loaded.code } };
    }
    if (loaded.version !== input.expectedVersion) {
      await client.query("ROLLBACK");
      return { success: false, error: { code: ERROR_CODES.STALE_WRITE } };
    }
    if (loaded.placedRow !== null) {
      await client.query("ROLLBACK");
      return { success: false, error: { code: ERROR_CODES.ALREADY_PLACED } };
    }

    const { group } = loaded;

    async function restWithoutLocking(): Promise<PieceActionResult> {
      const { version, fused } = await repositionOrFuse(client, group, input.x, input.y);
      await client.query("COMMIT");
      // Story 3.11: `placed: false` on every path through here — this
      // write succeeded (the piece/Cluster rests somewhere valid, possibly
      // fused), it just never actually locked into the Frame. The client
      // uses this to tell an *ordinary, expected* non-lock (it predicted
      // the same outcome) from a *genuine, rare* disagreement (it predicted
      // a lock and got this instead) — see `collections.ts`'s `onUpdate`.
      // `fused` (Story 3.13) is the analogous signal for the optimistic-
      // fusion prediction — a Frame-slot drop that didn't lock can still
      // genuinely fuse with a neighbor instead of just resting loose.
      return { success: true, version, placed: false, fused };
    }

    const anchorTargetRow = input.targetRow - group.draggedMember.offsetRow;
    const anchorTargetCol = input.targetCol - group.draggedMember.offsetCol;
    const targets = group.members.map((m) => ({
      member: m,
      targetRow: anchorTargetRow + m.offsetRow,
      targetCol: anchorTargetCol + m.offsetCol,
    }));

    for (const t of targets) {
      const inBounds =
        Number.isInteger(t.targetRow) &&
        Number.isInteger(t.targetCol) &&
        t.targetRow >= 0 &&
        t.targetRow < group.gridRows &&
        t.targetCol >= 0 &&
        t.targetCol < group.gridCols;
      if (!inBounds) {
        return restWithoutLocking();
      }
    }

    const slotRowsParam = targets.map((t) => t.targetRow);
    const slotColsParam = targets.map((t) => t.targetCol);
    const slotResult = await client.query(
      `select 1 from piece
       where room_id = $1 and (placed_row, placed_col) in (
         select * from unnest($2::int[], $3::int[])
       )`,
      [group.roomId, slotRowsParam, slotColsParam],
    );
    if (slotResult.rows.length > 0) {
      return restWithoutLocking();
    }

    // A locked piece never moves again — one left overlapping a loose piece
    // still resting nearby (Story 3.5's "a failed lock just rests where
    // dropped", possible since that change) would bury it permanently, with
    // no way to ever reach it again. Checked against every not-yet-Frame-
    // anchored piece's *actual* current position (never grid-aligned, so
    // the exact-slot `SLOT_OCCUPIED` check above can't catch this).
    //
    // Two passes, not one: the first (unlocked) scan of every free piece in
    // the Room would otherwise leave a race — a concurrent `movePiece`
    // could land a loose piece on this exact spot between that read and
    // this transaction's commit, burying it anyway with nothing catching
    // it (unlike the exact-slot check above, which the `piece_room_placed_
    // slot_key` unique index backstops). Locking every free piece in the
    // Room up front to close that window would cost real contention at
    // scale (Story 3.10's concurrent-Participants scenario), so only the
    // handful the first pass actually finds nearby get row-locked and
    // re-checked with a guaranteed-fresh position — narrows the window to
    // "an unrelated piece gets dragged into this exact spot in the instant
    // between the two passes," not "any write anywhere in the Room."
    const frameWidth = group.gridCols * group.tileWidth;
    const frameHeight = group.gridRows * group.tileHeight;
    const slotCenters = targets.map((t) => ({
      x: -frameWidth / 2 + t.targetCol * group.tileWidth + group.tileWidth / 2,
      y: -frameHeight / 2 + t.targetRow * group.tileHeight + group.tileHeight / 2,
    }));

    const initialFreeCandidates = await loadStationaryFreeCandidates(
      client,
      group.roomId,
      group.members.map((m) => m.pieceId),
      group.tileWidth,
      group.tileHeight,
    );
    const nearbyPieceIds = initialFreeCandidates
      .filter((p) =>
        slotCenters.some(
          (slot) =>
            Math.abs(p.screenX - slot.x) < group.tileWidth * NEARBY_LOCK_MARGIN_FACTOR &&
            Math.abs(p.screenY - slot.y) < group.tileHeight * NEARBY_LOCK_MARGIN_FACTOR,
        ),
      )
      .map((p) => p.pieceId);
    const lockedFreeCandidates = (
      await loadAndLockFreePiecesByIds(
        client,
        nearbyPieceIds,
        group.tileWidth,
        group.tileHeight,
      )
    ).map((p) => ({ x: p.screenX, y: p.screenY }));
    for (const slotCenter of slotCenters) {
      if (
        overlapsAnyFreePiece(slotCenter, lockedFreeCandidates, group.tileWidth, group.tileHeight)
      ) {
        return restWithoutLocking();
      }
    }

    for (const t of targets) {
      const orientationResult = validatePieceOrientationAndShape(
        t.member.shapeType,
        t.member.rotation,
        t.targetRow,
        t.targetCol,
        group.gridRows,
        group.gridCols,
      );
      if (!orientationResult.valid) {
        return restWithoutLocking();
      }
    }

    // Joined against the neighbor's own true grid position — `piece_adjacency`
    // itself is undirected ("these two are really neighbors somewhere"), so
    // without also knowing *which side* each true neighbor sits on relative
    // to this member's own true grid position, a piece's true left-neighbor
    // could be accepted sitting to its right (both are still members of its
    // true-neighbor set) — reported directly from manual testing.
    const neighborIdsResult = await client.query(
      `select pa.piece_id, pa.neighbor_piece_id, p.grid_row as neighbor_grid_row, p.grid_col as neighbor_grid_col
       from piece_adjacency pa
       join piece p on p.id = pa.neighbor_piece_id
       where pa.piece_id = any($1::uuid[])`,
      [targets.map((t) => t.member.pieceId)],
    );
    const memberByPieceId = new Map(group.members.map((m) => [m.pieceId, m]));
    const trueNeighborsByPieceIdAndDirection = new Map<
      string,
      Partial<Record<OrthogonalDirection, string>>
    >();
    for (const row of neighborIdsResult.rows) {
      const member = memberByPieceId.get(row.piece_id);
      if (!member) {
        continue;
      }
      const deltaRow = row.neighbor_grid_row - member.gridRow;
      const deltaCol = row.neighbor_grid_col - member.gridCol;
      const direction: OrthogonalDirection | undefined =
        deltaRow === -1 && deltaCol === 0
          ? "up"
          : deltaRow === 1 && deltaCol === 0
            ? "down"
            : deltaRow === 0 && deltaCol === -1
              ? "left"
              : deltaRow === 0 && deltaCol === 1
                ? "right"
                : undefined;
      if (!direction) {
        continue;
      }
      const byDirection = trueNeighborsByPieceIdAndDirection.get(row.piece_id) ?? {};
      byDirection[direction] = row.neighbor_piece_id;
      trueNeighborsByPieceIdAndDirection.set(row.piece_id, byDirection);
    }

    const allAdjacentSlots = targets.flatMap((t) => [
      [t.targetRow - 1, t.targetCol],
      [t.targetRow + 1, t.targetCol],
      [t.targetRow, t.targetCol - 1],
      [t.targetRow, t.targetCol + 1],
    ]);
    const occupiedNeighborsResult = await client.query(
      `select id, placed_row, placed_col from piece
       where room_id = $1 and placed_row is not null
         and (placed_row, placed_col) in (
           select * from unnest($2::int[], $3::int[])
         )`,
      [group.roomId, allAdjacentSlots.map(([row]) => row), allAdjacentSlots.map(([, col]) => col)],
    );
    const occupiedByCoord = new Map<string, string>(
      occupiedNeighborsResult.rows.map((row) => [`${row.placed_row},${row.placed_col}`, row.id]),
    );

    // Bootstrap leniency (no already-validated neighbor to test against) is
    // reserved for a genuine corner — one of exactly four unambiguous
    // anchors in the whole Frame. Every other piece/Cluster, however
    // internally consistent it already is, must land touching a piece
    // that's already validated (i.e. already locked into the Frame) —
    // otherwise nothing here has actually been confirmed correct yet, and
    // it just rests unplaced instead of being rejected.
    //
    // `canBootstrapWithoutNeighbor` trusts that every member's shape/target
    // slot was already confirmed by the `validatePieceOrientationAndShape`
    // loop just above this one — that ordering (orientation, then
    // bootstrap) is what makes a `true` result here mean a genuine corner
    // slot, not just a piece whose `shapeType` happens to say `"corner"`.
    // Don't reorder these two loops without re-checking that contract (see
    // the longer comment on `canBootstrapWithoutNeighbor` itself).
    if (occupiedByCoord.size === 0) {
      if (!canBootstrapWithoutNeighbor(group.members.map((m) => m.shapeType))) {
        return restWithoutLocking();
      }
    } else {
      for (const t of targets) {
        const trueNeighborsByDirection =
          trueNeighborsByPieceIdAndDirection.get(t.member.pieceId) ?? {};
        const neighborResult = validatePlacementNeighbors(
          trueNeighborsByDirection,
          occupiedByCoord,
          t.targetRow,
          t.targetCol,
        );
        if (!neighborResult.valid) {
          return restWithoutLocking();
        }
      }
    }

    for (const t of targets) {
      await client.query(
        `update piece
         set placed_row = $2, placed_col = $3, cluster_id = null,
             cluster_offset_row = null, cluster_offset_col = null, version = version + 1
         where id = $1`,
        [t.member.pieceId, t.targetRow, t.targetCol],
      );
    }
    if (group.clusterId) {
      await client.query(`delete from cluster where id = $1`, [group.clusterId]);
    }

    const versionResult = await client.query(`select version from piece where id = $1`, [
      input.pieceId,
    ]);

    await client.query("COMMIT");
    return { success: true, version: versionResult.rows[0].version, placed: true };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("placePiece failed:", err);
    return { success: false, error: { code: mapUnexpectedError(err) } };
  } finally {
    client.release();
  }
}
