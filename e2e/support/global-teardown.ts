import { closePool } from "./db";

// Supabase direct connections are scarce; leaving the pool open keeps them
// held until the process exits, which matters when runs happen back to back.
async function globalTeardown() {
  await closePool();
}

export default globalTeardown;
