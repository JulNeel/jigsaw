"use server";

import type { PoolClient } from "pg";
import { pgPool } from "@/lib/db/pg";
import { recordContributions } from "@/lib/rooms/contributions";
import { resolveActor, type ClaimedActor, type ResolvedActor } from "@/lib/rooms/contribution-actor";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors";
import {
  CONTACT_TOLERANCE_FACTOR,
  findContactCandidates,
  genuineContacts,
  type ScreenPositioned,
} from "@/lib/validation/validate-fusion";
import { findCornerAnchor, type AnchorCandidateMember } from "@/lib/validation/validate-corner-anchor";
import {
  computeContagionTargets,
  resolvePlacementAnchor,
  type ContagionMember,
} from "@/lib/validation/validate-contagion";
import { frameSlotCenter, type FrameGeometry } from "@/lib/validation/frame-geometry";
import type { PieceShapeType } from "@/lib/piece-cutting/classify-piece-shape";

// No auth gate on any of these — placing/moving/rotating/fusing a piece is
// exactly the "contribute with zero friction" mechanic Guests get (FR-6,
// Story 3.1's Consistency Conventions: "un Guest est une session sans
// compte"). Room *creation* is gated (Story 2.1); playing is not.

export type PieceActionResult =
  // `placed`/`fused` are the transaction's own ground truth, never inferred
  // from position/version — `movePiece` is now the single drag-end Server
  // Action, and every call attempts a reposition/fuse/place via
  // `repositionFuseOrPlace`, so both fields are always present on success.
  // `fused` mirrors `placed`'s role (Story 3.11/3.13): whether this write
  // genuinely fused the dragged group with another piece/Cluster. `placed`
  // additionally covers Story 3.19's placement contagion — fusing with an
  // already-placed piece/Cluster, or a lone corner anchoring at its true
  // corner, makes the whole merged group placed in the same write.
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

// Why a write was refused, and why a drop that touched something didn't fuse.
//
// Added as throwaway diagnostics while chasing three reports that all looked
// identical from the outside, and kept because they turned out to be the only
// place those distinctions exist at all: a rejection's *code* is what
// separates "the client let a locked piece be dragged" from "the client's
// cached version fell behind", and the two demand opposite fixes. The e2e
// suite now asserts on these lines — `assertNoLogLine` on the happy paths is
// what stops a test passing while the server quietly rejects everything.
//
// Dev only: a production build never evaluates either branch.
const TRACE = process.env.NODE_ENV !== "production";

function traceRejection(
  code: string,
  input: { pieceId: string; expectedVersion: number },
  loaded: { version: number; placedRow: number | null },
) {
  if (TRACE) {
    console.warn(
      `[move-reject] ${code} piece=${input.pieceId} clientExpected=${input.expectedVersion} ` +
        `serverVersion=${loaded.version} serverPlacedRow=${loaded.placedRow}`,
    );
  }
}

// Why a drop that *did* have contact candidates ended up not fusing. Every
// reason is a distinct branch of `repositionFuseOrPlace`, and from the
// outside they are indistinguishable — the piece simply rests where it was
// dropped, exactly as it would after an ordinary move.
function traceNoFusion(reason: string, pieceId: string, detail: Record<string, unknown>) {
  if (TRACE) {
    console.warn(`[no-fusion] ${reason} piece=${pieceId}`, detail);
  }
}

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

// Every other piece in the Room (loose or already placed into the Frame),
// positioned at its current screen coordinates — a placed piece's is its
// fixed Frame-slot center (`frameSlotCenter`), a Cluster member's is its
// Cluster's anchor + its own offset, everything else is its free scatter
// position. Unlike the old `loadStationaryFreeCandidates` this deliberately
// no longer excludes placed pieces: placement now propagates by contagion
// (Story 3.19), which requires an already-placed piece to be a valid
// contact/fusion target — a placed piece is never itself *dragged* (that's
// still guarded separately, by `loadDraggedGroup`'s `ALREADY_PLACED` check),
// but it must be reachable as a *stationary* candidate for something else to
// fuse with. Callers that need free-only candidates (the overlap "would
// this bury a loose piece" guard) filter `placedRow == null` themselves —
// see `wouldBuryLoosePiece` below.
type StationaryCandidate = ScreenPositioned & {
  placedRow: number | null;
  placedCol: number | null;
  clusterId: string | null;
  shapeType: PieceShapeType;
};

