import { findContactCandidates, validateFusion, type ScreenPositioned } from "./validate-fusion";
import { computeTrueNeighborIds, type GridPositioned } from "./true-neighbors";

// Mirrors `repositionOrFuse`'s own tolerance exactly (`piece-actions.ts`) —
// a snapping window, not a loose "nearby" radius (Story 3.8's AC that
// sorting pieces near each other must have zero effect unless they
// genuinely touch).
const CONTACT_TOLERANCE_FACTOR = 0.3;

export type PredictedFusionOutcome = "none" | "genuine" | "false-contact";

/**
 * Client-side prediction of `repositionOrFuse`'s own fusion decision —
 * reuses the exact same pure `findContactCandidates`/`validateFusion` the
 * Server Action runs, fed by each piece's `gridRow`/`gridCol` (Story 3.11)
 * via `true-neighbors.ts`'s derivation. Never authoritative — only used
 * here to pick which of the "success"/"reject" placement sounds to play
 * instantly, never to decide the actual write.
 *
 * `"none"` — no candidate piece/Cluster was brought into contact at all
 * (an ordinary free-space move): no success/reject sound, only the
 * generic drop sound applies.
 */
export function predictFusionOutcome(params: {
  draggedMembers: readonly ScreenPositioned[];
  stationaryMembers: readonly ScreenPositioned[];
  tileWidth: number;
  tileHeight: number;
  knownPieces: readonly GridPositioned[];
}): PredictedFusionOutcome {
  const { draggedMembers, stationaryMembers, tileWidth, tileHeight, knownPieces } = params;
  const tolerance = Math.min(tileWidth, tileHeight) * CONTACT_TOLERANCE_FACTOR;
  const candidates = findContactCandidates(
    [...draggedMembers],
    [...stationaryMembers],
    tileWidth,
    tileHeight,
    tolerance,
  );
  if (candidates.length === 0) {
    return "none";
  }
  const trueNeighborsByPieceId = new Map(
    knownPieces.map((p) => [p.id, computeTrueNeighborIds(p.id, knownPieces)]),
  );
  return validateFusion(candidates, trueNeighborsByPieceId) ? "genuine" : "false-contact";
}
