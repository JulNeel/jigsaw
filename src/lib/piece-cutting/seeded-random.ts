/**
 * Shared deterministic PRNG primitives — no dependency needed. Used
 * everywhere this app needs "looks random to a Participant, but
 * reproducible from a fixed seed" (Architecture AD-3's "graine fixe"):
 * `seeded-scatter.ts`'s initial piece positions/rotations, and
 * `compute-piece-edge-shapes.ts`'s per-edge tab/blank assignment. Extracted
 * once both needed the exact same algorithm, rather than each having its
 * own copy.
 */

// mulberry32 — small, fast, deterministic PRNG.
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return hash;
}