function mapCandidateRows(
  rows: Array<Record<string, unknown>>,
  geom: FrameGeometry,
): StationaryCandidate[] {
  return rows.map((row) => {
    const placedRow = row.placed_row as number | null;
    const placedCol = row.placed_col as number | null;
    const { x: screenX, y: screenY } =
      placedRow != null && placedCol != null
        ? frameSlotCenter(placedRow, placedCol, geom)
        : row.anchor_x != null
          ? {
              x: (row.anchor_x as number) + (row.cluster_offset_col as number) * geom.tileWidth,
              y: (row.anchor_y as number) + (row.cluster_offset_row as number) * geom.tileHeight,
            }
          : { x: row.scatter_x as number, y: row.scatter_y as number };
    return {
      pieceId: row.id as string,
      gridRow: row.grid_row as number,
      gridCol: row.grid_col as number,
      rotation: row.rotation as number,
      shapeType: row.shape_type as PieceShapeType,
      placedRow,
      placedCol,
      clusterId: (row.cluster_id as string | null) ?? null,
      screenX,
      screenY,
    };
  });
}

async function loadStationaryCandidates(
  client: PoolClient,
  roomId: string,
  excludePieceIds: string[],
  geom: FrameGeometry,
): Promise<StationaryCandidate[]> {
  const result = await client.query(
    `select p.id, p.grid_row, p.grid_col, p.rotation, p.shape_type,
            p.placed_row, p.placed_col, p.cluster_id,
            p.scatter_x, p.scatter_y, p.cluster_offset_row, p.cluster_offset_col,
            c.anchor_x, c.anchor_y
     from piece p
     left join cluster c on c.id = p.cluster_id
     where p.room_id = $1 and p.id <> all($2::uuid[])`,
    [roomId, excludePieceIds],
  );
  return mapCandidateRows(result.rows, geom);
}

/**
 * Row-locks and re-reads exactly the given pieces — used to close the race
 * window between the first, unlocked scan (contact detection, or the
 * overlap guard's own nearby-candidate scan) and the final write: lock only
 * the handful of pieces that scan already found relevant (never every piece
 * in the Room, which would cost real contention at scale), then re-check
 * their now-guaranteed-fresh position/placement state. `FOR UPDATE` on this
 * `LEFT JOIN` also locks each matched piece's Cluster row, if any, blocking
 * a concurrent move of that whole Cluster for the same window.
 */
async function loadAndLockPiecesByIds(
  client: PoolClient,
  pieceIds: string[],
  geom: FrameGeometry,
): Promise<StationaryCandidate[]> {
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
    `select p.id, p.grid_row, p.grid_col, p.rotation, p.shape_type, p.cluster_id,
            p.placed_row, p.placed_col,
            p.scatter_x, p.scatter_y, p.cluster_offset_row, p.cluster_offset_col,
            c.anchor_x, c.anchor_y
     from piece p
     left join cluster c on c.id = p.cluster_id
     where p.id = any($1::uuid[])
     for update of p`,
    [pieceIds],
  );
  const clusterIds = [...new Set(result.rows.map((row) => row.cluster_id).filter(Boolean))];
  if (clusterIds.length > 0) {
    await client.query(`select id from cluster where id = any($1::uuid[]) for update`, [
      clusterIds,
    ]);
  }
  return mapCandidateRows(result.rows, geom);
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

type MergedMember = {
  pieceId: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
  shapeType: PieceShapeType;
  placedRow: number | null;
  placedCol: number | null;
  screenX: number;
  screenY: number;
};

/**
 * Writes every non-anchor member's `placed_row`/`placed_col` (an anchor is
 * a member whose current `placedRow`/`placedCol` already equals its own
 * computed target — either a genuinely-already-placed contagion anchor, or,
 * trivially, a corner member anchoring at rowDelta/colDelta (0,0)), clears
 * `cluster_id` on every member, and deletes every Cluster row the merged
 * group touched — the same atomic "every member individually placed, no
 * Cluster survives" invariant `placePiece` used to enforce alone.
 */
