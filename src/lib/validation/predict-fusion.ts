import {
  findContactCandidates,
  validateFusion,
  type ContactCandidate,
  type ScreenPositioned,
} from "./validate-fusion";
import { computeTrueNeighborIds, type GridPositioned } from "./true-neighbors";

// Mirrors `repositionOrFuse`'s own tolerance exactly (`piece-actions.ts`) —
// a snapping window, not a loose "nearby" radius (Story 3.8's AC that
// sorting pieces near each other must have zero effect unless they
// genuinely touch).
const CONTACT_TOLERANCE_FACTOR = 0.3;

export type PredictedFusionOutcome = "none" | "genuine" | "false-contact";

export type PredictedFusion = {
  outcome: PredictedFusionOutcome;
  // The actual matched contacts, whenever `outcome !== "none"` — Story
  // 3.13 needs to know *which* stationary piece(s) a genuine fusion
  // touched, to render the optimistic Cluster grouping; empty for `"none"`.
  candidates: readonly ContactCandidate[];
};

/**
 * Client-side prediction of `repositionOrFuse`'s own fusion decision —
 * reuses the exact same pure `findContactCandidates`/`validateFusion` the
 * Server Action runs, fed by each piece's `gridRow`/`gridCol` (Story 3.11)
 * via `true-neighbors.ts`'s derivation. Never authoritative — only used
 * here to pick which of the "success"/"reject" placement sounds to play
 * instantly (and, since Story 3.13, which pieces to optimistically group
 * into one Cluster), never to decide the actual write.
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
}): PredictedFusion {
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
    return { outcome: "none", candidates: [] };
  }
  const trueNeighborsByPieceId = new Map(
    knownPieces.map((p) => [p.id, computeTrueNeighborIds(p.id, knownPieces)]),
  );
  const outcome = validateFusion(candidates, trueNeighborsByPieceId) ? "genuine" : "false-contact";
  return { outcome, candidates };
}
