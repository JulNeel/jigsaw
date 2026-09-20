import { randomUUID } from "node:crypto";
import { classifyPieceShape } from "../../src/lib/piece-cutting/classify-piece-shape";
import { computeAdjacency } from "../../src/lib/piece-cutting/compute-adjacency";
import { frameSlotCenter, type FrameGeometry } from "../../src/lib/validation/frame-geometry";
import { getPool } from "./db";

// Every seeded room is marked with this prefix, on both `invite_slug` and
// `name`.
export const E2E_PREFIX = "e2e-";

// What cleanup actually matches — deliberately the full shape of a seeded
// slug, not just the prefix.
//
// `generateInviteSlug` builds a real room's slug from its *name*, so a room
// someone called "e2e" would be `e2e-<6 chars>` and a prefix match would
// have made it eligible for deletion. Requiring both groups, with the second
// exactly 8 hex characters from a UUID, cannot collide: the generator's own
// suffix is 6 characters of base36 and the middle group would have to come
// from the room's name. These are deletions against a real project, so the
// filter is the safeguard, not the prefix.
const SEEDED_SLUG_PATTERN = "^e2e-[0-9a-z]{6,10}-[0-9a-f]{8}$";

export type Point = { x: number; y: number };

export type SeedPieceSpec = {
  /** Free scatter position, in world coordinates (frame centre is 0,0). */
  at?: Point;
  /** Locks the piece into a Frame slot instead — `placed_row`/`placed_col`. */
  placed?: { row: number; col: number };
  rotation?: number;
  /** Key into `SeedSpec.clusters`. */
  cluster?: string;
  clusterOffset?: { row: number; col: number };
};

export type SeedSpec = {
  gridRows: number;
  gridCols: number;
  tileWidth?: number;
  tileHeight?: number;
  clusters?: Record<string, { anchorX: number; anchorY: number }>;
  /** Keyed `"row,col"`. Cells left out still get seeded — see below. */
  pieces?: Record<string, SeedPieceSpec>;
};

export type SeededRoom = {
  roomId: string;
  slug: string;
  path: string;
  geom: FrameGeometry;
  pieceId(row: number, col: number): string;
  clusterId(key: string): string;
  /** A Frame slot's centre in world coordinates — the app's own formula. */
  slotWorld(row: number, col: number): Point;
  cleanup(): Promise<void>;
};

// `room.created_by` is `not null references auth.users(id)`, so a seeded room
// has to borrow a real account. Memoised per process: it never changes during
// a run, and it is the only read this harness ever makes against `auth`.
let cachedUserId: string | null = null;

async function borrowUserId(): Promise<string> {
  if (cachedUserId) {
    return cachedUserId;
  }
  const result = await getPool().query<{ id: string }>(
    `select id from auth.users order by created_at asc limit 1`,
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(
      "e2e: no row in auth.users — sign up once in the app so seeded rooms have an owner.",
    );
  }
  cachedUserId = id;
  return id;
}

/**
 * Where a piece the fixture didn't position explicitly comes to rest.
 *
 * These *must* stay bounded. `RoomCanvas` derives the initial zoom from
 * `halfExtent`, a `max` over the render position of **every** piece in the
 * room (room-canvas.tsx), so a single piece parked far away collapses the
 * stage scale and turns every drag into a sub-pixel gesture. A ring just
 * outside the frame keeps unrelated pieces out of contact range while
 * leaving the scale sane.
 */
function defaultScatter(index: number, total: number, geom: FrameGeometry): Point {
  const radius = Math.max(geom.gridCols * geom.tileWidth, geom.gridRows * geom.tileHeight) * 0.9;
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  return { x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) };
}

/**
 * Creates a complete, playable room in one transaction.
 *
 * The grid is *always* seeded in full, even when the fixture only cares about
 * three pieces: `piece` has a `unique (room_id, grid_row, grid_col)`, the
 * client derives `totalPieceCount` from `gridRows * gridCols`, and the
 * adjacency graph assumes a complete cut. A partial grid would be a subtly
 * invalid room that fails in ways unrelated to whatever is under test.
 *
 * Geometry and classification come from `src/` rather than being re-derived
 * here — a harness whose idea of where a slot is drifts from the app's would
 * manufacture bugs that don't exist.
 */