async function writeContagionPlacement(
  client: PoolClient,
  targets: ReadonlyMap<string, { row: number; col: number }>,
  mergedMembers: readonly MergedMember[],
  clusterIdsToDelete: ReadonlySet<string>,
  draggedPieceId: string,
  actor: ResolvedActor,
  roomId: string,
): Promise<number> {
  // Story 4.2: exactly the pieces this gesture *newly* placed. The loop
  // already skips members that were their own anchor, so an already-placed
  // neighbour that the contagion merely fused against is not credited to
  // whoever happened to drop a piece next to it.
  const newlyPlaced: string[] = [];
  for (const member of mergedMembers) {
    const target = targets.get(member.pieceId)!;
    if (member.placedRow === target.row && member.placedCol === target.col) {
      continue;
    }
    newlyPlaced.push(member.pieceId);
    await client.query(
      `update piece
       set placed_row = $2, placed_col = $3, cluster_id = null,
           cluster_offset_row = null, cluster_offset_col = null, version = version + 1
       where id = $1`,
      [member.pieceId, target.row, target.col],
    );
  }
  if (clusterIdsToDelete.size > 0) {
    await client.query(`delete from cluster where id = any($1::uuid[])`, [
      [...clusterIdsToDelete],
    ]);
  }
  await recordContributions(client, {
    roomId,
    pieceIds: newlyPlaced,
    kind: "placed",
    actor,
  });
  const versionResult = await client.query(`select version from piece where id = $1`, [
    draggedPieceId,
  ]);
  return versionResult.rows[0].version;
}

/**
 * The one place that ever fuses, or places, pieces/Clusters together —
 * reused by every drag-end, everywhere (Frame or free space alike; the
 * mechanics no longer differ). Checks whether the dragged group has been
 * genuinely brought into contact with another piece/Cluster anywhere in the
 * Room (Story 3.8's true-neighbor + rotation check, unchanged) and, if so:
 *
 * - if the merged group (dragged + touched) contains an already-placed
 *   member, the whole group inherits placement from it (contagion, Story
 *   3.19) — every member's target slot is its own true grid position offset
 *   by that anchor's own placed-vs-grid delta;
 * - otherwise, if no member is already placed but one is a corner piece
 *   resting at its own true corner, that's the sole remaining bootstrap
 *   anchor (`findCornerAnchor` — stricter than the old shape-only bootstrap:
 *   it must be *the* true corner, not merely *a* corner slot);
 * - otherwise it's a plain fusion — the merged group becomes (or joins) a
 *   free-floating Cluster, exactly as before.
 *
 * A false or absent contact, or a contagion/corner attempt that doesn't
 * validate, is never rejected outright — it just rests at the raw drop
 * point (optionally still genuinely fused), same principle as before: only
 * ever confirm a *positive* match, never bounce a drop back for failing
 * one.
 */
