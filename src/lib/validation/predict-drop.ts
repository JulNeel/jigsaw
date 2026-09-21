import {
  CONTACT_TOLERANCE_FACTOR,
  findContactCandidates,
  genuineContacts,
  type ContactCandidate,
} from "./validate-fusion";
import { computeTrueNeighborIds } from "./true-neighbors";
import { frameSlotCenter, type FrameGeometry } from "./frame-geometry";
import { findCornerAnchor } from "./validate-corner-anchor";
import { computeContagionTargets, resolvePlacementAnchor, type ContagionMember } from "./validate-contagion";
import type { PieceShapeType } from "@/lib/piece-cutting/classify-piece-shape";

// Client-side mirror of `piece-actions.ts`'s `repositionFuseOrPlace` — same
// shared pure functions, same order of checks (contact -> merge -> anchor
// resolution -> corner bootstrap -> plain fusion), fed by this client's own
// local snapshot. Never authoritative (AD-2): only ever picks the instant
// pulse/chime and the optimistic render; `movePiece` is called identically
// at drag-end regardless of what this returns. Replaces both
// `predict-fusion.ts` and `predict-frame-lock.ts` — the two mechanics they
// separately predicted are now one.

export type PredictablePiece = {
  id: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
  shapeType: PieceShapeType;
  placedRow: number | null;
  placedCol: number | null;
  clusterId: string | null;
  clusterOffsetRow: number | null;
  clusterOffsetCol: number | null;
  scatterX: number;
  scatterY: number;
};

export type DraggedMember = {
  pieceId: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
  shapeType: PieceShapeType;
  screenX: number;
  screenY: number;
};

type MergedMember = {
  pieceId: string;
  gridRow: number;
  gridCol: number;
  rotation: number;
  shapeType: PieceShapeType;
  placedRow: number | null;
  placedCol: number | null;
  screenX: number;
  screenY: number;
};

// Mirrors `pieceRenderPosition` (`room-canvas.tsx`) exactly, in the same
// priority order — kept as its own small pure copy here rather than an
// import, since this module must never depend on a component file.
function stationaryScreenPosition(
  piece: PredictablePiece,
  clustersById: ReadonlyMap<string, { anchorX: number; anchorY: number }>,
  geom: FrameGeometry,
): { x: number; y: number } {
  if (piece.placedRow != null && piece.placedCol != null) {
    return frameSlotCenter(piece.placedRow, piece.placedCol, geom);
  }
  if (piece.clusterId != null) {
    const cluster = clustersById.get(piece.clusterId);
    if (cluster) {
      return {
        x: cluster.anchorX + piece.clusterOffsetCol! * geom.tileWidth,
        y: cluster.anchorY + piece.clusterOffsetRow! * geom.tileHeight,
      };
    }
  }
  return { x: piece.scatterX, y: piece.scatterY };
}

// `"none"` — no contact at all, an ordinary free-space move.
// `"false-contact"` — a genuine contact attempt that wasn't a true
// neighbor (or was rotated) — red pulse everywhere now, homogeneous with a
// near-Frame rejection (user-confirmed decision, 2026-09-12).
// `"fused"` — a genuine fusion, no placement (no already-placed anchor, no
// corner bootstrap).
// `"placed"` — the merged group inherits placement, either via contagion
// (an already-placed anchor) or a lone corner (or Ilot containing one) at
// its own true corner.
// `"placement-blocked"` — an anchor was found (a real already-placed
// neighbor, or a corner) but the actual write can't land (conflicting
// anchors, out of bounds, or the exact slot is already taken by another
// *locked* piece). A merely loose piece lying on the slot is no longer a
// reason: locked pieces render beneath everything still in play, so nothing
// can be buried by a placement.
export type PredictedDropOutcome = "none" | "false-contact" | "fused" | "placed" | "placement-blocked";

export type PredictedDrop = {
  outcome: PredictedDropOutcome;
  candidates: readonly ContactCandidate[];
  placedSlotByPieceId?: ReadonlyMap<string, { row: number; col: number }>;
  blockedReason?: "conflict" | "bounds" | "occupied";
  mergedMemberIds?: readonly string[];
};

