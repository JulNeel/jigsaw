import {
  canBootstrapWithoutNeighbor,
  validatePieceOrientationAndShape,
  validatePlacementNeighbors,
} from "./validate-placement";
import { overlapsAnyFreePiece, type ScreenPoint } from "./validate-overlap";
import { computeTrueNeighborsByDirection, type GridPositioned } from "./true-neighbors";
import { classifyPieceShape, type PieceShapeType } from "@/lib/piece-cutting/classify-piece-shape";

export type PredictableKnownPiece = GridPositioned & {
  shapeType: PieceShapeType;
  rotation: number;
  placedRow: number | null;
  placedCol: number | null;
};

export type PredictableMember = {
  pieceId: string;
  // Relative to the dragged member's own target slot — (0, 0) for a solo
  // piece, `RoomDetailPiece.clusterOffsetRow`/`clusterOffsetCol` for a
  // Cluster's other members (mirrors `placePiece`'s own `anchorTargetRow`/
  // `anchorTargetCol` + per-member offset math).
  offsetRow: number;
  offsetCol: number;
};

type ResolvedTarget = {
  member: PredictableMember;
  known: PredictableKnownPiece;
  targetRow: number;
  targetCol: number;
};

// Resolves every member's `known` piece up front, typed as non-optional for
// the rest of the function — `null` if any member's id isn't in
// `knownPieces` at all (can't happen in practice, since every dragged
// member is by definition part of the live `pieces` snapshot it came from,
// but a stale reference isn't ruled out at the type level). Isolating this
// here means every other read of `.known` below is guaranteed-safe by
// construction, not by a scattered `!` repeated at each call site (a code
// review finding: those were safe today but fragile to a future refactor
// that decoupled `targets` from this exact resolution step).
function resolveTargets(
  members: readonly PredictableMember[],
  anchorTargetRow: number,
  anchorTargetCol: number,
  knownById: ReadonlyMap<string, PredictableKnownPiece>,
): ResolvedTarget[] | null {
  const targets: ResolvedTarget[] = [];
  for (const member of members) {
    const known = knownById.get(member.pieceId);
    if (!known) {
      return null;
    }
    targets.push({
      member,
      known,
      targetRow: anchorTargetRow + member.offsetRow,
      targetCol: anchorTargetCol + member.offsetCol,
    });
  }
  return targets;
}

// `"locked"` — a genuine validation attempt that succeeds (green pulse).
// `"rejected"` — a genuine validation attempt that fails for any reason
// other than burying a loose piece: an already-occupied exact slot, a
// shape/orientation mismatch, or a neighbor mismatch (red pulse).
// `"overlap"` — a genuine validation attempt that fails specifically
// because locking here would bury a still-loose piece resting nearby
// (orange pulse) — called out as its own outcome (2026-09-02, user
// feedback) since it reads differently to a Participant than a shape/
// neighbor mismatch: the piece itself may well belong here, something else
// is just in the way.
// `"not-an-attempt"` — Story 3.6's amendment (2026-09-02, user feedback):
// not every Frame-slot drop is a genuine "validation attempt" — the
// physical-puzzle leniency (AD-3) means an edge/interior piece with no
// already-placed neighbor to test against is neither confirmed nor
// rejected, it just rests. The only two scenarios that actually test
// anything are (1) a genuine corner piece dropped at a grid-corner slot, or
// (2) any drop landing adjacent to at least one already-placed (validated)
// neighbor. No pulse/chime at all for this outcome.
export type FrameLockOutcome = "locked" | "rejected" | "overlap" | "not-an-attempt";

export type FrameLockPrediction = {
  outcome: FrameLockOutcome;
};

/**
 * Client-side prediction of `placePiece`'s own lock-in decision — reuses
 * the exact same pure validation functions the Server Action runs
 * (`validatePieceOrientationAndShape`, `validatePlacementNeighbors`/
 * `canBootstrapWithoutNeighbor`, `overlapsAnyFreePiece`), fed by
 * `gridRow`/`gridCol` now included in the Room's client payload (Story
 * 3.11). Never authoritative — `placePiece` still independently re-runs
 * every one of these checks inside its own Postgres transaction regardless
 * of what this returns (AD-2). `outcome: "locked"` only tells the caller
 * it's safe to show the optimistic "locked into place" snap with
 * confidence; anything else means: don't — rest at the raw drop point
 * instead, exactly like an unpredicted drop always has.
 */