async function repositionFuseOrPlace(
  client: PoolClient,
  group: DraggedGroup,
  x: number,
  y: number,
  actor: ResolvedActor,
): Promise<{ version: number; fused: boolean; placed: boolean }> {
  const geom: FrameGeometry = {
    gridRows: group.gridRows,
    gridCols: group.gridCols,
    tileWidth: group.tileWidth,
    tileHeight: group.tileHeight,
  };
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
  const draggedScreenById = new Map(draggedScreenMembers.map((m) => [m.pieceId, m]));
  const draggedMergedMembers: MergedMember[] = group.members.map((m) => {
    const screen = draggedScreenById.get(m.pieceId)!;
    return {
      pieceId: m.pieceId,
      gridRow: m.gridRow,
      gridCol: m.gridCol,
      rotation: m.rotation,
      shapeType: m.shapeType,
      placedRow: null,
      placedCol: null,
      screenX: screen.screenX,
      screenY: screen.screenY,
    };
  });

  const stationary = await loadStationaryCandidates(
    client,
    group.roomId,
    group.members.map((m) => m.pieceId),
    geom,
  );
  const tolerance = Math.min(group.tileWidth, group.tileHeight) * CONTACT_TOLERANCE_FACTOR;
  const candidates = findContactCandidates(
    draggedScreenMembers,
    stationary,
    group.tileWidth,
    group.tileHeight,
    tolerance,
  );

  let mergedMembers: MergedMember[] = draggedMergedMembers;
  let genuinelyFused = false;
  const touchedClusterIds = new Set<string>();
  const touchedSoloPieceIds = new Set<string>();

  if (candidates.length > 0) {
    const trueNeighborsByPieceId = await loadTrueNeighborSets(
      client,
      group.members.map((m) => m.pieceId),
    );
    // Only the genuine contacts' own pieces are ever merged — an incidental
    // near-contact (the 45%-of-a-tile window catches plenty in a scattered
    // pile) no longer vetoes the fusion, so it must not be allowed to ride
    // along into the Îlot either. See `genuineContacts`' own comment.
    const genuine = genuineContacts(candidates, trueNeighborsByPieceId);
    if (genuine.length === 0) {
      traceNoFusion("no-genuine-contact", group.draggedMember.pieceId, {
        candidates: candidates.map((c) => ({
          a: c.a.pieceId,
          aGrid: [c.a.gridRow, c.a.gridCol],
          aRot: c.a.rotation,
          b: c.b.pieceId,
          bGrid: [c.b.gridRow, c.b.gridCol],
          bRot: c.b.rotation,
          direction: c.direction,
          bIsTrueNeighbor: trueNeighborsByPieceId.get(c.a.pieceId)?.has(c.b.pieceId) ?? false,
        })),
      });
    }
    if (genuine.length > 0) {
      // Re-verify contact with the now-locked, guaranteed-fresh position —
      // `candidates` above came from an unlocked read, so a concurrent
      // write could have relocated a touched piece in the window between
      // that read and this lock. Fusing on the stale geometry anyway would
      // silently override whatever the other Participant just did.
      const touchedResult = await client.query(
        `select id, cluster_id, grid_row, grid_col, rotation, shape_type, placed_row, placed_col
         from piece where id = any($1::uuid[]) for update`,
        [genuine.map((c) => c.b.pieceId)],
      );
      const freshTouched = await loadAndLockPiecesByIds(
        client,
        genuine.map((c) => c.b.pieceId),
        geom,
      );
      const freshCandidates = findContactCandidates(
        draggedScreenMembers,
        freshTouched,
        group.tileWidth,
        group.tileHeight,
        tolerance,
      );
      // Re-derived from the fresh geometry rather than reusing `genuine`:
      // a counterpart that a concurrent write moved out of contact in the
      // meantime must drop out of the merge individually, not drag the
      // whole (still otherwise valid) fusion down with it — and equally
      // must not be merged on the strength of its own now-stale contact.
      const stillGenuine = genuineContacts(freshCandidates, trueNeighborsByPieceId);
      const stillTouchedIds = new Set(stillGenuine.map((c) => c.b.pieceId));
      if (stillTouchedIds.size === 0) {
        traceNoFusion("contact-lost-under-lock", group.draggedMember.pieceId, {
          genuineBeforeLock: genuine.length,
          freshCandidates: freshCandidates.length,
        });
      }
      if (stillTouchedIds.size > 0) {
        genuinelyFused = true;
        const freshTouchedById = new Map(freshTouched.map((s) => [s.pieceId, s]));
        const extraMembers: MergedMember[] = [];
        for (const row of touchedResult.rows.filter((r) => stillTouchedIds.has(r.id))) {
          if (row.cluster_id) {
            touchedClusterIds.add(row.cluster_id);
          } else {
            touchedSoloPieceIds.add(row.id);
            const screen = freshTouchedById.get(row.id)!;
            extraMembers.push({
              pieceId: row.id,
              gridRow: row.grid_row,
              gridCol: row.grid_col,
              rotation: row.rotation,
              shapeType: row.shape_type,
              placedRow: row.placed_row,
              placedCol: row.placed_col,
              screenX: screen.screenX,
              screenY: screen.screenY,
            });
          }
        }
        for (const otherClusterId of touchedClusterIds) {
          const membersResult = await client.query(
            `select p.id, p.grid_row, p.grid_col, p.rotation, p.shape_type,
                    p.cluster_offset_row, p.cluster_offset_col, c.anchor_x, c.anchor_y
             from piece p
             join cluster c on c.id = p.cluster_id
             where p.cluster_id = $1
             for update`,
            [otherClusterId],
          );
          for (const m of membersResult.rows) {
            extraMembers.push({
              pieceId: m.id,
              gridRow: m.grid_row,
              gridCol: m.grid_col,
              rotation: m.rotation,
              shapeType: m.shape_type,
              placedRow: null,
              placedCol: null,
              screenX: m.anchor_x + m.cluster_offset_col * group.tileWidth,
              screenY: m.anchor_y + m.cluster_offset_row * group.tileHeight,
            });
          }
        }
        mergedMembers = [...draggedMergedMembers, ...extraMembers];
      }
    }
  }

  const mergedPieceIds = mergedMembers.map((m) => m.pieceId);
  const clustersInMergedGroup = new Set(
    [...touchedClusterIds, ...(group.clusterId ? [group.clusterId] : [])],
  );

  const anchorResolution = resolvePlacementAnchor(
    mergedMembers.map(
      (m): ContagionMember => ({
        pieceId: m.pieceId,
        gridRow: m.gridRow,
        gridCol: m.gridCol,
        rotation: m.rotation,
        placedRow: m.placedRow,
        placedCol: m.placedCol,
      }),
    ),
  );

  // A genuinely-already-placed anchor is un-clusterable (there's no modeled
  // "partially placed" state) — any failure here means the geometry
  // contradicted itself (two mutually-inconsistent already-placed regions
  // touching, or a write that can't land), so the only safe outcome is to
  // abort the whole drop, never a partial/downgraded fusion.
  if (anchorResolution.kind === "conflict") {
    traceNoFusion("anchor-conflict", group.draggedMember.pieceId, { genuinelyFused });
    return { version: await repositionPlain(client, group, x, y), fused: false, placed: false };
  }
  if (anchorResolution.kind === "anchored") {
    const targetsResult = computeContagionTargets(anchorResolution.anchor, mergedMembers, geom);
    if (targetsResult.valid) {
      // The slots this write will actually newly occupy. A member already
      // sitting on its own target is an anchor: `writeContagionPlacement`
      // skips it entirely, so its slot is not something this write claims.
      //
      // Both guards below must ask about *these* slots and no others. The
      // burial check used to receive the full target set instead (fixed
      // 2026-09-20, reproduced by `e2e/fusion-next-to-placed.e2e.ts`): a
      // loose piece resting anywhere on the already-assembled region then
      // counted as "about to be buried" by a slot that was already occupied
      // before the drop, and vetoed the whole contagion. In play that reads
      // as a piece refusing to join a group it is genuinely touching, for no
      // visible reason, until the unrelated loose piece is moved away —
      // "parfois une pièce refuse de fusionner avec 2 pièces validées".
      const nonAnchorTargets = new Map(
        [...targetsResult.targets].filter(
          ([, target]) =>
            !mergedMembers.some(
              (m) =>
                m.placedRow === target.row && m.placedCol === target.col && m.placedRow != null,
            ),
        ),
      );
      const slotResult =
        nonAnchorTargets.size === 0
          ? { rows: [] }
          : await client.query(
              `select 1 from piece
               where room_id = $1 and (placed_row, placed_col) in (
                 select * from unnest($2::int[], $3::int[])
               ) and id <> all($4::uuid[])`,
              [
                group.roomId,
                [...nonAnchorTargets.values()].map((t) => t.row),
                [...nonAnchorTargets.values()].map((t) => t.col),
                mergedPieceIds,
              ],
            );
      if (slotResult.rows.length === 0) {
        const version = await writeContagionPlacement(
          client,
          targetsResult.targets,
          mergedMembers,
          clustersInMergedGroup,
          group.draggedMember.pieceId,
          actor,
          group.roomId,
        );
        return { version, fused: genuinelyFused, placed: true };
      }
      traceNoFusion("contagion-blocked", group.draggedMember.pieceId, {
        genuinelyFused,
        occupiedSlots: slotResult.rows.length,
      });
    } else {
      traceNoFusion("contagion-targets-invalid", group.draggedMember.pieceId, { genuinelyFused });
    }
    // Contagion didn't validate — abort entirely, per the rule above.
    return { version: await repositionPlain(client, group, x, y), fused: false, placed: false };
  }

  // No already-placed anchor in the merged group — the only remaining way
  // to place is a lone corner (or an Îlot containing one) resting at its
  // own true corner slot. A failure here (occupied/overlap/out-of-bounds)
  // falls back to the plain-fusion outcome below, unlike a contagion
  // failure — a corner "anchor" was never a real DB commitment, so the
  // fusion match itself (if genuine) is still worth keeping.
  const cornerAnchor = findCornerAnchor(
    mergedMembers as unknown as AnchorCandidateMember[],
    geom,
  );
  if (cornerAnchor) {
    const targetsResult = computeContagionTargets({ rowDelta: 0, colDelta: 0 }, mergedMembers, geom);
    if (targetsResult.valid) {
      const slotResult = await client.query(
        `select 1 from piece
         where room_id = $1 and (placed_row, placed_col) in (
           select * from unnest($2::int[], $3::int[])
         ) and id <> all($4::uuid[])`,
        [
          group.roomId,
          [...targetsResult.targets.values()].map((t) => t.row),
          [...targetsResult.targets.values()].map((t) => t.col),
          mergedPieceIds,
        ],
      );
      if (slotResult.rows.length === 0) {
        const version = await writeContagionPlacement(
          client,
          targetsResult.targets,
          mergedMembers,
          clustersInMergedGroup,
          group.draggedMember.pieceId,
          actor,
          group.roomId,
        );
        return { version, fused: genuinelyFused, placed: true };
      }
    }
  }

  if (!genuinelyFused) {
    return { version: await repositionPlain(client, group, x, y), fused: false, placed: false };
  }

  // Plain fusion: merge into a free-floating Cluster, exactly as before —
  // no member is placed.
  const stationaryRowsById = new Map(stationary.map((s) => [s.pieceId, s]));
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
    (
      await client.query(
        `insert into cluster (room_id, anchor_x, anchor_y) values ($1, $2, $3) returning id`,
        [group.roomId, mergedAnchorX, mergedAnchorY],
      )
    ).rows[0].id;

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

  // Story 4.2: one row for the gesture, not one per member. Fusing two
  // Îlots of six would otherwise write twelve near-identical lines for a
  // single action, and every piece involved was already someone's
  // contribution when it was placed or fused the first time.
  await recordContributions(client, {
    roomId: group.roomId,
    pieceIds: [group.draggedMember.pieceId],
    kind: "fused",
    actor,
  });

  const versionResult = await client.query(`select version from piece where id = $1`, [
    group.draggedMember.pieceId,
  ]);
  return { version: versionResult.rows[0].version, fused: true, placed: false };
}

