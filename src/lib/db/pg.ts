import "server-only";
import { Pool } from "pg";

/**
 * Server-only Postgres pool (direct connection, not the pooler — required
 * for Electric's logical replication elsewhere in the stack). Used by
 * Server Actions to write domain tables directly; the Supabase client SDK
 * is never used for `.from(table).insert/update/delete()` (Architecture
 * AD-2).
 */
declare global {
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }
  return new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
}

// Reuse a single pool across hot-reloads / module re-evaluations in dev.
export const pgPool = globalThis.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.__pgPool = pgPool;
}