export function predictDropOutcome(params: {
  draggedMembers: readonly DraggedMember[];
  pieces: readonly PredictablePiece[];
  excludePieceIds: ReadonlySet<string>;
  clustersById: ReadonlyMap<string, { anchorX: number; anchorY: number }>;
  geom: FrameGeometry;
}): PredictedDrop {
  const { draggedMembers, pieces, excludePieceIds, clustersById, geom } = params;
  const { tileWidth, tileHeight } = geom;

  const stationary = pieces
    .filter((p) => !excludePieceIds.has(p.id))
    .map((p) => {
      const { x, y } = stationaryScreenPosition(p, clustersById, geom);
      return {
        pieceId: p.id,
        gridRow: p.gridRow,
        gridCol: p.gridCol,
        rotation: p.rotation,
        shapeType: p.shapeType,
        placedRow: p.placedRow,
        placedCol: p.placedCol,
        clusterId: p.clusterId,
        screenX: x,
        screenY: y,
      };
    });

  const tolerance = Math.min(tileWidth, tileHeight) * CONTACT_TOLERANCE_FACTOR;
  const candidates = findContactCandidates([...draggedMembers], stationary, tileWidth, tileHeight, tolerance);

  let mergedMembers: MergedMember[] = draggedMembers.map((m) => ({
    pieceId: m.pieceId,
    gridRow: m.gridRow,
    gridCol: m.gridCol,
    rotation: m.rotation,
    shapeType: m.shapeType,
    placedRow: null,
    placedCol: null,
    screenX: m.screenX,
    screenY: m.screenY,
  }));
  let genuinelyFused = false;

  if (candidates.length > 0) {
    const trueNeighborsByPieceId = new Map(
      draggedMembers.map((m) => [m.pieceId, computeTrueNeighborIds(m.pieceId, pieces)]),
    );
    // Mirrors `repositionFuseOrPlace` exactly (AD-2): an incidental contact
    // neither vetoes the fusion nor joins the Îlot — only genuine ones do.
    const genuine = genuineContacts(candidates, trueNeighborsByPieceId);
    if (genuine.length > 0) {
      genuinelyFused = true;
      const stationaryById = new Map(stationary.map((s) => [s.pieceId, s]));
      const touchedIds = new Set(genuine.map((c) => c.b.pieceId));
      const addedClusterIds = new Set<string>();
      const extra: MergedMember[] = [];
      for (const touchedId of touchedIds) {
        const touched = stationaryById.get(touchedId)!;
        if (touched.clusterId) {
          if (addedClusterIds.has(touched.clusterId)) {
            continue;
          }
          addedClusterIds.add(touched.clusterId);
          for (const p of pieces) {
            if (p.clusterId === touched.clusterId) {
              const { x, y } = stationaryScreenPosition(p, clustersById, geom);
              extra.push({
                pieceId: p.id,
                gridRow: p.gridRow,
                gridCol: p.gridCol,
                rotation: p.rotation,
                shapeType: p.shapeType,
                placedRow: null,
                placedCol: null,
                screenX: x,
                screenY: y,
              });
            }
          }
        } else {
          extra.push({
            pieceId: touched.pieceId,
            gridRow: touched.gridRow,
            gridCol: touched.gridCol,
            rotation: touched.rotation,
            shapeType: touched.shapeType,
            placedRow: touched.placedRow,
            placedCol: touched.placedCol,
            screenX: touched.screenX,
            screenY: touched.screenY,
          });
        }
      }
      mergedMembers = [...mergedMembers, ...extra];
    }
  }

  const mergedIds = new Set(mergedMembers.map((m) => m.pieceId));

  function checkPlacement(anchor: { rowDelta: number; colDelta: number }):
    | { ok: true; targets: ReadonlyMap<string, { row: number; col: number }> }
    | { ok: false; reason: "bounds" | "occupied" } {
    const targetsResult = computeContagionTargets(anchor, mergedMembers, geom);
    if (!targetsResult.valid) {
      return { ok: false, reason: "bounds" };
    }
    // Only the slots this drop would newly claim. A member already sitting
    // on its own target is an anchor and its slot is not up for grabs —
    // mirrors `repositionFuseOrPlace`'s `nonAnchorTargets` exactly (AD-2).
    const targetList = [...targetsResult.targets.values()].filter(
      (target) =>
        !mergedMembers.some(
          (m) => m.placedRow === target.row && m.placedCol === target.col && m.placedRow != null,
        ),
    );
    const occupied = pieces.some(
      (p) =>
        !mergedIds.has(p.id) &&
        p.placedRow != null &&
        targetList.some((t) => t.row === p.placedRow && t.col === p.placedCol),
    );
    if (occupied) {
      return { ok: false, reason: "occupied" };
    }
    // A loose piece resting on a claimed slot used to block the placement
    // here too, mirroring a server-side rule that no longer exists: locked
    // pieces now render beneath everything in play, so nothing can end up
    // buried and there is nothing left to refuse. See `renderItems` in
    // `room-canvas.tsx`.
    return { ok: true, targets: targetsResult.targets };
  }

  const anchorResolution = resolvePlacementAnchor(
    mergedMembers.map(
      (m): ContagionMember => ({
        pieceId: m.pieceId,
        gridRow: m.gridRow,
        gridCol: m.gridCol,
        rotation: m.rotation,
        placedRow: m.placedRow,
        placedCol: m.placedCol,
      }),
    ),
  );

  if (anchorResolution.kind === "conflict") {
    return { outcome: "placement-blocked", candidates, blockedReason: "conflict" };
  }
  if (anchorResolution.kind === "anchored") {
    const result = checkPlacement(anchorResolution.anchor);
    if (result.ok) {
      return {
        outcome: "placed",
        candidates,
        placedSlotByPieceId: result.targets,
        mergedMemberIds: [...mergedIds],
      };
    }
    // A genuinely-already-placed anchor can't become a "partial" Cluster
    // member — any failure here aborts the whole drop, mirroring the
    // server's own rule exactly (see `repositionFuseOrPlace`'s comment).
    return { outcome: "placement-blocked", candidates, blockedReason: result.reason };
  }

  // No already-placed anchor — the only remaining way to place is a lone
  // corner (or an Ilot containing one) at its own true corner.
  const cornerAnchor = findCornerAnchor(mergedMembers, geom);
  if (cornerAnchor) {
    const result = checkPlacement({ rowDelta: 0, colDelta: 0 });
    if (result.ok) {
      return {
        outcome: "placed",
        candidates,
        placedSlotByPieceId: result.targets,
        mergedMemberIds: [...mergedIds],
      };
    }
    // A corner "anchor" was never a real commitment — unlike the contagion
    // case above, a failed attempt here falls through to the plain-fusion
    // outcome below instead of aborting.
  }

  if (genuinelyFused) {
    // `mergedMemberIds` here (unlike `placedSlotByPieceId`) is the caller's
    // only way to learn the *fully expanded* touched membership (a touched
    // piece's whole Cluster, not just the one directly-touched piece) — it
    // has no other reason to duplicate that expansion itself.
    return { outcome: "fused", candidates, mergedMemberIds: [...mergedIds] };
  }
  if (candidates.length > 0) {
    return { outcome: "false-contact", candidates };
  }
  return { outcome: "none", candidates };
}
