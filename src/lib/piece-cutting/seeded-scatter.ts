/**
 * Deterministic scatter positions around (0,0) — the only randomness in the
 * piece-cutting pipeline (shape/adjacency are fully deterministic from grid
 * position alone). Seeded so a given Room's initial scatter is reproducible
 * (Architecture AD-3's "graine fixe"), while still looking random to
 * Participants. Coordinate space is provisional — see Story 2.4 Dev Notes:
 * Epic 3 owns the real infinite-canvas/Frame layout.
 */

// mulberry32 — small, fast, deterministic PRNG. No dependency needed.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return hash;
}

export function createSeededScatter(
  seed: string,
  count: number,
  radiusRange: { min: number; max: number },
): Array<{ x: number; y: number }> {
  const random = mulberry32(hashSeed(seed));
  const positions: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < count; i++) {
    const angle = random() * 2 * Math.PI;
    const radius = radiusRange.min + random() * (radiusRange.max - radiusRange.min);
    positions.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }

  return positions;
}
