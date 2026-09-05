"use client";

import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import Konva from "konva";
import { useLiveQuery } from "@tanstack/react-db";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Group, Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import type { RoomDetail, RoomDetailCluster, RoomDetailPiece } from "@/lib/rooms/get-room-by-slug";
import { createRoomCollections } from "@/lib/db/collections";
import { markPredictedLock, subscribePlacementConflict } from "@/lib/rooms/placement-conflict-events";
import { subscribeMoveConflict } from "@/lib/rooms/move-conflict-events";
import {
  markPredictedFusion,
  subscribeFusionConflict,
} from "@/lib/rooms/predicted-fusion-events";
import {
  consumeAndCheckInstantPlacementFeedbackShown,
  markInstantPlacementFeedbackShown,
  subscribePiecePlaced,
} from "@/lib/rooms/piece-placement-events";
import { useSoundMuted } from "@/lib/audio/use-sound-muted";
import {
  playSuccessChime,
  playVictorySound,
  playWoodClick,
  SUCCESS_CHIME_STAGGER_SECONDS,
  warmUpAudioContext,
} from "@/lib/audio/play-tone";
import { triggerPlacementHaptic } from "@/lib/audio/haptics";
import { predictFrameLock } from "@/lib/validation/predict-frame-lock";
import { predictFusionOutcome } from "@/lib/validation/predict-fusion";
import { subscribeFrameComplete } from "@/lib/rooms/frame-completion-events";
import { computePieceEdgeShapes } from "@/lib/piece-cutting/compute-piece-edge-shapes";
import { buildPieceOutlinePath, drawPieceOutlinePath } from "@/lib/piece-cutting/build-piece-outline-path";
import { TILE_OVERHANG_FACTOR } from "@/lib/piece-cutting/slice-image";
import { clampPosition, clampScale, computeFitView, zoomAtPoint, type Point } from "./viewport-bounds";
import {
  computeAutoscrollVelocity,
  EDGE_AUTOSCROLL_MARGIN_PX,
  EDGE_AUTOSCROLL_MAX_SPEED_PX_PER_SEC,
} from "./edge-autoscroll";

// Status colors (2026-09-02, user feedback) — a deliberate departure from
// DESIGN.md's brand palette (terracotta `primary`/gold `accent`, neither of
// which encode a green/red/orange status vocabulary): green for a genuine
// validated lock, red for a genuine attempt that was rejected, orange for
// the specific "would have worked, but something's in the way" case
// (burying a loose piece), so a Participant can tell *why* at a glance
// rather than reading every non-success as the same undifferentiated
// "no." Not in the documented palette — flagged here for a future design
// pass rather than silently treated as an extension of it.
const PLACEMENT_PULSE_LOCKED_COLOR = "#2E7D32";
const PLACEMENT_PULSE_REJECTED_COLOR = "#C62828";
const PLACEMENT_PULSE_OVERLAP_COLOR = "#EF6C00";
const PLACEMENT_PULSE_DURATION_SECONDS = 0.32;

// Gold `accent` (DESIGN.md) — reserved specifically for presence/completion
// moments, never placement (Story 3.6's own pulses are deliberately never
// this color). A full-Frame glow, not a per-tile pulse, and a longer
// duration than any placement feedback — this is what makes Story 3.7's
// celebration "visibly different" (AC #1) at a glance.
const FRAME_COMPLETION_GLOW_COLOR = "#A67518";
const FRAME_COMPLETION_GLOW_DURATION_SECONDS = 1.2;

const CONTENT_MARGIN_FACTOR = 1.1;
// Zoom bounds are relative to each Room's own fit-to-content scale, not an
// absolute pixel value — Rooms vary widely in content extent (piece count,
// grid size, scatter radius), so a single absolute range would feel wrong
// across Rooms. Reasonable defaults, not spec-mandated — tune during manual
// verification if they feel off.
const MIN_SCALE_FACTOR = 0.5;
const MAX_SCALE_FACTOR = 4;
const WHEEL_ZOOM_FACTOR = 1.05;
// Minimum sliver (px) of content guaranteed to stay reachable at any pan
// extreme (AC #2 / NFR-1) — reasonable default, not spec-mandated.
const PAN_MARGIN = 150;

type ImageLoadState =
  | { status: "loading" }
  | { status: "loaded"; image: HTMLImageElement }
  | { status: "error" };