/**
 * Repositions an unplaced piece/Cluster — checking along the way whether
 * it's been genuinely brought into contact with another piece/Cluster
 * (Story 3.8) and, since Story 3.19, whether that contact (or a lone
 * corner's own true position) makes the whole merged group placed. The
 * single drag-end Server Action now, everywhere — Frame or free space alike
 * (`placePiece` is gone; the mechanics no longer differ). Never a per-frame
 * check, only at drag-end, same performance reasoning as Story 3.3.
 */
export async function movePiece(input: {
  pieceId: string;
  x: number;
  y: number;
  expectedVersion: number;
  // Story 4.2. What the client *claims* to be — `resolveActor` decides how
  // much of it to believe, and a signed-in Participant's account id never
  // comes from here.
  actor: ClaimedActor;
}): Promise<PieceActionResult> {
  // Before `BEGIN`, deliberately: this verifies a JWT and can, in the worst
  // case, reach the network. Holding a transaction open across that would
  // lengthen the window in which this row is locked against every other
  // Participant, for something none of the writes depend on.
  const actor = await resolveActor(input.actor);
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
      traceRejection("STALE_WRITE", input, loaded);
      return { success: false, error: { code: ERROR_CODES.STALE_WRITE } };
    }
    if (loaded.placedRow !== null) {
      await client.query("ROLLBACK");
      traceRejection("ALREADY_PLACED", input, loaded);
      return { success: false, error: { code: ERROR_CODES.ALREADY_PLACED } };
    }

    const { version, fused, placed } = await repositionFuseOrPlace(
      client,
      loaded.group,
      input.x,
      input.y,
      actor,
    );
    await client.query("COMMIT");
    return { success: true, version, fused, placed };
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