export function predictFrameLock(params: {
  members: readonly PredictableMember[];
  anchorTargetRow: number;
  anchorTargetCol: number;
  gridRows: number;
  gridCols: number;
  tileWidth: number;
  tileHeight: number;
  frameWidth: number;
  frameHeight: number;
  knownPieces: readonly PredictableKnownPiece[];
  otherFreePiecePositions: readonly ScreenPoint[];
}): FrameLockPrediction {
  const {
    members,
    anchorTargetRow,
    anchorTargetCol,
    gridRows,
    gridCols,
    tileWidth,
    tileHeight,
    frameWidth,
    frameHeight,
    knownPieces,
    otherFreePiecePositions,
  } = params;

  const notAnAttempt: FrameLockPrediction = { outcome: "not-an-attempt" };

  const knownById = new Map(knownPieces.map((p) => [p.id, p]));
  const targets = resolveTargets(members, anchorTargetRow, anchorTargetCol, knownById);
  if (!targets) {
    return notAnAttempt;
  }

  for (const t of targets) {
    if (
      !Number.isInteger(t.targetRow) ||
      !Number.isInteger(t.targetCol) ||
      t.targetRow < 0 ||
      t.targetRow >= gridRows ||
      t.targetCol < 0 ||
      t.targetCol >= gridCols
    ) {
      return notAnAttempt;
    }
  }

  const placedByCoord = new Map<string, string>();
  for (const p of knownPieces) {
    if (p.placedRow != null && p.placedCol != null) {
      placedByCoord.set(`${p.placedRow},${p.placedCol}`, p.id);
    }
  }

  const DIRECTION_DELTAS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  const occupiedByCoord = new Map<string, string>();
  for (const t of targets) {
    for (const [dRow, dCol] of DIRECTION_DELTAS) {
      const key = `${t.targetRow + dRow},${t.targetCol + dCol}`;
      const pieceId = placedByCoord.get(key);
      if (pieceId) {
        occupiedByCoord.set(key, pieceId);
      }
    }
  }

  // Classified purely from grid position + the piece's own declared shape
  // — independent of whether orientation/occupancy checks below end up
  // passing — since "attempting the corner scenario" is what the piece and
  // slot *are*, not whether that attempt succeeds.
  const isCornerAtCornerSlot = targets.some(
    (t) =>
      t.known.shapeType === "corner" &&
      classifyPieceShape(t.targetRow, t.targetCol, gridRows, gridCols) === "corner",
  );
  // Code review fix (2026-09-02): the exact target slot itself already
  // being occupied is unambiguously a genuine, testable rejection — no
  // physical-puzzle leniency applies to "there's already a piece sitting
  // exactly there" the way it does to "no neighbor exists yet to test
  // against." Missing this meant a slot occupied by an already-placed piece
  // with nothing *adjacent* to it yet (e.g. the very first piece placed in
  // an empty region) silently fell through to `"not-an-attempt"` — no red
  // pulse — even though `placePiece` unambiguously rejects it server-side
  // via the same exact-slot check just below.
  const isTargetSlotOccupied = targets.some((t) =>
    placedByCoord.has(`${t.targetRow},${t.targetCol}`),
  );
  const isValidationAttempt =
    occupiedByCoord.size > 0 || isCornerAtCornerSlot || isTargetSlotOccupied;
  if (!isValidationAttempt) {
    // Mathematically guaranteed never to lock either (neither branch below
    // could succeed) — safe to skip the remaining checks entirely.
    return notAnAttempt;
  }

  for (const t of targets) {
    if (placedByCoord.has(`${t.targetRow},${t.targetCol}`)) {
      return { outcome: "rejected" };
    }
  }

  const slotCenters = targets.map((t) => ({
    x: -frameWidth / 2 + t.targetCol * tileWidth + tileWidth / 2,
    y: -frameHeight / 2 + t.targetRow * tileHeight + tileHeight / 2,
  }));
  for (const slotCenter of slotCenters) {
    if (overlapsAnyFreePiece(slotCenter, otherFreePiecePositions, tileWidth, tileHeight)) {
      return { outcome: "overlap" };
    }
  }

  for (const t of targets) {
    const result = validatePieceOrientationAndShape(
      t.known.shapeType,
      t.known.rotation,
      t.targetRow,
      t.targetCol,
      gridRows,
      gridCols,
    );
    if (!result.valid) {
      return { outcome: "rejected" };
    }
  }

  if (occupiedByCoord.size === 0) {
    const locked = canBootstrapWithoutNeighbor(targets.map((t) => t.known.shapeType));
    return { outcome: locked ? "locked" : "rejected" };
  }

  for (const t of targets) {
    const trueNeighborsByDirection = computeTrueNeighborsByDirection(t.known, knownPieces);
    const result = validatePlacementNeighbors(
      trueNeighborsByDirection,
      occupiedByCoord,
      t.targetRow,
      t.targetCol,
    );
    if (!result.valid) {
      return { outcome: "rejected" };
    }
  }

  return { outcome: "locked" };
}