function usePieceImage(url: string | null): ImageLoadState {
  // Keyed on the url it was loaded for, so a stale/previous result is never
  // returned once `url` changes — without ever calling setState synchronously
  // in the effect body itself (only from the async onload/onerror callbacks,
  // React's blessed "subscribe to an external system" pattern).
  const [result, setResult] = useState<{ url: string; state: ImageLoadState } | null>(
    null,
  );

  useEffect(() => {
    if (!url) {
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) {
        setResult({ url, state: { status: "loaded", image: img } });
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setResult({ url, state: { status: "error" } });
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) {
    return { status: "error" };
  }
  return result?.url === url ? result.state : { status: "loading" };
}

// Where a piece's center should render: its Frame slot (centered-on-origin
// convention established in Story 3.1) once placed; its Cluster's own
// free-floating anchor + this piece's offset within it once fused (Story
// 3.8); otherwise its free-floating scatter/drag position. `clustersById`
// only ever contains free-floating Clusters (locking into the Frame deletes
// the Cluster row and converts every member back to `placedRow`/`placedCol`
// — see Architecture AD-3's amendment) — the three branches are mutually
// exclusive by construction, never a fallback for a missing lookup.
function pieceRenderPosition(
  piece: RoomDetailPiece,
  clustersById: ReadonlyMap<string, RoomDetailCluster>,
  frameWidth: number,
  frameHeight: number,
  tileWidth: number,
  tileHeight: number,
): Point {
  if (piece.placedRow != null && piece.placedCol != null) {
    return {
      x: -frameWidth / 2 + piece.placedCol * tileWidth + tileWidth / 2,
      y: -frameHeight / 2 + piece.placedRow * tileHeight + tileHeight / 2,
    };
  }
  if (piece.clusterId != null) {
    const cluster = clustersById.get(piece.clusterId);
    if (cluster) {
      return {
        x: cluster.anchorX + piece.clusterOffsetCol! * tileWidth,
        y: cluster.anchorY + piece.clusterOffsetRow! * tileHeight,
      };
    }
  }
  return { x: piece.scatterX, y: piece.scatterY };
}

// Every not-yet-Frame-anchored piece's current screen position, excluding
// the piece(s) presently being dragged — exactly the set `placePiece`'s own
// `overlapsAnyFreePiece` "would this lock bury a loose piece" guard checks
// server-side (Story 3.11's `predictFrameLock` mirrors that same check
// client-side).
function otherFreePiecePositions(
  pieces: readonly RoomDetailPiece[],
  excludeIds: ReadonlySet<string>,
  clustersById: ReadonlyMap<string, RoomDetailCluster>,
  frameWidth: number,
  frameHeight: number,
  tileWidth: number,
  tileHeight: number,
): Point[] {
  return pieces
    .filter((p) => p.placedRow == null && !excludeIds.has(p.id))
    .map((p) => pieceRenderPosition(p, clustersById, frameWidth, frameHeight, tileWidth, tileHeight));
}

// Same free-piece set as `otherFreePiecePositions`, but carrying the extra
// fields (`gridRow`/`gridCol`/`rotation`) `predictFusionOutcome` needs to
// tell a genuine contact from a false one — everything else it needs
// (`findContactCandidates`/`validateFusion`) already only wants a screen
// position plus those fields.
function otherFreePieceScreenPositions(
  pieces: readonly RoomDetailPiece[],
  excludeIds: ReadonlySet<string>,
  clustersById: ReadonlyMap<string, RoomDetailCluster>,
  frameWidth: number,
  frameHeight: number,
  tileWidth: number,
  tileHeight: number,
): { pieceId: string; gridRow: number; gridCol: number; rotation: number; screenX: number; screenY: number }[] {
  return pieces
    .filter((p) => p.placedRow == null && !excludeIds.has(p.id))
    .map((p) => {
      const { x, y } = pieceRenderPosition(
        p,
        clustersById,
        frameWidth,
        frameHeight,
        tileWidth,
        tileHeight,
      );
      return {
        pieceId: p.id,
        gridRow: p.gridRow,
        gridCol: p.gridCol,
        rotation: p.rotation,
        screenX: x,
        screenY: y,
      };
    });
}

// The proximity threshold from Story 3.5's scope decisions: a drop point
// snaps to a Frame slot only if it falls within that slot's own half-width/
// half-height of its center — i.e. closer to that slot than to any
// neighbor. Returns `null` if the drop isn't close enough to any slot, or
// falls outside the grid entirely.
function nearestFrameSlot(
  point: Point,
  frameWidth: number,
  frameHeight: number,
  tileWidth: number,
  tileHeight: number,
  gridRows: number,
  gridCols: number,
): { row: number; col: number } | null {
  const col = Math.round((point.x + frameWidth / 2 - tileWidth / 2) / tileWidth);
  const row = Math.round((point.y + frameHeight / 2 - tileHeight / 2) / tileHeight);
  if (row < 0 || row >= gridRows || col < 0 || col >= gridCols) {
    return null;
  }
  const slotCenterX = -frameWidth / 2 + col * tileWidth + tileWidth / 2;
  const slotCenterY = -frameHeight / 2 + row * tileHeight + tileHeight / 2;
  const withinThreshold =
    Math.abs(point.x - slotCenterX) <= tileWidth / 2 &&
    Math.abs(point.y - slotCenterY) <= tileHeight / 2;
  return withinThreshold ? { row, col } : null;
}

type PieceCollection = ReturnType<typeof createRoomCollections>["pieceCollection"];

// Pure rendering — position, drag wiring, and what "placed"/"fused" means
// are entirely the caller's concern (`SoloPieceSprite` for an unclustered
// piece, `ClusterGroupSprite` for a fused group). Kept separate because the
// two callers need materially different drag semantics (Story 3.9: a
// Cluster drags as one rigid `<Group>`, not piece-by-piece).
function PieceSprite({
  piece,
  x,
  y,
  tileWidth,
  tileHeight,
  roomId,
  gridRows,
  gridCols,
  draggable,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  piece: RoomDetailPiece;
  x: number;
  y: number;
  tileWidth: number;
  tileHeight: number;
  roomId: string;
  gridRows: number;
  gridCols: number;
  draggable: boolean;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onClick?: () => void;
}) {
  const imageState = usePieceImage(piece.imageUrl);

  // Story 3.12: a purely cosmetic tab/blank cut silhouette masked over the
  // still-plain-rectangular tile image — never consulted by FR6's
  // placement/fusion validation. Memoized on the piece's fixed grid
  // position (never changes) rather than recomputed every render; the
  // `clipFunc` itself still runs once per draw (Konva's own requirement),
  // but the geometry math behind it doesn't.
  //
  // `clipFunc` only exists on Konva's `Container` (Group/Layer) — a `Shape`
  // (Image/Rect) silently ignores it (code review fix, 2026-09-03: it was
  // first attached directly to the Image/Rect below and had zero effect).
  // The piece is therefore now a `<Group>` carrying position/rotation/drag/
  // click and the clip; its child Image/Rect fills a plain, un-transformed
  // `0,0`-to-`tileWidth,tileHeight` box. Dragging/clicking on the child
  // still works exactly as before — it bubbles to the draggable Group,
  // the same pattern `ClusterGroupSprite` already relies on for its own
  // members.
  const clipFunc = useMemo(() => {
    const edgeShapes = computePieceEdgeShapes(roomId, piece.gridRow, piece.gridCol, gridRows, gridCols);
    const commands = buildPieceOutlinePath(edgeShapes, tileWidth, tileHeight);
    return (ctx: Konva.Context) => drawPieceOutlinePath(ctx, commands);
  }, [roomId, piece.gridRow, piece.gridCol, gridRows, gridCols, tileWidth, tileHeight]);

  const groupProps = {
    x,
    y,
    offsetX: tileWidth / 2,
    offsetY: tileHeight / 2,
    rotation: piece.rotation,
    draggable,
    onDragStart,
    onDragEnd,
    onClick,
    onTap: onClick,
    clipFunc,
  };

  if (imageState.status === "loaded") {
    // Story 3.12 bug fix: a tab's clip protrudes past the piece's own
    // `tileWidth × tileHeight` box, but `KonvaImage` never paints outside
    // whatever box it's given — clipping to a region the image doesn't
    // cover just reveals nothing (transparent), no matter how correct the
    // clip path is. `sliceImageIntoTiles` (Story 3.12) now bakes real
    // neighboring-pixel overhang into each *newly created* Room's tile
    // image; an already-existing Room's tile is still exactly
    // `tileWidth × tileHeight` pixels, with no overhang at all. Rather than
    // assume one or the other (and risk stretching an old, unpadded image
    // into a box sized for a padded one), this reads the actually-loaded
    // image's own `naturalWidth`/`naturalHeight` — self-describing, so an
    // old Room's tiles render exactly as before (zero overhang computed),
    // while a new Room's tiles reveal genuine content under a tab.
    const overhangX = (imageState.image.naturalWidth - tileWidth) / 2;
    const overhangY = (imageState.image.naturalHeight - tileHeight) / 2;
    return (
      <Group {...groupProps}>
        <KonvaImage
          image={imageState.image}
          x={-overhangX}
          y={-overhangY}
          width={imageState.image.naturalWidth}
          height={imageState.image.naturalHeight}
        />
      </Group>
    );
  }

  // No real image to introspect yet (loading) or ever (error) — sized from
  // the same overhang formula `sliceImageIntoTiles` uses, so a tab bump
  // still shows the placeholder's flat color instead of a transparent gap
  // while waiting (AC #6). Only ever an estimate (a still-loading tile
  // might turn out to have zero real overhang, if it belongs to an old
  // Room) — harmless for a solid placeholder color, unlike the loaded-image
  // case above.
  const placeholderOverhangX = tileWidth * TILE_OVERHANG_FACTOR;
  const placeholderOverhangY = tileHeight * TILE_OVERHANG_FACTOR;
  const placeholderProps = {
    x: -placeholderOverhangX,
    y: -placeholderOverhangY,
    width: tileWidth + 2 * placeholderOverhangX,
    height: tileHeight + 2 * placeholderOverhangY,
  };

  if (imageState.status === "loading") {
    // Distinct from "error" below — a solid, undashed placeholder while the
    // tile is still fetching, so a slow load doesn't look identical to a
    // permanently broken one.
    return (
      <Group {...groupProps}>
        <Rect fill="#eee6da" {...placeholderProps} />
      </Group>
    );
  }

  // A single broken/missing tile shows a dashed outline instead of crashing
  // the whole Canvas for everyone in the Room.
  return (
    <Group {...groupProps}>
      <Rect stroke="#c4b8a8" dash={[6, 4]} {...placeholderProps} />
    </Group>
  );
}

// Story 3.13: a purely local, never-persisted "predicted fusion" — two
// (currently only ever exactly two, see `SoloPieceSprite`'s own fusion
// branch) pieces a client-side prediction already believes just fused,
// rendered and draggable as one Îlot immediately, before the server's
// confirmed `cluster_id` arrives. Deliberately never written to the
// `clusters` TanStack DB collection (read-only from the client by design —
// see `collections.ts`'s own comment) — kept entirely in `RoomCanvas`'s own
// state instead, mirroring `pendingRestOverride`/`optimisticAnchor`'s own
// "local-only override" idiom. Module-level (not declared inside
// `RoomCanvas`) so `SoloPieceSprite` — a separate component, receiving this
// only through a callback prop — can reference the same type.
type PredictedFusion = {
  tempClusterId: string;
  memberIds: readonly [string, string];
  anchorX: number;
  anchorY: number;
  offsetsByPieceId: ReadonlyMap<string, { row: number; col: number }>;
};

// An unclustered piece — placed (locked into the Frame, never draggable
// again) or free-floating (scatter position, fully draggable).
function SoloPieceSprite({
  piece,
  pieces,
  clustersById,
  tileWidth,
  tileHeight,
  frameWidth,
  frameHeight,
  roomId,
  gridRows,
  gridCols,
  collection,
  onDragStart,
  onDragEnd,
  onInstantFrameLockOutcome,
  onGenuineFusion,
}: {
  piece: RoomDetailPiece;
  pieces: readonly RoomDetailPiece[];
  clustersById: ReadonlyMap<string, RoomDetailCluster>;
  tileWidth: number;
  tileHeight: number;
  frameWidth: number;
  frameHeight: number;
  roomId: string;
  gridRows: number;
  gridCols: number;
  collection: PieceCollection;
  onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onInstantFrameLockOutcome: (pieceId: string, color: string, position: Point) => void;
  onGenuineFusion: (prediction: PredictedFusion) => void;
}) {
  const [muted] = useSoundMuted();
  const { x: confirmedX, y: confirmedY } = pieceRenderPosition(
    piece,
    clustersById,
    frameWidth,
    frameHeight,
    tileWidth,
    tileHeight,
  );

  // Story 3.11 code review fix: the Server Action to call must never depend
  // on the client's own prediction (AC #3/AD-2 — the server decides, the
  // client only knows ahead of time). `handleDragEnd` below always sets
  // `placedRow`/`placedCol` when dropped near a slot, exactly as before this
  // story, so `placePiece` always gets a real chance to lock it in
  // regardless of what `predictFrameLock` guessed. This local override is
  // what keeps a *predicted-invalid* drop visually resting at the drop
  // point in the meantime, instead of prematurely snapping to the slot's
  // center the way the optimistic `placedRow` value alone would — cleared
  // once `piece.version` confirms past the value captured at drop time
  // (same pattern as `ClusterGroupSprite`'s `optimisticAnchor`).
  const [pendingRestOverride, setPendingRestOverride] = useState<
    { x: number; y: number; sinceVersion: number } | null
  >(null);
  // `piece.placedRow == null` also clears the override immediately — code
  // review fix (2026-09-02): a hard Server Action failure (e.g. a thrown
  // `STALE_WRITE`) rolls the *entire* optimistic mutation back, including
  // `placedRow` itself, without ever bumping `version` — so the version-only
  // condition alone would leave this override stuck forever in that case,
  // with nothing left to ever satisfy it.
  const overridden =
    pendingRestOverride != null &&
    piece.placedRow != null &&
    piece.version <= pendingRestOverride.sinceVersion;
  const x = overridden ? pendingRestOverride.x : confirmedX;
  const y = overridden ? pendingRestOverride.y : confirmedY;

  // Code review fix (2026-09-05, user report: "reglisser et pivoter [freeze]
  // mais uniquement dans le cadre" — a piece froze, undraggable/unrotatable,
  // for a few instants after any Frame-slot drop attempt, not just a
  // successful one). `placedRow`/`placedCol` are set optimistically on
  // *every* Frame-slot-proximity drop (above), including ones
  // `predictFrameLock` already expects to be rejected — `isPlaced` used to
  // read `piece.placedRow != null` directly, so it went `true` the instant
  // any such drop landed, disabling drag/click via the guards below for the
  // whole server round-trip, even though `overridden` (the *visual* signal
  // for this exact "predicted-invalid, resting here for now" window)
  // already correctly knew better. A piece we're actively resting-in-place
  // pending a predicted rejection must stay interactive the entire time —
  // matching its own visual treatment — not just once the rejection
  // actually arrives.
  const isPlaced = piece.placedRow != null && !overridden;

  // Pieces stay Konva-`draggable` even once placed — that's what makes
  // Konva's own internal "hasDraggingChild" check (Node.js's `_listenDrag`)
  // see this piece as a drag candidate at pointer-down and skip starting
  // the Stage's own pan-drag for the same gesture. Gating at the
  // `draggable` attribute instead (placed pieces non-draggable) was the
  // bug: a non-draggable piece never registers with Konva's drag tracking,
  // so the pointer-down event bubbles straight to the Stage, which then
  // has nothing telling it a child is "being dragged" and starts panning
  // itself — reported as "the whole canvas moves when I move a piece."
  // Placed pieces instead self-cancel here, before any parent state change,
  // snapping back to their exact pre-drag position.
  function handleDragStart(e: Konva.KonvaEventObject<DragEvent>) {
    if (isPlaced) {
      e.target.stopDrag();
      e.target.position({ x, y });
      return;
    }
    // Warms up the shared `AudioContext` for the whole drag's duration
    // instead of only at drop, when the drop sound is first needed — see
    // `warmUpAudioContext`'s own comment for why this fixes a perceptible
    // first-sound lag. Skipped when muted (code review fix, 2026-09-02) —
    // no sound will play at drop either way, so there's nothing to warm up
    // for, and a muted Participant's browser shouldn't spin up an
    // `AudioContext` on every single piece pickup for no audible benefit.
    if (!muted) {
      warmUpAudioContext();
    }
    onDragStart(e);
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    if (isPlaced) {
      return;
    }
    onDragEnd(e);
    const dropPoint = { x: e.target.x(), y: e.target.y() };
    // Generic "piece released" sound — every drop, anywhere on the Canvas,
    // in the Frame or not, regardless of whether it also attempts (or
    // achieves) a genuine match. The success/reject chime below layers on
    // top of this, only when a match was actually attempted.
    if (!muted) {
      playWoodClick();
    }
    const slot = nearestFrameSlot(
      dropPoint,
      frameWidth,
      frameHeight,
      tileWidth,
      tileHeight,
      gridRows,
      gridCols,
    );
    if (slot) {
      // Story 3.11: predict locally, using the exact same pure validation
      // logic `placePiece` runs server-side, whether this drop will
      // actually lock in — reliable in the overwhelming common case, since
      // it's not a guess but a faithful re-run of the server's own rules.
      // Only ever controls the *optimistic visual* (via `pendingRestOverride`
      // above) — never whether `placePiece` gets called. `placedRow`/
      // `placedCol` are always set below when dropped near a slot, exactly
      // as before this story, so the server always gets a real chance to
      // lock it in regardless of what was predicted (AC #3/AD-2 — a code
      // review finding caught an earlier version of this gating the Server
      // Action choice itself, which would have let a false-negative
      // prediction silently block a genuinely valid placement).
      const { outcome } = predictFrameLock({
        members: [{ pieceId: piece.id, offsetRow: 0, offsetCol: 0 }],
        anchorTargetRow: slot.row,
        anchorTargetCol: slot.col,
        gridRows,
        gridCols,
        tileWidth,
        tileHeight,
        frameWidth,
        frameHeight,
        knownPieces: pieces,
        otherFreePiecePositions: otherFreePiecePositions(
          pieces,
          new Set([piece.id]),
          clustersById,
          frameWidth,
          frameHeight,
          tileWidth,
          tileHeight,
        ),
      });
      const predictedLock = outcome === "locked";
      if (!predictedLock) {
        setPendingRestOverride({ x: dropPoint.x, y: dropPoint.y, sinceVersion: piece.version });
      }
      markPredictedLock(piece.id, predictedLock);
      // A colored pulse layers on the drop sound for every genuine
      // validation attempt (green: locked, red: rejected, orange: would
      // bury a loose piece) — never for `"not-an-attempt"` (AD-3's
      // physical-puzzle leniency: nothing was actually tested). Only the
      // "locked" case also gets the success chime; there is deliberately no
      // reject sound (removed 2026-09-02, user feedback). All of this fires
      // *instantly* here, not on server confirmation — `markInstantPlacement-
      // FeedbackShown` (only for `"locked"`, the only outcome with a
      // confirmed counterpart) tells `RoomCanvas`'s confirmed-event handler
      // this piece was already covered locally, so every *other* Participant
      // present (AC #5) still gets it from that confirmed path, without this
      // client double-firing its own.
      if (outcome === "locked") {
        markInstantPlacementFeedbackShown(piece.id);
        if (!muted) {
          // Staggered behind the drop sound just above — see
          // `SUCCESS_CHIME_STAGGER_SECONDS`'s own comment for why an
          // unstaggered pair reads as one blurred sound, not two.
          playSuccessChime(SUCCESS_CHIME_STAGGER_SECONDS);
        }
        const slotCenter = {
          x: -frameWidth / 2 + slot.col * tileWidth + tileWidth / 2,
          y: -frameHeight / 2 + slot.row * tileHeight + tileHeight / 2,
        };
        onInstantFrameLockOutcome(piece.id, PLACEMENT_PULSE_LOCKED_COLOR, slotCenter);
      } else if (outcome === "rejected") {
        onInstantFrameLockOutcome(piece.id, PLACEMENT_PULSE_REJECTED_COLOR, dropPoint);
      } else if (outcome === "overlap") {
        onInstantFrameLockOutcome(piece.id, PLACEMENT_PULSE_OVERLAP_COLOR, dropPoint);
      }
      collection.update(piece.id, (draft) => {
        draft.placedRow = slot.row;
        draft.placedCol = slot.col;
        // The raw drop point rides along as the fallback resting position
        // if locking doesn't validate server-side — a failed placement
        // attempt rests the piece exactly where it was released, never
        // bounces it back (see `placePiece`'s Dev Notes).
        draft.scatterX = dropPoint.x;
        draft.scatterY = dropPoint.y;
      });
    } else {
      // Not near a Frame slot — still worth checking whether this drop
      // brought the piece into genuine (or false) contact with another
      // free piece/Cluster, for the success/reject chime only; the actual
      // fusion decision is still made exclusively server-side (`movePiece`
      // → `repositionOrFuse`), this is purely cosmetic prediction, same
      // spirit as `predictFrameLock`.
      const { outcome: fusionOutcome, candidates: fusionCandidates } = predictFusionOutcome({
        draggedMembers: [
          {
            pieceId: piece.id,
            gridRow: piece.gridRow,
            gridCol: piece.gridCol,
            rotation: piece.rotation,
            screenX: dropPoint.x,
            screenY: dropPoint.y,
          },
        ],
        stationaryMembers: otherFreePieceScreenPositions(
          pieces,
          new Set([piece.id]),
          clustersById,
          frameWidth,
          frameHeight,
          tileWidth,
          tileHeight,
        ),
        tileWidth,
        tileHeight,
        knownPieces: pieces,
      });
      if (fusionOutcome === "genuine") {
        if (!muted) {
          playSuccessChime(SUCCESS_CHIME_STAGGER_SECONDS);
        }
        // User feedback (2026-09-04): "la fusion visuelle pourrait au moins
        // être optimiste" — a predicted-genuine fusion already visually
        // rests exactly at the touching drop point (correct either way),
        // but nothing signaled "this connected" the way a Frame lock's
        // green pulse does, until the server's confirmed `cluster_id`
        // eventually re-renders the pair as a `ClusterGroupSprite` —
        // noticeably later than the sound. This reuses that exact same
        // pulse mechanism, purely cosmetic acknowledgment.
        onInstantFrameLockOutcome(piece.id, PLACEMENT_PULSE_LOCKED_COLOR, dropPoint);

        // Story 3.13: the actual optimistic *grouping* (drag the pair as
        // one Îlot immediately) — deliberately scoped to the simplest,
        // most common case: this piece fusing with exactly one other
        // *solo* piece. A dragged Cluster, or a stationary piece already
        // part of a Cluster, needs re-basing every existing member's own
        // offset (`repositionOrFuse`'s own multi-member merge math) —
        // deliberately out of scope here (this story's own Task 4
        // allowance); those cases still get the pulse/chime above, just
        // not the grouped-drag behavior yet.
        const matchedStationaryId = fusionCandidates[0]?.b.pieceId;
        const matchedStationaryPiece =
          fusionCandidates.length === 1 && matchedStationaryId
            ? pieces.find((p) => p.id === matchedStationaryId)
            : undefined;
        if (matchedStationaryPiece && matchedStationaryPiece.clusterId == null) {
          const minGridRow = Math.min(piece.gridRow, matchedStationaryPiece.gridRow);
          const minGridCol = Math.min(piece.gridCol, matchedStationaryPiece.gridCol);
          const tempClusterId = crypto.randomUUID();
          onGenuineFusion({
            tempClusterId,
            memberIds: [piece.id, matchedStationaryPiece.id],
            // Mirrors `repositionOrFuse`'s own `mergedAnchorX/Y` formula
            // exactly (`x - (draggedMember.gridCol - minGridCol) *
            // tileWidth`, and the row equivalent) — `piece` is the
            // dragged member here, at `dropPoint`.
            anchorX: dropPoint.x - (piece.gridCol - minGridCol) * tileWidth,
            anchorY: dropPoint.y - (piece.gridRow - minGridRow) * tileHeight,
            offsetsByPieceId: new Map([
              [piece.id, { row: piece.gridRow - minGridRow, col: piece.gridCol - minGridCol }],
              [
                matchedStationaryPiece.id,
                {
                  row: matchedStationaryPiece.gridRow - minGridRow,
                  col: matchedStationaryPiece.gridCol - minGridCol,
                },
              ],
            ]),
          });
          markPredictedFusion(piece.id, tempClusterId);
        }
      }
      collection.update(piece.id, (draft) => {
        draft.scatterX = dropPoint.x;
        draft.scatterY = dropPoint.y;
      });
    }
  }

  function handleClick() {
    if (isPlaced) {
      return;
    }
    // Reads `draft.rotation`, not the closure `piece.rotation` — `draft` is
    // TanStack DB's live optimistic snapshot, fetched fresh on every
    // `.update()` call, so it already reflects a still-in-flight prior
    // rotation from an earlier click this same tick. Using the closure
    // value here would make two rapid clicks both compute the same target
    // angle instead of accumulating (code review fix, 2026-09-03 — see
    // `rotatePiece`'s own comment for the matching server-side half of this
    // fix).
    collection.update(piece.id, (draft) => {
      draft.rotation = (draft.rotation + 90) % 360;
    });
  }

  return (
    <PieceSprite
      piece={piece}
      x={x}
      y={y}
      tileWidth={tileWidth}
      tileHeight={tileHeight}
      roomId={roomId}
      gridRows={gridRows}
      gridCols={gridCols}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
    />
  );
}

// A fused Cluster (Story 3.8/3.9) — every member renders at its own fixed
// offset inside one draggable `<Group>`, so dragging any member moves the
// whole group as a single rigid unit via Konva's own grouping, no custom
// per-frame position-sync code needed. The Group itself carries the drag —
// individual `PieceSprite`s inside are never draggable — which is exactly
// what makes Konva's Stage-vs-child drag-conflict safeguard work here too
// (see `SoloPieceSprite`'s comment): the Group registers as the drag
// candidate at pointer-down, so the Stage correctly never starts its own
// pan for the same gesture.
function ClusterGroupSprite({
  cluster,
  members,
  pieces,
  clustersById,
  tileWidth,
  tileHeight,
  frameWidth,
  frameHeight,
  roomId,
  gridRows,
  gridCols,
  collection,
  onDragStart,
  onDragEnd,
  onInstantFrameLockOutcome,
}: {
  cluster: RoomDetailCluster;
  members: RoomDetailPiece[];
  pieces: readonly RoomDetailPiece[];
  clustersById: ReadonlyMap<string, RoomDetailCluster>;
  tileWidth: number;
  tileHeight: number;
  frameWidth: number;
  frameHeight: number;
  roomId: string;
  gridRows: number;
  gridCols: number;
  collection: PieceCollection;
  onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onInstantFrameLockOutcome: (pieceId: string, color: string, position: Point) => void;
}) {
  // Any member works as the one reported to the Server Action — its own
  // math recovers the Cluster's anchor from whichever member's own screen
  // position it's given, regardless of that member's offset. Bug fixed
  // here (2026-08-30): this used to assume a member at local offset (0,0)
  // always exists and treated the Group's own raw position as that
  // member's position directly — true only for a rectangular Cluster whose
  // min-row and min-col piece happen to be the same piece. For a larger,
  // irregularly-shaped Cluster (an L-shape, a cross, anything not a solid
  // rectangle from its own origin) they're often different pieces, so no
  // member has offset (0,0) at all; falling back to `members[0]` picked an
  // arbitrary nonzero offset, and the server's `x - offsetCol*tileWidth`
  // math then double-subtracted it — every move visibly shifted the whole
  // Cluster up-left by that arbitrary member's offset (reported: "les
  // îlots... se redécalent systématiquement vers le haut et la gauche, à
  // des distances différentes").
  //
  // The representative itself must be a *stable* choice, not `members[0]`
  // — `members`' order follows the live `pieces` array's iteration order,
  // which isn't guaranteed to stay put across an unrelated Realtime-
  // triggered re-render while a drag is already in flight. If the
  // representative changed between drag-start and drag-end, the anchor-
  // recovery math above would use a mismatched offset, reproducing the
  // exact bug this comment describes for a different root cause. The
  // lexicographically lowest piece id is deterministic regardless of array
  // order.
  const representativeMember = members.reduce((min, m) => (m.id < min.id ? m : min), members[0]);
  const [muted] = useSoundMuted();

  // Bridges the gap between "drag-end fires an optimistic mutation" and
  // "the Realtime-confirmed `cluster` row actually arrives": `<Group>`'s
  // position is otherwise driven purely by `cluster.anchorX/Y`, which the
  // optimistic mutation never touches (only the representative piece's own
  // row changes) — so without this, the whole Cluster visibly snapped back
  // to its pre-drag position right after release, only correcting once
  // Realtime confirmed. Cleared implicitly once `cluster.version` moves
  // past the value captured at drop time — a newer confirmed version means
  // the real anchor has caught up, so the guess is no longer needed
  // (computed at render time, not via an effect — no cleanup required).
  const [optimisticAnchor, setOptimisticAnchor] = useState<
    { x: number; y: number; sinceVersion: number } | null
  >(null);
  // A rejected write (`STALE_WRITE`) never bumps `cluster.version` at all —
  // nothing commits server-side — so the version-only guard alone would
  // leave a losing client's Cluster stuck at its stale optimistic position
  // forever instead of reverting (Story 3.10, 2026-09-04). First fix
  // compared the representative member's live `scatterX`/`scatterY` against
  // the value the *latest* drag expected — but dragging the same Cluster
  // repeatedly made it visibly "replay" through every intermediate position
  // (user report, 2026-09-05): an *earlier*, already-superseded drag's own
  // confirmed row arriving via Realtime has different scatter values too,
  // and briefly failed that comparison just like a genuine rejection would,
  // for every earlier drag's confirmation in turn. Replaced with an
  // explicit signal (`move-conflict-events.ts`) fired only when this
  // piece's `movePiece` call actually fails — see its own comment for the
  // full reasoning.
  //
  // That fix still left one gap, found the same day on a second report: the
  // *version* comparison itself has the exact same class of bug, just one
  // level up. `sinceVersion` used to be read straight from `cluster.version`
  // at drag-end — which stays stale (unconfirmed) across several rapid
  // drags fired before the first one's own confirmation lands, so every one
  // of them captures the *same* stale `sinceVersion`. The first of several
  // confirmations to arrive (for the *earliest*, already-superseded drag)
  // then satisfies `cluster.version > sinceVersion` prematurely, falling
  // back to that earlier drag's own confirmed anchor — replaying through
  // every intermediate position again as each subsequent confirmation
  // arrives, before finally settling on the last one. `speculativeVersionRef`
  // advances the floor the instant each drag is *dispatched* (mirroring
  // `collections.ts`'s own `ownLastKnownVersionByPieceId` for the same
  // reason), so `sinceVersion` always reflects what *this specific* drag's
  // own write will produce, not whatever the client happened to have seen
  // last.
  const speculativeVersionRef = useRef<number | null>(null);
  useEffect(() => {
    return subscribeMoveConflict((pieceId) => {
      if (pieceId === representativeMember.id) {
        setOptimisticAnchor(null);
        // This client's speculative chain just proved wrong for at least
        // one link — forget it rather than risk a permanently-inflated
        // floor that could never be satisfied by the real confirmed
        // version again. The next drag simply re-floors from the live
        // `cluster.version` instead.
        speculativeVersionRef.current = null;
      }
    });
  }, [representativeMember.id]);
  const anchor =
    optimisticAnchor && cluster.version < optimisticAnchor.sinceVersion
      ? optimisticAnchor
      : { x: cluster.anchorX, y: cluster.anchorY };

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    onDragEnd(e);
    const groupAnchor = { x: e.target.x(), y: e.target.y() };
    // The representative member's own actual screen position — not the
    // Group's raw anchor — since that's what the Server Action expects
    // ("this specific piece's new position") and what correctly recovers
    // the true anchor on the server regardless of this member's offset.
    const dropPoint = {
      x: groupAnchor.x + representativeMember.clusterOffsetCol! * tileWidth,
      y: groupAnchor.y + representativeMember.clusterOffsetRow! * tileHeight,
    };
    // Floors at whichever is more recent: the live confirmed version, or
    // this client's own still-unconfirmed speculative chain from an
    // earlier rapid drag — see `speculativeVersionRef`'s own comment.
    // `sinceVersion` holds the *result* version this specific drag expects
    // once confirmed (not the pre-write version), matching `anchor`'s own
    // `<` comparison above.
    const baseVersion = Math.max(cluster.version, speculativeVersionRef.current ?? 0);
    const expectedResultVersion = baseVersion + 1;
    speculativeVersionRef.current = expectedResultVersion;
    setOptimisticAnchor({ ...groupAnchor, sinceVersion: expectedResultVersion });
    // Generic "piece released" sound — every drop, anywhere on the Canvas,
    // exactly as for a solo piece (`SoloPieceSprite`'s handleDragEnd).
    if (!muted) {
      playWoodClick();
    }
    const slot = nearestFrameSlot(
      dropPoint,
      frameWidth,
      frameHeight,
      tileWidth,
      tileHeight,
      gridRows,
      gridCols,
    );
    if (slot) {
      // Unlike a solo piece, a Cluster never needs client-side prediction
      // to avoid a premature visual snap: this Group only ever renders via
      // `cluster.anchorX/Y`/`optimisticAnchor` (never via `placedRow`), and
      // a piece stays classified as a Cluster member (see `RoomCanvas`'s
      // `membersByClusterId` split) until the real Realtime-confirmed row
      // arrives with `clusterId: null` — so setting `placedRow` optimistically
      // here causes no premature slot-snap to correct for. `placedRow`/
      // `placedCol` are therefore always set below, letting `placePiece`
      // always get a real chance to lock the whole Cluster in (AC #3/AD-2 —
      // this must never depend on a client-side guess). The prediction is
      // still computed, though — code review fix (2026-09-02): without it,
      // every ordinary rejected Cluster lock (as common as a rejected solo
      // placement) fired the Story 3.11 "beaten to it" conflict toast, since
      // that toast's gate has no other way to tell "the client expected this
      // to work" from "no one expected this to work."
      const memberIds = new Set(members.map((m) => m.id));
      const { outcome } = predictFrameLock({
        members: members.map((m) => ({
          pieceId: m.id,
          offsetRow: m.clusterOffsetRow! - representativeMember.clusterOffsetRow!,
          offsetCol: m.clusterOffsetCol! - representativeMember.clusterOffsetCol!,
        })),
        anchorTargetRow: slot.row,
        anchorTargetCol: slot.col,
        gridRows,
        gridCols,
        tileWidth,
        tileHeight,
        frameWidth,
        frameHeight,
        knownPieces: pieces,
        otherFreePiecePositions: otherFreePiecePositions(
          pieces,
          memberIds,
          clustersById,
          frameWidth,
          frameHeight,
          tileWidth,
          tileHeight,
        ),
      });
      const predictedLock = outcome === "locked";
      markPredictedLock(representativeMember.id, predictedLock);
      // Only a genuine validation attempt gets a success chime, and only on
      // success — see `SoloPieceSprite`'s handleDragEnd. No colored pulse
      // here (yet) — a Cluster lock-in's own optimistic-feedback gap is a
      // pre-existing, already-tracked limitation (`deferred-work.md`), not
      // something this change expands the scope of.
      if (predictedLock) {
        // Code review fix (2026-09-02): without this, the representative
        // member's own confirmed `subscribePiecePlaced` event (which every
        // member of a locked Cluster eventually gets, one at a time) never
        // knew this client had already played the chime instantly — it
        // played a *second* time for the exact piece this whole instant
        // path was already covering, reopening the double-sound bug this
        // registry exists to prevent. Every *other* member's own confirmed
        // event still fires its own chime, unaffected — that per-member
        // cascade for a multi-piece lock-in is this story's own long-
        // standing, deliberate design (Task 3: "fires once per newly-placed
        // piece, not once per Cluster"), not something this fix changes.
        markInstantPlacementFeedbackShown(representativeMember.id);
        if (!muted) {
          playSuccessChime(SUCCESS_CHIME_STAGGER_SECONDS);
        }
      }
      collection.update(representativeMember.id, (draft) => {
        draft.placedRow = slot.row;
        draft.placedCol = slot.col;
        // Fallback resting position if locking doesn't validate
        // server-side — see `SoloPieceSprite`'s handleDragEnd and
        // `placePiece`'s Dev Notes.
        draft.scatterX = dropPoint.x;
        draft.scatterY = dropPoint.y;
      });
    } else {
      // Not near a Frame slot — same cosmetic-only fusion-outcome check as
      // `SoloPieceSprite`, applied to every member of the Cluster at once.
      const memberIds = new Set(members.map((m) => m.id));
      // Story 3.13: only the pulse/chime acknowledgment below is
      // instant here — the optimistic *grouping* behavior is deliberately
      // scoped to a solo piece fusing with exactly one other solo piece
      // (see `SoloPieceSprite`'s own fusion branch); dragging an *existing*
      // Cluster into a new fusion would need re-basing every current
      // member's own offset through the same multi-member merge math
      // `repositionOrFuse` does server-side, which is out of scope for this
      // story (its own Task 4 explicitly allows deferring the compounding
      // case). The confirmed fusion still arrives normally via Realtime,
      // just without the immediate grouped-drag feedback in this specific
      // case.
      const { outcome: fusionOutcome } = predictFusionOutcome({
        draggedMembers: members.map((m) => ({
          pieceId: m.id,
          gridRow: m.gridRow,
          gridCol: m.gridCol,
          rotation: m.rotation,
          screenX: dropPoint.x + (m.clusterOffsetCol! - representativeMember.clusterOffsetCol!) * tileWidth,
          screenY: dropPoint.y + (m.clusterOffsetRow! - representativeMember.clusterOffsetRow!) * tileHeight,
        })),
        stationaryMembers: otherFreePieceScreenPositions(
          pieces,
          memberIds,
          clustersById,
          frameWidth,
          frameHeight,
          tileWidth,
          tileHeight,
        ),
        tileWidth,
        tileHeight,
        knownPieces: pieces,
      });
      if (fusionOutcome === "genuine") {
        if (!muted) {
          playSuccessChime(SUCCESS_CHIME_STAGGER_SECONDS);
        }
        // Same instant, purely cosmetic acknowledgment as
        // `SoloPieceSprite`'s own fusion branch — see its comment for why.
        onInstantFrameLockOutcome(representativeMember.id, PLACEMENT_PULSE_LOCKED_COLOR, dropPoint);
      }
      collection.update(representativeMember.id, (draft) => {
        draft.scatterX = dropPoint.x;
        draft.scatterY = dropPoint.y;
      });
    }
  }

  function handleDragStart(e: Konva.KonvaEventObject<DragEvent>) {
    // Same reasoning as `SoloPieceSprite`'s handleDragStart — warms up the
    // shared `AudioContext` for the whole drag's duration, not just at drop.
    // Skipped when muted (code review fix, 2026-09-02) — nothing to warm up
    // for if no sound will play at drop either way.
    if (!muted) {
      warmUpAudioContext();
    }
    onDragStart(e);
  }

  return (
    <Group
      x={anchor.x}
      y={anchor.y}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {members.map((piece) => (
        <PieceSprite
          key={piece.id}
          piece={piece}
          x={piece.clusterOffsetCol! * tileWidth}
          y={piece.clusterOffsetRow! * tileHeight}
          tileWidth={tileWidth}
          tileHeight={tileHeight}
          roomId={roomId}
          gridRows={gridRows}
          gridCols={gridCols}
          draggable={false}
        />
      ))}
    </Group>
  );
}

// A brief scale+fade pulse over a newly-placed piece (Story 3.6, AC #1/#4).
// Rendered only when `prefers-reduced-motion` doesn't apply — the reduced-
// motion fallback is simply not rendering this at all, since the piece
// having snapped into its Frame slot is already the full "state change" AC
// #4 asks for with no animated transition layered on top. Plays once on
// mount via a Konva.Tween (Canvas draws pixels, not DOM, so CSS transitions
// don't apply here) and never needs to be told when it's done — the parent
// unmounts it via a timeout matched to `PLACEMENT_PULSE_DURATION_SECONDS`.
function PlacementPulse({
  x,
  y,
  tileWidth,
  tileHeight,
  color,
}: {
  x: number;
  y: number;
  tileWidth: number;
  tileHeight: number;
  color: string;
}) {
  const rectRef = useRef<Konva.Rect>(null);

  useEffect(() => {
    const node = rectRef.current;
    if (!node) {
      return;
    }
    node.opacity(0.55);
    node.scale({ x: 0.85, y: 0.85 });
    const tween = new Konva.Tween({
      node,
      opacity: 0,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: PLACEMENT_PULSE_DURATION_SECONDS,
      easing: Konva.Easings.EaseOut,
    });
    tween.play();
    return () => tween.destroy();
  }, []);

  return (
    <Rect
      ref={rectRef}
      x={x}
      y={y}
      offsetX={tileWidth / 2}
      offsetY={tileHeight / 2}
      width={tileWidth}
      height={tileHeight}
      fill={color}
      listening={false}
    />
  );
}

// A full-Frame gold glow/pulse for Story 3.7's Frame-completion celebration
// — same `Konva.Tween` scale+fade idiom as `PlacementPulse`, but covering
// the whole Frame rectangle (not one tile), a different color, and a much
// longer duration, so it reads as a distinctly bigger moment (AC #1).
// Rendered only when `prefers-reduced-motion` doesn't apply (checked by the
// caller at trigger time, same convention as `PlacementPulse`) — the
// `aria-live` announcement is the fallback "state change" in that case.
function FrameCompletionGlow({
  frameWidth,
  frameHeight,
}: {
  frameWidth: number;
  frameHeight: number;
}) {
  const rectRef = useRef<Konva.Rect>(null);

  useEffect(() => {
    const node = rectRef.current;
    if (!node) {
      return;
    }
    node.opacity(0.5);
    node.scale({ x: 0.96, y: 0.96 });
    const tween = new Konva.Tween({
      node,
      opacity: 0,
      scaleX: 1.06,
      scaleY: 1.06,
      duration: FRAME_COMPLETION_GLOW_DURATION_SECONDS,
      easing: Konva.Easings.EaseOut,
    });
    tween.play();
    return () => tween.destroy();
  }, []);

  return (
    <Rect
      ref={rectRef}
      x={0}
      y={0}
      offsetX={frameWidth / 2}
      offsetY={frameHeight / 2}
      width={frameWidth}
      height={frameHeight}
      fill={FRAME_COMPLETION_GLOW_COLOR}
      listening={false}
    />
  );
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpointBetween(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export type RoomCanvasHandle = { recenter: () => void };

export type RoomCanvasProps = {
  room: RoomDetail;
  onReady?: () => void;
  ref?: Ref<RoomCanvasHandle>;
};

// React 19 accepts `ref` as an ordinary prop on function components — no
// `forwardRef` needed (that API is legacy now that this project is on 19.2).
export function RoomCanvas({ room, onReady, ref }: RoomCanvasProps) {
  // Fires once, on mount — past the dynamic import's own "Loading canvas…"
  // placeholder. AC #1 of Story 3.2 gates the first-access tutorial on
  // this, not on every individual piece tile finishing its own load (Story
  // 3.1 deliberately treats those as progressive/best-effort, not a
  // blocking "canvas readiness" signal). `firedRef` guards against calling
  // `onReady` more than once if its identity changes across re-renders
  // (e.g. an inline arrow function from the parent) without needing to
  // read/write a ref during render (only inside the effect itself).
  const firedRef = useRef(false);
  useEffect(() => {
    if (!firedRef.current) {
      firedRef.current = true;
      onReady?.();
    }
  }, [onReady]);

  // One pair of collections per Room, seeded from the Server Component's
  // static snapshot (Story 3.1) and kept live via Supabase Realtime from
  // then on (Story 3.5, Architecture AD-1 amended 2026-08-28; Story 3.8
  // adds the `clusters` collection on the same channel). `initialPieces`/
  // `initialClusters` are only ever read once at creation — `room.id` is
  // the only real dependency.
  const { pieceCollection, clusterCollection } = useMemo(
    () =>
      createRoomCollections({
        roomId: room.id,
        initialPieces: room.pieces,
        initialClusters: room.clusters,
        totalPieceCount: room.gridRows * room.gridCols,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.id],
  );
  const collection = pieceCollection;
  const { data: livePieces } = useLiveQuery(
    (q) => q.from({ pieces: pieceCollection }),
    [pieceCollection],
  );
  const { data: liveClusters } = useLiveQuery(
    (q) => q.from({ clusters: clusterCollection }),
    [clusterCollection],
  );
  const pieces = livePieces ?? room.pieces;
  const clusters = liveClusters ?? room.clusters;
  const clustersById = useMemo(
    () => new Map(clusters.map((c) => [c.id, c])),
    [clusters],
  );

  const { halfExtentX, halfExtentY, frameWidth, frameHeight } = useMemo(() => {
    const frameWidth = room.gridCols * room.tileWidth;
    const frameHeight = room.gridRows * room.tileHeight;
    // Content extent is derived from the Frame size and every piece's real
    // *current* position (not just its initial scatter, and — Story 3.8 —
    // not raw `scatterX`/`scatterY` either, stale once a piece is fused
    // into a Cluster; `pieceRenderPosition` is the one source of truth for
    // "where is this piece right now") — a piece/Cluster dragged far from
    // its starting point must still expand the pannable area, or it could
    // become permanently unreachable (AC #2 of Story 3.3 / NFR-1).
    const positions = pieces.map((p) =>
      pieceRenderPosition(p, clustersById, frameWidth, frameHeight, room.tileWidth, room.tileHeight),
    );
    return {
      frameWidth,
      frameHeight,
      halfExtentX: Math.max(
        frameWidth / 2,
        ...positions.map((pos) => Math.abs(pos.x) + room.tileWidth / 2),
      ),
      halfExtentY: Math.max(
        frameHeight / 2,
        ...positions.map((pos) => Math.abs(pos.y) + room.tileHeight / 2),
      ),
    };
  }, [room, pieces, clustersById]);

  // Placement feedback (Story 3.6): fires for every Participant present,
  // regardless of who caused it. Fixed by code review (2026-09-02): the
  // original version detected "newly placed" by diffing the live `pieces`
  // snapshot for a `placedRow` transition — but `placedRow` is set
  // *optimistically*, the instant a drop lands near a slot, whether or not
  // it will actually lock (the server may still reject it). That fired the
  // sound/pulse/haptic/announcement for ordinary invalid drops, not only
  // genuine successes, and — since only the acting Participant's own
  // optimistic collection ever shows that premature `placedRow` — did so
  // asymmetrically (remote Participants never saw the false feedback,
  // contradicting AC #5's "same event, every Participant" premise).
  // `subscribePiecePlaced` instead fires only from `collections.ts`'s
  // Realtime handler — which only ever runs for a server-*confirmed* row —
  // so this can only ever fire once genuine, for every Participant
  // identically, exactly matching AC #1's "successful piece placement."
  const t = useTranslations("Canvas");
  const [muted] = useSoundMuted();
  // `token` guards against a code review finding: two pulses on the same
  // piece within `PLACEMENT_PULSE_DURATION_SECONDS` of each other (e.g. a
  // rejected drop followed by another attempt on the same piece before the
  // first pulse finishes) — without it, the *first* pulse's own timeout
  // would unconditionally delete the map entry, erasing the *second*,
  // newer pulse's color/position before its own animation completes.
  const [justPlacedPulseById, setJustPlacedPulseById] = useState<
    ReadonlyMap<string, { color: string; x: number; y: number; token: symbol }>
  >(new Map());
  const [announcement, setAnnouncement] = useState("");
  const [showCompletionGlow, setShowCompletionGlow] = useState(false);
  // A trailing zero-width space, toggled on every announcement, makes two
  // back-to-back byte-identical messages (e.g. two consecutive solo
  // placements, both "Une pièce a été placée dans le Cadre.") differ at the
  // DOM text-content level — code review fix (2026-09-02): several screen
  // readers (NVDA, VoiceOver) don't re-announce an `aria-live` region whose
  // text content hasn't visibly changed, silently dropping the second
  // announcement otherwise (AC #6).
  const announcementToggleRef = useRef(false);
  function announce(message: string) {
    announcementToggleRef.current = !announcementToggleRef.current;
    setAnnouncement(announcementToggleRef.current ? `${message}​` : message);
  }

  // `prefers-reduced-motion` is checked at trigger time (AC #4), not
  // subscribed to reactively — the reduced-motion fallback is simply never
  // entering the "just placed" map at all, so no pulse ever renders and the
  // piece landing at its Frame slot is the only visible change. Adds/removes
  // this one id — never replaces the whole map — so a second pulse arriving
  // mid-animation can't truncate a still-in-flight `PlacementPulse` for a
  // different piece.
  function triggerPulse(pieceId: string, color: string, position: Point) {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      return;
    }
    const token = Symbol("pulse");
    setJustPlacedPulseById((prev) => {
      const next = new Map(prev);
      next.set(pieceId, { color, x: position.x, y: position.y, token });
      return next;
    });
    setTimeout(() => {
      setJustPlacedPulseById((prev) => {
        // Only clear if this timeout's own pulse is still the current one —
        // a newer pulse for the same piece (its own token) already
        // superseded it, and must not be erased early.
        if (prev.get(pieceId)?.token !== token) {
          return prev;
        }
        const next = new Map(prev);
        next.delete(pieceId);
        return next;
      });
    }, PLACEMENT_PULSE_DURATION_SECONDS * 1000);
  }

  useEffect(() => {
    return subscribePiecePlaced((pieceId) => {
      // The acting Participant's own sprite already played the success
      // chime and pulse instantly, from its own prediction (code review fix,
      // 2026-09-02: "the sound should play immediately on release") —
      // `consumeAndCheckInstantPlacementFeedbackShown` is how this handler
      // knows that already happened, and skips repeating it. Every *other*
      // Participant present never predicted anything for this piece, so for
      // them this confirmed event is the only signal they ever get — AC #5
      // ("fires for every Participant present... not only the one who
      // dropped it") depends on this fallback firing for everyone else.
      if (!consumeAndCheckInstantPlacementFeedbackShown(pieceId)) {
        if (!muted) {
          playSuccessChime();
        }
        // Only ever the "locked" (green) color here — this event exclusively
        // means a genuine confirmed lock (`piece-placement-events.ts`), never
        // a rejection or an overlap; those are local-only (see below), since
        // there's no server write, and so no Realtime event, for an attempt
        // that never happened. The piece's own confirmed row is the source
        // of truth for where to render the pulse (unlike the local instant
        // path, which must pass its own just-computed position — see
        // `SoloPieceSprite`'s handleDragEnd).
        const confirmedPiece = pieces.find((p) => p.id === pieceId);
        if (confirmedPiece) {
          triggerPulse(
            pieceId,
            PLACEMENT_PULSE_LOCKED_COLOR,
            pieceRenderPosition(
              confirmedPiece,
              clustersById,
              frameWidth,
              frameHeight,
              room.tileWidth,
              room.tileHeight,
            ),
          );
        }
      }
      triggerPlacementHaptic();
      // Always announces exactly one piece now — every confirmed placement,
      // solo or a Cluster member, arrives as its own separate event.
      announce(t("piecePlacedAnnouncement", { count: 1 }));
    });
  }, [muted, t, pieces, clustersById, frameWidth, frameHeight, room.tileWidth, room.tileHeight]);

  // Story 3.11 AC #4: the rare "client predicted a lock, the server's own
  // re-validation disagreed" case — a genuine concurrent conflict, surfaced
  // as a factual-but-warm toast (never a raw error code), echoed through
  // the same `aria-live` region Task 3.6 already established rather than a
  // second announcement mechanism.
  useEffect(() => {
    return subscribePlacementConflict(() => {
      const message = t("placementConflictMessage");
      toast(message);
      announce(message);
    });
  }, [t]);

  // Story 3.7: fires for every Participant present (AC #3), from the same
  // confirmed-only Realtime signal `subscribePiecePlaced` already relies
  // on — never derived from the optimistically-blended `pieces` snapshot
  // (see `frame-completion-events.ts`'s own comment for why that matters
  // more here than anywhere else this app fires client-side feedback from).
  //
  // `useLayoutEffect`, not `useEffect` — code review fix (2026-09-03): the
  // collections above are created by `useMemo`, which runs synchronously
  // during render and opens the Realtime channel immediately. A regular
  // `useEffect` doesn't run until after the browser has had a chance to
  // paint, leaving a real window where a Realtime message (delivered via
  // the WebSocket task queue, never synchronously) could complete the Frame
  // before this subscription exists — silently losing the one celebration
  // this whole Room only ever gets once. `useLayoutEffect` runs synchronously
  // in the same commit as the `useMemo` that opened the channel, with no
  // point where the event loop could hand control to an incoming message
  // in between.
  useLayoutEffect(() => {
    return subscribeFrameComplete(() => {
      if (!muted) {
        playVictorySound();
      }
      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reducedMotion) {
        setShowCompletionGlow(true);
        setTimeout(() => {
          setShowCompletionGlow(false);
        }, FRAME_COMPLETION_GLOW_DURATION_SECONDS * 1000);
      }
      announce(t("frameCompleteAnnouncement"));
    });
  }, [muted, t]);

  // Story 3.13: a purely local, never-persisted "predicted fusion" — two
  // (currently only ever exactly two — see its own comment below) pieces a
  // client-side prediction already believes just fused, rendered and
  // draggable as one Îlot immediately, before the server's confirmed
  // `cluster_id` arrives. Deliberately never written to the `clusters`
  // TanStack DB collection (read-only from the client by design — see
  // `collections.ts`'s own comment) — kept entirely in this component's
  // state instead, mirroring `pendingRestOverride`/`optimisticAnchor`'s
  // own "local-only override" idiom.
  const [predictedFusions, setPredictedFusions] = useState<readonly PredictedFusion[]>([]);

  // A prediction is "confirmed" once every member's *real* `clusterId`
  // agrees and actually resolves to a loaded Cluster row — Realtime has
  // caught up, so the synthetic grouping this prediction guessed now exists
  // for real. Checked as a plain derived value at render time, never via an
  // effect + `setState` — matching this codebase's own established lesson
  // (Story 3.10, twice; the "derived at render time" comment a few lines
  // below on `scale`/`position`) that syncing external data into state with
  // an effect is the anti-pattern here, not the fix, whenever the answer is
  // directly computable from data already in hand.
  function isFusionConfirmed(pf: PredictedFusion): boolean {
    const realClusterIds = new Set(
      pf.memberIds.map((id) => pieces.find((p) => p.id === id)?.clusterId ?? null),
    );
    return (
      realClusterIds.size === 1 && !realClusterIds.has(null) && clustersById.has([...realClusterIds][0]!)
    );
  }
  // Confirmed predictions are dropped from `predictedFusions` opportunistically
  // (the next time a *new* fusion happens, itself a genuine event, not a
  // reactive effect) rather than left to accumulate for the Room's entire
  // session — `activePredictedFusions` below is what every render actually
  // uses, so a confirmed-but-not-yet-pruned entry has zero effect on
  // rendering in the meantime regardless.
  const addPredictedFusion = (prediction: PredictedFusion) => {
    setPredictedFusions((prev) => [...prev.filter((pf) => !isFusionConfirmed(pf)), prediction]);
  };
  const activePredictedFusions = predictedFusions.filter((pf) => !isFusionConfirmed(pf));

  // The server's own re-validation rarely disagreeing with a "genuine"
  // prediction (`predicted-fusion-events.ts`) is the only other way a
  // prediction ever needs to go away — undoing it immediately rather than
  // leaving the pair visually merged but wrong. A genuine external signal
  // to subscribe to, unlike the confirmation check above — this is the
  // legitimate use of an effect here, not the anti-pattern.
  useEffect(() => {
    return subscribeFusionConflict((tempClusterId) => {
      setPredictedFusions((prev) => prev.filter((pf) => pf.tempClusterId !== tempClusterId));
    });
  }, []);

  const { predictedClusterIdByPieceId, predictedClustersById } = useMemo(() => {
    const byPieceId = new Map<string, string>();
    const byId = new Map<string, RoomDetailCluster>();
    for (const pf of activePredictedFusions) {
      for (const pieceId of pf.memberIds) {
        byPieceId.set(pieceId, pf.tempClusterId);
      }
      // `version: -1` is never compared against anything real for this
      // synthetic row — it only needs to satisfy `RoomDetailCluster`'s type.
      byId.set(pf.tempClusterId, { id: pf.tempClusterId, anchorX: pf.anchorX, anchorY: pf.anchorY, version: -1 });
    }
    return { predictedClusterIdByPieceId: byPieceId, predictedClustersById: byId };
  }, [activePredictedFusions]);

  // Split once per render into "renders alone" vs "renders inside its
  // Cluster's Group" — a piece with a `clusterId` that doesn't (yet) match
  // a loaded Cluster row is a one-render sync gap (piece update arriving
  // just ahead of its Cluster's), not a real state; it's excluded from
  // both until the Cluster row itself arrives. A solo piece covered by an
  // active `predictedFusions` entry (Story 3.13) is grouped under that
  // prediction's own temporary id instead of rendering alone — the real
  // `clusterId` branch above always wins once it's genuinely confirmed, so
  // this can never contradict real data, only anticipate it.
  const { soloPieces, membersByClusterId } = useMemo(() => {
    const solo: RoomDetailPiece[] = [];
    const byCluster = new Map<string, RoomDetailPiece[]>();
    for (const piece of pieces) {
      if (piece.clusterId != null && clustersById.has(piece.clusterId)) {
        const members = byCluster.get(piece.clusterId) ?? [];
        members.push(piece);
        byCluster.set(piece.clusterId, members);
      } else if (piece.clusterId == null && predictedClusterIdByPieceId.has(piece.id)) {
        const tempClusterId = predictedClusterIdByPieceId.get(piece.id)!;
        const predicted = activePredictedFusions.find((pf) => pf.tempClusterId === tempClusterId)!;
        const offset = predicted.offsetsByPieceId.get(piece.id)!;
        // A clone, not the live piece — `ClusterGroupSprite` reads
        // `clusterOffsetRow`/`clusterOffsetCol` directly off each member,
        // and the real piece's own fields are still `null` until the
        // server actually confirms the fusion. Only rendering reads this
        // clone; `collection.update(representativeMember.id, ...)` still
        // targets the real piece by `id`, which the clone preserves.
        const patched: RoomDetailPiece = {
          ...piece,
          clusterId: tempClusterId,
          clusterOffsetRow: offset.row,
          clusterOffsetCol: offset.col,
        };
        const members = byCluster.get(tempClusterId) ?? [];
        members.push(patched);
        byCluster.set(tempClusterId, members);
      } else if (piece.clusterId == null) {
        solo.push(piece);
      }
    }
    return { soloPieces: solo, membersByClusterId: byCluster };
  }, [pieces, clustersById, predictedClusterIdByPieceId, activePredictedFusions]);

  // Measures the actual wrapping container (not `window.innerWidth/Height`,
  // which can differ from it — desktop scrollbar gutter, mobile browser
  // chrome affecting `dvh` vs `innerHeight`) so the Stage never exceeds and
  // gets clipped by its `overflow-hidden` parent. This component only ever
  // mounts client-side (behind `room-canvas-loader.tsx`'s `ssr: false`), so
  // `window`/DOM APIs are always available by the time this render body runs.
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (el) {
        setStageSize({ width: el.clientWidth, height: el.clientHeight });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const contentHalfExtent = Math.max(halfExtentX, halfExtentY);
  const contentSpan = 2 * contentHalfExtent * CONTENT_MARGIN_FACTOR;
  // `computeFitView` floors both inputs against a transiently zero-size
  // container (hidden tab, zero-size iframe) so `fitScale` (and therefore
  // `minScale`/`maxScale`) can never collapse to 0, which would otherwise
  // turn every subsequent zoom computation into a division by zero.
  const fitView = computeFitView(stageSize, contentSpan);
  const fitScale = fitView.scale;
  const minScale = fitScale * MIN_SCALE_FACTOR;
  const maxScale = fitScale * MAX_SCALE_FACTOR;

  const [scale, setScale] = useState(fitScale);
  const [position, setPosition] = useState<Point>(fitView.position);
  const [isDraggable, setIsDraggable] = useState(true);
  const lastPinchDistanceRef = useRef<number | null>(null);
  // Live scale/position while a pinch is in progress, updated imperatively
  // on the Konva Stage every frame (see `handleTouchMove`) — never through
  // `setScale`/`setPosition` mid-gesture, so a re-render doesn't happen on
  // every single `touchmove`. `null` whenever no pinch is in flight.
  const pinchLiveRef = useRef<{ scale: number; position: Point } | null>(null);
  // A piece being dragged must suspend the Stage's own pan-drag — separate
  // from `isDraggable`, which pinch/touch-gesture handling below also
  // toggles; a piece drag can start independent of any touch gesture (e.g.
  // mouse drag on desktop), so it needs its own guard. No longer doubles as
  // the z-order key (see `zOrderRef` below) — that used to make a piece pop
  // back behind others the instant it was released, reported as "strange to
  // see a piece in front while dragging, then behind another once dropped."
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const isPieceDragging = draggingKey !== null;

  // Persistent z-order: every piece/Cluster ever picked up moves to the
  // front and *stays* there, even once dropped — unlike the old
  // `draggingKey`-only approach, which reset the moment a drag ended. Real
  // state (not a ref) so `renderItems` below can safely read it during
  // render — React forbids reading a ref's `.current` at render time.
  //
  // Keyed by *piece id*, never by a render item's own key (a Cluster's id
  // isn't stable across the Cluster's own lifetime — a code review finding
  // caught a real regression here: dragging solo piece A into a stationary
  // Cluster records A's own id as "recently touched," but the fused result
  // renders under the *stationary* Cluster's id, which was never recorded —
  // so the piece a Participant had just interacted with silently dropped to
  // the back the moment it fused). Ranking a render item by the *best*
  // (most recent) rank among all its underlying piece ids — one for a solo
  // piece, every member's for a Cluster — is invariant to exactly this kind
  // of identity change across a fuse/lock.
  const [zOrder, setZOrder] = useState<readonly string[]>([]);
  function bringToFront(pieceIds: readonly string[]) {
    setZOrder((prev) => [...prev.filter((existingId) => !pieceIds.includes(existingId)), ...pieceIds]);
  }

  // One combined, ordered render list (rather than "solo pieces, then
  // Clusters" as two separate fixed-order passes) — a stable sort keeps
  // any never-touched items in their natural relative order, and ranks
  // every touched piece/Cluster by how recently it (or, for a Cluster, any
  // of its current members) was picked up (most recent renders last, i.e.
  // on top), regardless of whether it's a solo piece or a Cluster.
  type RenderItem =
    | { type: "solo"; key: string; pieceIds: readonly string[]; piece: RoomDetailPiece }
    | {
        type: "cluster";
        key: string;
        pieceIds: readonly string[];
        cluster: RoomDetailCluster;
        members: RoomDetailPiece[];
      };
  const renderItems = useMemo(() => {
    const items: RenderItem[] = [
      ...soloPieces.map(
        (piece): RenderItem => ({ type: "solo", key: piece.id, pieceIds: [piece.id], piece }),
      ),
      ...[...clusters, ...predictedClustersById.values()].flatMap((cluster): RenderItem[] => {
        const members = membersByClusterId.get(cluster.id);
        return members
          ? [
              {
                type: "cluster",
                key: cluster.id,
                pieceIds: members.map((m) => m.id),
                cluster,
                members,
              },
            ]
          : [];
      }),
    ];
    if (zOrder.length === 0) {
      return items;
    }
    const rankByPieceId = new Map(zOrder.map((pieceId, index) => [pieceId, index]));
    const bestRank = (item: RenderItem) =>
      Math.max(-1, ...item.pieceIds.map((pieceId) => rankByPieceId.get(pieceId) ?? -1));
    return [...items].sort((a, b) => bestRank(a) - bestRank(b));
  }, [soloPieces, clusters, membersByClusterId, zOrder, predictedClustersById]);

  // Derived at render time, not synced via an effect: `scale`/`position`
  // state can go stale relative to `minScale`/`maxScale`/`contentHalfExtent`
  // whenever those change (a container resize/rotation), and the *correct*
  // value is always computable synchronously from current state + current
  // bounds — exactly the case where a `useEffect`+`setState` would be the
  // anti-pattern this codebase has hit (and fixed) twice before (Stories
  // 2.3, 3.1). Every read below uses these clamped values, never the raw
  // state directly, so the displayed view is always within bounds on every
  // render regardless of what triggered it.
  const clampedScale = clampScale(scale, minScale, maxScale);
  const clampedPosition = clampPosition(
    position,
    clampedScale,
    stageSize,
    contentHalfExtent,
    PAN_MARGIN,
  );

  function applyZoom(pointer: Point, newScaleRaw: number) {
    const newScale = clampScale(newScaleRaw, minScale, maxScale);
    const newPosition = zoomAtPoint(pointer, clampedScale, newScale, clampedPosition);
    setScale(newScale);
    setPosition(clampPosition(newPosition, newScale, stageSize, contentHalfExtent, PAN_MARGIN));
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    if (e.evt.deltaY === 0) {
      // Horizontal-only scroll (e.g. a trackpad swipe) must not be treated
      // as a zoom gesture at all.
      return;
    }
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }
    const zoomingIn = e.evt.deltaY < 0;
    applyZoom(
      pointer,
      zoomingIn ? clampedScale * WHEEL_ZOOM_FACTOR : clampedScale / WHEEL_ZOOM_FACTOR,
    );
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    // Konva's drag events bubble: a piece's own `dragend` also reaches this
    // Stage-level handler, and bubbling never reassigns `e.target` past the
    // original shape — so without this guard, a piece's local x/y would get
    // written into the Stage's own pan position, snapping the whole canvas
    // to wherever the piece was dropped on every single piece drag.
    if (e.target !== e.target.getStage()) {
      return;
    }
    // Synced only at drag end, not every `onDragMove` frame — Konva already
    // moves the Stage visually during the drag with no React involvement;
    // syncing state on every frame would force a full re-render (recomputing
    // extents, re-rendering every PieceSprite) at pointer-move frequency for
    // no visual benefit, risking AC #1's "no perceptible lag" on large Rooms.
    setPosition({ x: e.target.x(), y: e.target.y() });
  }

  function getTouchPoints(e: Konva.KonvaEventObject<TouchEvent>): [Point, Point] | null {
    const stage = e.target.getStage();
    const touches = e.evt.touches;
    if (!stage || touches.length !== 2) {
      return null;
    }
    const rect = stage.container().getBoundingClientRect();
    return [
      { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top },
      { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top },
    ];
  }

  // Every touch-count transition (start, end, or an OS-level cancel) resets
  // the pinch baseline and re-derives `isDraggable` directly from the
  // resulting touch count — rather than accumulating state across events.
  // This is deliberately simpler than tracking "are we mid-pinch": a 3rd
  // finger landing/lifting, or a system-cancelled gesture, all just cause
  // the next `touchmove` (if exactly 2 touches) to re-baseline the distance
  // without applying a zoom delta that one frame, instead of the alternative
  // — a stale distance producing an abrupt zoom jump, or `isDraggable`
  // getting stuck `false` with no path back to `true`.
  function handleTouchTransition(touchCount: number) {
    lastPinchDistanceRef.current = null;
    if (touchCount < 2 && pinchLiveRef.current) {
      // Sync React state to match wherever the pinch's own imperative
      // Konva updates actually left the Stage — exactly once, at gesture
      // end, mirroring `handleDragEnd`'s own "Konva already moved it,
      // React only needs to catch up now" pattern for panning.
      setScale(pinchLiveRef.current.scale);
      setPosition(pinchLiveRef.current.position);
      pinchLiveRef.current = null;
    }
    setIsDraggable(touchCount < 2);
  }

  function handleTouchStart(e: Konva.KonvaEventObject<TouchEvent>) {
    handleTouchTransition(e.evt.touches.length);
    // A second finger landing can arrive after Konva's own native Stage
    // drag has *already* engaged from the first finger alone — setting
    // `isDraggable` above only takes effect once React re-renders and
    // Konva's `draggable` prop actually updates, which can lag behind the
    // synchronous native touch event stream (observed: pinch-to-zoom not
    // registering at all on Firefox for Android). `stopDrag()` is an
    // imperative Konva API call that cancels any in-flight drag
    // immediately, with no render round-trip needed, so a pinch is never
    // fought by a drag that started a frame earlier.
    if (e.evt.touches.length >= 2) {
      e.target.getStage()?.stopDrag();
    }
  }

  function handleTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    const points = getTouchPoints(e);
    if (!points) {
      return;
    }
    e.evt.preventDefault();
    const [a, b] = points;
    const distance = distanceBetween(a, b);
    const midpoint = midpointBetween(a, b);
    if (lastPinchDistanceRef.current != null) {
      // Code review fix (2026-09-04, user report: pinch-to-zoom registered
      // but stuttered badly on Firefox for Android, while smooth on
      // Samsung Internet): this used to call `applyZoom`, which sets React
      // state (`setScale`/`setPosition`) on every single `touchmove` frame
      // — forcing a full re-render (recomputing extents, re-rendering
      // every PieceSprite) at whatever rate the browser fires touchmove,
      // uncoalesced on some browsers. Now mirrors `handleDragEnd`'s own
      // pattern for panning: Konva's Stage is moved directly/imperatively
      // every frame, with React state only synced once the gesture ends
      // (`handleTouchTransition`, above) — no per-frame re-render at all.
      const base = pinchLiveRef.current ?? { scale: clampedScale, position: clampedPosition };
      const newScale = clampScale(
        base.scale * (distance / lastPinchDistanceRef.current),
        minScale,
        maxScale,
      );
      const newPosition = clampPosition(
        zoomAtPoint(midpoint, base.scale, newScale, base.position),
        newScale,
        stageSize,
        contentHalfExtent,
        PAN_MARGIN,
      );
      pinchLiveRef.current = { scale: newScale, position: newPosition };
      const stage = e.target.getStage();
      stage?.scale({ x: newScale, y: newScale });
      stage?.position(newPosition);
      stage?.batchDraw();
    }
    lastPinchDistanceRef.current = distance;
  }

  function handleTouchEnd(e: Konva.KonvaEventObject<TouchEvent>) {
    handleTouchTransition(e.evt.touches.length);
  }

  // react-konva has no `onTouchCancel` prop (Konva's own event system
  // doesn't bind one) — a native listener on the Stage's own container is
  // the only way to catch an OS-cancelled gesture (incoming call, system
  // gesture) and recover `isDraggable`, which would otherwise stay stuck
  // `false` with no `touchend` ever arriving to reset it.
  const stageRef = useRef<Konva.Stage>(null);
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) {
      return;
    }
    function handleTouchCancel(e: TouchEvent) {
      handleTouchTransition(e.touches.length);
    }
    container.addEventListener("touchcancel", handleTouchCancel);
    return () => container.removeEventListener("touchcancel", handleTouchCancel);

  }, []);

  // Story 3.15: edge-autoscroll while a piece/Îlot is being dragged near the
  // viewport edge. `autoscrollNodeRef` is the dragged Konva node itself (a
  // `SoloPieceSprite`/`ClusterGroupSprite`'s own `<Group>`) — started/
  // stopped from their `onDragStart`/`onDragEnd`, independent of the Stage's
  // own pan-drag (mutually exclusive with it, see `isPieceDragging` above).
  // `autoscrollFrameRef` is the `requestAnimationFrame` handle; the loop
  // keeps rescheduling itself for the whole duration of the drag regardless
  // of whether the pointer is currently near an edge, since a piece drag
  // has no other hook that fires while the pointer is held stationary.
  const autoscrollFrameRef = useRef<number | null>(null);
  const autoscrollNodeRef = useRef<Konva.Node | null>(null);
  const autoscrollLastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (autoscrollFrameRef.current != null) {
        cancelAnimationFrame(autoscrollFrameRef.current);
      }
    };
  }, []);

  function autoscrollTick(timestamp: number) {
    const stage = stageRef.current;
    const node = autoscrollNodeRef.current;
    if (!stage || !node) {
      autoscrollFrameRef.current = null;
      return;
    }
    const pointer = stage.getPointerPosition();
    const lastTimestamp = autoscrollLastTimeRef.current;
    const dt = lastTimestamp == null ? 0 : (timestamp - lastTimestamp) / 1000;
    autoscrollLastTimeRef.current = timestamp;

    if (pointer) {
      const velocity = computeAutoscrollVelocity(
        pointer,
        stageSize,
        EDGE_AUTOSCROLL_MARGIN_PX,
        EDGE_AUTOSCROLL_MAX_SPEED_PX_PER_SEC,
      );
      if (velocity.x !== 0 || velocity.y !== 0) {
        const currentStagePos = stage.position();
        // `velocity` points in the direction the *view* should reveal more
        // content (e.g. positive x = pointer near the right edge = "show me
        // what's further right"). The Stage's own position is where
        // content-space (0,0) lands on screen — revealing more content to
        // the right means shifting that anchor *left*, i.e. the Stage must
        // move opposite to `velocity`, not with it (bug found in manual
        // testing: without the minus sign, dragging toward an edge panned
        // the view the wrong way).
        const proposedStagePos = {
          x: currentStagePos.x - velocity.x * dt,
          y: currentStagePos.y - velocity.y * dt,
        };
        const newStagePos = clampPosition(
          proposedStagePos,
          clampedScale,
          stageSize,
          contentHalfExtent,
          PAN_MARGIN,
        );
        // The critical part (AC #2): panning the Stage alone would silently
        // shift the dragged node's own screen position (screen = stagePos +
        // nodeLocalPos × scale) even though the pointer itself hasn't
        // moved. Re-asserting the node's *absolute* (screen-space) position
        // right after moving the Stage keeps it visually pinned under the
        // pointer — and stays perfectly consistent with Konva's own drag
        // manager (`Node.js`'s `_setDragPosition`, confirmed by reading the
        // installed Konva source): that internal logic only ever recomputes
        // a dragged node's position relative to a *fixed* pointer-to-node
        // screen-space offset captured once at drag-start, so as long as
        // this node's absolute position is left exactly where it already
        // was whenever no real pointer-move event fires, the next genuine
        // pointer move (if any) converges to the same value with no snap.
        const nodeAbsolutePosition = node.absolutePosition();
        stage.position(newStagePos);
        node.absolutePosition(nodeAbsolutePosition);
        stage.batchDraw();
      }
    }

    autoscrollFrameRef.current = requestAnimationFrame(autoscrollTick);
  }

  function startAutoscroll(node: Konva.Node) {
    autoscrollNodeRef.current = node;
    if (autoscrollFrameRef.current == null) {
      autoscrollLastTimeRef.current = null;
      autoscrollFrameRef.current = requestAnimationFrame(autoscrollTick);
    }
  }

  function stopAutoscroll() {
    if (autoscrollFrameRef.current != null) {
      cancelAnimationFrame(autoscrollFrameRef.current);
      autoscrollFrameRef.current = null;
    }
    autoscrollNodeRef.current = null;
    autoscrollLastTimeRef.current = null;
    // Mirrors `handleTouchTransition`'s own pattern: the loop above moves
    // the Stage imperatively, with no `setPosition` mid-drag (same reason
    // pinch-zoom avoids it — a `setState` at RAF-tick frequency would force
    // a full re-render for no visual benefit); React state is synced back
    // exactly once here, when the drag (and therefore any autoscrolling)
    // ends, so `position` never goes stale relative to wherever the Stage
    // actually ended up.
    const stage = stageRef.current;
    if (stage) {
      setPosition(
        clampPosition(stage.position(), clampedScale, stageSize, contentHalfExtent, PAN_MARGIN),
      );
    }
  }

  // Reuses `fitView` — the exact same `computeFitView` call the initial
  // `useState` seeds above are computed from — one formula, read twice,
  // never two independent computations that could drift apart. Also a full
  // gesture recovery, not just a view reset: `stopDrag()` ends any drag
  // Konva has in flight (otherwise its own `onDragEnd` would later
  // overwrite the recentred position with the pre-recenter drag position),
  // and `handleTouchTransition(0)` clears the pinch baseline and restores
  // `isDraggable` in case a gesture edge case left it stuck — this button
  // is the "I'm lost, get me back" escape hatch, so it must also undo any
  // gesture state a Participant could otherwise be stuck in.
  useImperativeHandle(
    ref,
    () => ({
      recenter: () => {
        stageRef.current?.stopDrag();
        handleTouchTransition(0);
        setScale(fitView.scale);
        setPosition(
          clampPosition(fitView.position, fitView.scale, stageSize, contentHalfExtent, PAN_MARGIN),
        );
      },
    }),
    [fitView, stageSize, contentHalfExtent],
  );

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ touchAction: "none" }}>
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={clampedScale}
        scaleY={clampedScale}
        x={clampedPosition.x}
        y={clampedPosition.y}
        draggable={isDraggable && !isPieceDragging}
        dragBoundFunc={(pos) =>
          clampPosition(pos, clampedScale, stageSize, contentHalfExtent, PAN_MARGIN)
        }
        onWheel={handleWheel}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Layer>
          <Rect
            x={-frameWidth / 2}
            y={-frameHeight / 2}
            width={frameWidth}
            height={frameHeight}
            stroke="#A8541F"
            strokeWidth={3 / clampedScale}
          />
          {renderItems.map((item) =>
            item.type === "solo" ? (
              <SoloPieceSprite
                key={item.key}
                piece={item.piece}
                pieces={pieces}
                clustersById={clustersById}
                tileWidth={room.tileWidth}
                tileHeight={room.tileHeight}
                frameWidth={frameWidth}
                frameHeight={frameHeight}
                roomId={room.id}
                gridRows={room.gridRows}
                gridCols={room.gridCols}
                collection={collection}
                onDragStart={(e) => {
                  setDraggingKey(item.key);
                  bringToFront(item.pieceIds);
                  startAutoscroll(e.target);
                }}
                onDragEnd={() => {
                  stopAutoscroll();
                  setDraggingKey(null);
                }}
                onInstantFrameLockOutcome={triggerPulse}
                onGenuineFusion={addPredictedFusion}
              />
            ) : (
              <ClusterGroupSprite
                key={item.key}
                cluster={item.cluster}
                members={item.members}
                pieces={pieces}
                clustersById={clustersById}
                tileWidth={room.tileWidth}
                tileHeight={room.tileHeight}
                frameWidth={frameWidth}
                frameHeight={frameHeight}
                roomId={room.id}
                gridRows={room.gridRows}
                gridCols={room.gridCols}
                collection={collection}
                onDragStart={(e) => {
                  setDraggingKey(item.key);
                  bringToFront(item.pieceIds);
                  startAutoscroll(e.target);
                }}
                onDragEnd={() => {
                  stopAutoscroll();
                  setDraggingKey(null);
                }}
                onInstantFrameLockOutcome={triggerPulse}
              />
            ),
          )}
          {[...justPlacedPulseById].map(([id, pulse]) => (
            <PlacementPulse
              key={`pulse-${id}`}
              x={pulse.x}
              y={pulse.y}
              tileWidth={room.tileWidth}
              tileHeight={room.tileHeight}
              color={pulse.color}
            />
          ))}
          {showCompletionGlow && (
            <FrameCompletionGlow frameWidth={frameWidth} frameHeight={frameHeight} />
          )}
        </Layer>
      </Stage>
      {/* Decoupled from canvas focus/interaction (AC #6) — a screen-reader
          user perceives Room activity without needing to interact with the
          Konva Stage at all, which has no DOM text content of its own. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
