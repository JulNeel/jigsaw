import { Pool } from "pg";

// `src/lib/db/pg.ts` is `import "server-only"` and therefore unusable from
// test code — so this is its own pool, deliberately configured the same way
// (direct connection, SSL without cert verification against Supabase).
//
// `max: 2` is not arbitrary: DATABASE_URL must be Supabase's *direct*
// connection (not the pooler — see `.env.example`), those connections are a
// scarce resource, and the dev server under test is already holding several
// of them through its own pool. Playwright runs with `workers: 1`, so two is
// plenty.
let pool: Pool | null = null;

/**
 * Guard against seeding into the wrong database. The e2e suite runs against
 * the maintainer's own hosted Supabase project (a deliberate decision — no
 * local stack exists), so every safeguard here is load-bearing rather than
 * ceremonial: an accidental run must fail loudly instead of quietly writing
 * rows into a real project.
 */
function assertHostedRunAllowed(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "e2e: DATABASE_URL is missing. Playwright loads it from .env.local — check that the file exists and defines it.",
    );
  }
  if (process.env.E2E_ALLOW_HOSTED_DB !== "1") {
    let host = "unknown host";
    try {
      host = new URL(url).host;
    } catch {
      // A malformed URL is the pool's problem to report, not this guard's.
    }
    throw new Error(
      `e2e: refusing to run against ${host} without E2E_ALLOW_HOSTED_DB=1.\n` +
        "These tests seed and delete rows in a real Supabase project. Every room they\n" +
        "create is prefixed `e2e-` and cleaned up, but set the variable deliberately:\n" +
        "  E2E_ALLOW_HOSTED_DB=1 pnpm e2e",
    );
  }
}

export function getPool(): Pool {
  if (!pool) {
    assertHostedRunAllowed();
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** One piece row, as the tests actually want to assert on it. */
export type PieceRow = {
  id: string;
  grid_row: number;
  grid_col: number;
  rotation: number;
  scatter_x: number;
  scatter_y: number;
  placed_row: number | null;
  placed_col: number | null;
  version: number;
  cluster_id: string | null;
  cluster_offset_row: number | null;
  cluster_offset_col: number | null;
};

/**
 * The ground truth every assertion ultimately rests on. The client's
 * optimistic render can legitimately disagree with this for a moment (and
 * one of the bugs this harness exists to catch is exactly a case where it
 * disagrees *forever*) — the database cannot.
 */
export async function readPiece(pieceId: string): Promise<PieceRow> {
  const result = await getPool().query<PieceRow>(
    `select id, grid_row, grid_col, rotation, scatter_x, scatter_y,
            placed_row, placed_col, version,
            cluster_id, cluster_offset_row, cluster_offset_col
     from piece where id = $1`,
    [pieceId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`e2e: piece ${pieceId} not found`);
  }
  return row;
}

/**
 * Polls the database until a piece's version passes `baseline`.
 *
 * Deliberately separate from the client-side wait: this answers "did the
 * server accept the write", where `waitForVersionAbove` answers "did this
 * client find out". Keeping the two apart is what lets a test say which half
 * of a round trip broke — a distinction the app itself cannot make, since a
 * lost confirmation and a rejected write look identical from the browser.
 */
export async function waitForDbVersionAbove(
  pieceId: string,
  baseline: number,
  timeoutMs = 10_000,
): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { version } = await readPiece(pieceId);
    if (version > baseline) {
      return version;
    }
    if (Date.now() > deadline) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export type ClusterRow = { id: string; anchor_x: number; anchor_y: number; version: number };

export async function readClusters(roomId: string): Promise<ClusterRow[]> {
  const result = await getPool().query<ClusterRow>(
    `select id, anchor_x, anchor_y, version from cluster where room_id = $1`,
    [roomId],
  );
  return result.rows;
}

/**
 * Waits for a Cluster in this room to pass `baseline`.
 *
 * The right signal for a plain Îlot reposition, and `waitForDbVersionAbove`
 * is the wrong one: moving a Cluster writes the `cluster` row's anchor and
 * bumps exactly one piece row — the *representative* member, which is
 * whichever member has the lowest id, not the member the player happened to
 * grab (`room-canvas.tsx`'s `representativeMember`). Waiting on a named
 * piece's version therefore succeeds or hangs depending on how two random
 * UUIDs sorted, which is no basis for a test.
 */
export async function waitForClusterVersionAbove(
  roomId: string,
  baseline: number,
  timeoutMs = 10_000,
): Promise<ClusterRow | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = (await readClusters(roomId)).find((c) => c.version > baseline);
    if (hit) {
      return hit;
    }
    if (Date.now() > deadline) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function countClusters(roomId: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `select count(*)::text as count from cluster where room_id = $1`,
    [roomId],
  );
  return Number(result.rows[0].count);
}