export async function seedRoom(spec: SeedSpec): Promise<SeededRoom> {
  const geom: FrameGeometry = {
    gridRows: spec.gridRows,
    gridCols: spec.gridCols,
    tileWidth: spec.tileWidth ?? 100,
    tileHeight: spec.tileHeight ?? 100,
  };
  const slug = `${E2E_PREFIX}${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const roomId = randomUUID();
  const createdBy = await borrowUserId();
  const pool = getPool();
  const client = await pool.connect();

  const pieceIdByCell = new Map<string, string>();
  const clusterIdByKey = new Map<string, string>();

  try {
    await client.query("BEGIN");

    await client.query(
      `insert into room
         (id, name, invite_slug, image_source, image_library_id, piece_count,
          grid_rows, grid_cols, tile_width, tile_height, created_by)
       values ($1, $2, $3, 'library', $4, $5, $6, $7, $8, $9, $10)`,
      [
        roomId,
        `${E2E_PREFIX}${slug}`,
        slug,
        "e2e-fixture",
        geom.gridRows * geom.gridCols,
        geom.gridRows,
        geom.gridCols,
        geom.tileWidth,
        geom.tileHeight,
        createdBy,
      ],
    );

    for (const [key, cluster] of Object.entries(spec.clusters ?? {})) {
      const id = randomUUID();
      clusterIdByKey.set(key, id);
      await client.query(
        `insert into cluster (id, room_id, anchor_x, anchor_y) values ($1, $2, $3, $4)`,
        [id, roomId, cluster.anchorX, cluster.anchorY],
      );
    }

    // One batched multi-row insert, mirroring `createRoom`'s own reasoning
    // (`src/lib/rooms/actions.ts`): a round trip per piece is slow enough to
    // dominate the whole test.
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    const total = geom.gridRows * geom.gridCols;
    let index = 0;
    for (let row = 0; row < geom.gridRows; row++) {
      for (let col = 0; col < geom.gridCols; col++) {
        const cell = `${row},${col}`;
        const pieceSpec = spec.pieces?.[cell];
        const id = randomUUID();
        pieceIdByCell.set(cell, id);

        const scatter = pieceSpec?.at ?? defaultScatter(index, total, geom);
        const clusterKey = pieceSpec?.cluster;
        const clusterId = clusterKey ? clusterIdByKey.get(clusterKey) : null;
        if (clusterKey && !clusterId) {
          throw new Error(`e2e: piece ${cell} references unknown cluster "${clusterKey}"`);
        }
        // `piece_cluster_offset_consistent` requires all three to be set or
        // all three null.
        const offset = clusterId ? (pieceSpec?.clusterOffset ?? { row: 0, col: 0 }) : null;

        placeholders.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
        );
        values.push(
          id,
          roomId,
          row,
          col,
          classifyPieceShape(row, col, geom.gridRows, geom.gridCols),
          // No such object exists in Storage. `getRoomBySlug` filters out
          // per-entry `createSignedUrls` failures without throwing, so the
          // piece simply renders as a dashed placeholder — and Konva still
          // paints its interior into the hit graph, so it stays clickable.
          `e2e/${roomId}/${row}-${col}.png`,
          scatter.x,
          scatter.y,
          pieceSpec?.rotation ?? 0,
          pieceSpec?.placed?.row ?? null,
          pieceSpec?.placed?.col ?? null,
          clusterId,
          offset?.row ?? null,
          offset?.col ?? null,
        );
        index++;
      }
    }
    await client.query(
      `insert into piece
         (id, room_id, grid_row, grid_col, shape_type, image_asset_ref,
          scatter_x, scatter_y, rotation, placed_row, placed_col,
          cluster_id, cluster_offset_row, cluster_offset_col)
       values ${placeholders.join(", ")}`,
      values,
    );

    // Stored in both directions, exactly as `createRoom` does — the server's
    // fusion check looks up "true neighbours of the dragged piece" as a
    // single-column lookup, so a one-directional graph would make fusion
    // silently asymmetric.
    const adjValues: unknown[] = [];
    const adjPlaceholders: string[] = [];
    let a = 1;
    for (const pair of computeAdjacency(geom.gridRows, geom.gridCols)) {
      const from = pieceIdByCell.get(`${pair.row},${pair.col}`)!;
      const to = pieceIdByCell.get(`${pair.neighborRow},${pair.neighborCol}`)!;
      adjPlaceholders.push(`($${a++}, $${a++}, $${a++})`);
      adjValues.push(roomId, from, to);
      adjPlaceholders.push(`($${a++}, $${a++}, $${a++})`);
      adjValues.push(roomId, to, from);
    }
    if (adjPlaceholders.length > 0) {
      await client.query(
        `insert into piece_adjacency (room_id, piece_id, neighbor_piece_id)
         values ${adjPlaceholders.join(", ")}`,
        adjValues,
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    roomId,
    slug,
    path: `/room/${slug}`,
    geom,
    pieceId(row, col) {
      const id = pieceIdByCell.get(`${row},${col}`);
      if (!id) {
        throw new Error(`e2e: no piece at (${row},${col}) in a ${geom.gridRows}x${geom.gridCols} room`);
      }
      return id;
    },
    clusterId(key) {
      const id = clusterIdByKey.get(key);
      if (!id) {
        throw new Error(`e2e: no seeded cluster "${key}"`);
      }
      return id;
    },
    slotWorld(row, col) {
      return frameSlotCenter(row, col, geom);
    },
    async cleanup() {
      // `piece`, `piece_adjacency` and `cluster` all cascade from `room`.
      await getPool().query(`delete from room where id = $1 and invite_slug ~ $2`, [
        roomId,
        SEEDED_SLUG_PATTERN,
      ]);
    },
  };
}

/**
 * Reclaims rooms left behind by a crashed run. Age-bounded by default so a
 * sweep at the start of one run can never delete a room another session is
 * currently looking at; `maxAgeHours: 0` is the unconditional form behind
 * `pnpm e2e:clean`.
 */
export async function sweepSeededRooms(maxAgeHours = 2): Promise<number> {
  const result = await getPool().query(
    `delete from room
     where invite_slug ~ $1
       and created_at < now() - ($2 || ' hours')::interval`,
    [SEEDED_SLUG_PATTERN, String(maxAgeHours)],
  );
  return result.rowCount ?? 0;
}
