/**
 * Deterministic scatter positions around (0,0) — the only randomness in the
 * piece-cutting pipeline (shape/adjacency are fully deterministic from grid
 * position alone). Seeded so a given Room's initial scatter is reproducible
 * (Architecture AD-3's "graine fixe"), while still looking random to
 * Participants. Coordinate space is provisional — see Story 2.4 Dev Notes:
 * Epic 3 owns the real infinite-canvas/Frame layout.
 */

import { hashSeed, mulberry32 } from "./seeded-random";

// How much further out, beyond the Frame's own footprint, the scatter
// field extends in every direction at minimum — visual variety, not a
// correctness requirement. A uniform 2D field (not a ring) is what makes
// the result look like pieces spilled out across a table around the
// Frame, rather than a perfectly regular wreath (an earlier version
// sampled in polar coordinates within a narrow radius band, which —
// regardless of how wide that band was — always produces a ring shape by
// construction, never a natural-looking scatter). The field is widened
// further below when a large piece count and/or large tiles would
// otherwise pack it too densely for random rejection sampling to reliably
// avoid overlaps.
const SCATTER_SPREAD = 1200;

// Random sequential placement (reject-and-retry against every already-
// placed piece) gets unreliable well before the field is anywhere near
// its true maximum packing density — in practice, once total piece
// footprint area exceeds roughly a quarter of the available field area,
// late-placed pieces increasingly exhaust their retry budget. Sizing the
// field so footprints stay under this fraction is what actually prevents
// visible overlaps at high piece counts (a high `MAX_SCATTER_ATTEMPTS`
// alone can't compensate for a field that's fundamentally too small).
const TARGET_FOOTPRINT_UTILIZATION = 0.25;

// Almost always settles within a handful of retries given the field
// sizing above, but capped rather than looping forever — if every attempt
// is exhausted, the last candidate is used as-is (a rare residual overlap)
// rather than blocking Room creation entirely.
const MAX_SCATTER_ATTEMPTS = 150;

/**
 * Deterministic scatter positions, uniformly sampled across a square field
 * centered on the Frame (not a ring around it — see `SCATTER_SPREAD`'s
 * comment for why that matters for how natural the result looks). Every
 * piece's own rendered footprint (its full `tileWidth`×`tileHeight`
 * rectangle, not just its center point) is rejection-sampled away from the
 * Frame's rectangle and from every other already-placed piece's footprint.
 * `frameHalfWidth`/`frameHalfHeight` describe that rectangle, centered on
 * the same (0,0) origin the scatter itself is centered on (Story 3.1's
 * convention).
 */
export function createSeededScatter(
  seed: string,
  count: number,
  frameHalfWidth: number,
  frameHalfHeight: number,
  tileWidth: number,
  tileHeight: number,
): Array<{ x: number; y: number }> {
  const random = mulberry32(hashSeed(seed));
  const positions: Array<{ x: number; y: number }> = [];

  const frameArea = 2 * frameHalfWidth * (2 * frameHalfHeight);
  const totalFootprintArea = count * tileWidth * tileHeight;
  const areaNeededForPieces = totalFootprintArea / TARGET_FOOTPRINT_UTILIZATION;
  const fieldSideForDensity = Math.sqrt(frameArea + areaNeededForPieces);
  const scatterHalfExtent = Math.max(
    Math.max(frameHalfWidth, frameHalfHeight) + SCATTER_SPREAD,
    fieldSideForDensity / 2,
  );

  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < MAX_SCATTER_ATTEMPTS; attempt++) {
      x = (random() * 2 - 1) * scatterHalfExtent;
      y = (random() * 2 - 1) * scatterHalfExtent;
      const overlapsFrame =
        Math.abs(x) < frameHalfWidth + tileWidth / 2 &&
        Math.abs(y) < frameHalfHeight + tileHeight / 2;
      const overlapsAnotherPiece = positions.some(
        (p) => Math.abs(x - p.x) < tileWidth && Math.abs(y - p.y) < tileHeight,
      );
      if (!overlapsFrame && !overlapsAnotherPiece) {
        break;
      }
    }
    positions.push({ x, y });
  }

  return positions;
}

// Fixed, distinct rotation values (as-cut orientation is 0°; Story 3.5
// validates placement against exactly this set) — a piece must be
// physically rotated back to 0° before it can ever be tested for
// placement, matching how a real puzzle piece comes out of the box in no
// particular orientation.
const SCATTER_ROTATIONS = [0, 90, 180, 270] as const;

/**
 * Deterministic random initial `rotation` per piece — a separate PRNG
 * stream (its own hashed seed) from `createSeededScatter`'s, so the two
 * stay independent regardless of how many attempts the scatter's rejection
 * sampling above consumes per piece.
 */
export function createSeededRotations(seed: string, count: number): number[] {
  const random = mulberry32(hashSeed(`${seed}:rotation`));
  return Array.from(
    { length: count },
    () => SCATTER_ROTATIONS[Math.floor(random() * SCATTER_ROTATIONS.length)],
  );
}
