"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import { frameSlotCenter, type FrameGeometry } from "@/lib/validation/frame-geometry";
import type { RoomDetailPiece } from "@/lib/rooms/get-room-by-slug";

type Point = { x: number; y: number };

/**
 * What an automated browser can ask the running canvas.
 *
 * Kept deliberately small: everything here is something a test genuinely
 * cannot obtain any other way. Pieces are drawn into a `<canvas>`, so they
 * have no DOM nodes to target and no `data-testid` could ever help; and the
 * client's confirmed `version` is the only honest signal that a write came
 * back through Realtime.
 */
export type JigsawTestHandle = {
  ready: true;
  /** World point (frame centre is 0,0) → viewport pixels. */
  toScreen(world: Point): Point;
  /** A piece's current render position in world coordinates. */
  pieceWorld(pieceId: string): Point | null;
  pieceScreen(pieceId: string): Point | null;
  /** A Frame slot's centre, in viewport pixels. */
  slotScreen(row: number, col: number): Point;
  /**
   * The client's *confirmed* version. Optimistic mutations never touch it —
   * it only advances when a Realtime event lands, which is precisely what
   * makes it a usable "the server wrote it" signal.
   */
  pieceVersion(pieceId: string): number | null;
  /** Placement/cluster state as the client currently believes it. */
  pieceState(
    pieceId: string,
  ): { placedRow: number | null; placedCol: number | null; clusterId: string | null; rotation: number } | null;
  stage: Konva.Stage;
};

declare global {
  interface Window {
    __jigsawE2E?: JigsawTestHandle;
  }
}

/**
 * Doubly gated, and both gates are compile-time constants that Next inlines
 * into the client bundle. In a production build `NODE_ENV` is `"production"`
 * and `NEXT_PUBLIC_E2E_HOOKS` is undefined, so this collapses to `false` and
 * the whole hook body is dead code eliminated — the handle cannot be exposed
 * by flipping a runtime flag, only by rebuilding with the variable set.
 *
 * Exported so the gate itself is unit-testable; the hook below is a React
 * hook and would otherwise need a DOM renderer this project deliberately
 * doesn't have.
 */
export function isStageTestHookEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_E2E_HOOKS === "1"
  );
}

/**
 * Publishes `window.__jigsawE2E` while the canvas is mounted.
 *
 * `resolveWorld` is injected rather than reimplemented here: the caller owns
 * `pieceRenderPosition`, and a second copy of that three-branch rule living
 * in a test hook is exactly the kind of drift that makes a harness report
 * bugs the app doesn't have.
 *
 * Coordinates come from `stage.getAbsoluteTransform()` — the live transform,
 * never a recomputation. Pan, pinch and edge-autoscroll all mutate the stage
 * imperatively without going through React state, so anything derived from
 * props would be silently wrong after the first gesture.
 */
export function useStageTestHook(args: {
  stageRef: RefObject<Konva.Stage | null>;
  pieces: readonly RoomDetailPiece[];
  geom: FrameGeometry;
  resolveWorld: (piece: RoomDetailPiece) => Point;
}): void {
  const latest = useRef(args);
  useEffect(() => {
    latest.current = args;
  });

  useEffect(() => {
    if (!isStageTestHookEnabled()) {
      return;
    }
    const findPiece = (pieceId: string) =>
      latest.current.pieces.find((p) => p.id === pieceId) ?? null;
    const toScreen = (world: Point): Point => {
      const stage = latest.current.stageRef.current;
      if (!stage) {
        throw new Error("__jigsawE2E: stage not mounted");
      }
      return stage.getAbsoluteTransform().point(world);
    };
    const pieceWorld = (pieceId: string): Point | null => {
      const piece = findPiece(pieceId);
      return piece ? latest.current.resolveWorld(piece) : null;
    };

    const handle: JigsawTestHandle = {
      ready: true,
      toScreen,
      pieceWorld,
      pieceScreen: (pieceId) => {
        const world = pieceWorld(pieceId);
        return world ? toScreen(world) : null;
      },
      slotScreen: (row, col) => toScreen(frameSlotCenter(row, col, latest.current.geom)),
      pieceVersion: (pieceId) => findPiece(pieceId)?.version ?? null,
      pieceState: (pieceId) => {
        const piece = findPiece(pieceId);
        return piece
          ? {
              placedRow: piece.placedRow,
              placedCol: piece.placedCol,
              clusterId: piece.clusterId,
              rotation: piece.rotation,
            }
          : null;
      },
      // A live getter, not a snapshot — `stageRef.current` is null on the
      // first effect pass for a ref assigned by react-konva.
      get stage() {
        const stage = latest.current.stageRef.current;
        if (!stage) {
          throw new Error("__jigsawE2E: stage not mounted");
        }
        return stage;
      },
    };

    window.__jigsawE2E = handle;
    return () => {
      delete window.__jigsawE2E;
    };
  }, []);
}
