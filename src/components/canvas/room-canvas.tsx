"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import type { RoomDetail, RoomDetailPiece } from "@/lib/rooms/get-room-by-slug";
import { clampPosition, clampScale, zoomAtPoint, type Point } from "./viewport-bounds";

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

function PieceSprite({
  piece,
  tileWidth,
  tileHeight,
}: {
  piece: RoomDetailPiece;
  tileWidth: number;
  tileHeight: number;
}) {
  const imageState = usePieceImage(piece.imageUrl);
  const x = piece.scatterX - tileWidth / 2;
  const y = piece.scatterY - tileHeight / 2;

  if (imageState.status === "loaded") {
    return (
      <KonvaImage
        image={imageState.image}
        x={x}
        y={y}
        width={tileWidth}
        height={tileHeight}
      />
    );
  }

  if (imageState.status === "loading") {
    // Distinct from "error" below — a solid, undashed placeholder while the
    // tile is still fetching, so a slow load doesn't look identical to a
    // permanently broken one.
    return (
      <Rect x={x} y={y} width={tileWidth} height={tileHeight} fill="#eee6da" />
    );
  }

  // A single broken/missing tile shows a dashed outline instead of crashing
  // the whole Canvas for everyone in the Room.
  return (
    <Rect
      x={x}
      y={y}
      width={tileWidth}
      height={tileHeight}
      stroke="#c4b8a8"
      dash={[6, 4]}
    />
  );
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpointBetween(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function RoomCanvas({
  room,
  onReady,
}: {
  room: RoomDetail;
  onReady?: () => void;
}) {
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

  const { halfExtentX, halfExtentY, frameWidth, frameHeight } = useMemo(() => {
    const frameWidth = room.gridCols * room.tileWidth;
    const frameHeight = room.gridRows * room.tileHeight;
    // Content extent is derived from the actual Frame size and every piece's
    // real scatter position — not a hardcoded assumption about the scatter
    // radius used at creation time — so nothing is ever clipped or made
    // unreachable regardless of how a given Room was seeded.
    return {
      frameWidth,
      frameHeight,
      halfExtentX: Math.max(
        frameWidth / 2,
        ...room.pieces.map((p) => Math.abs(p.scatterX) + room.tileWidth / 2),
      ),
      halfExtentY: Math.max(
        frameHeight / 2,
        ...room.pieces.map((p) => Math.abs(p.scatterY) + room.tileHeight / 2),
      ),
    };
     
  }, [room]);

  const contentHalfExtent = Math.max(halfExtentX, halfExtentY);
  const contentSpan = Math.max(1, 2 * contentHalfExtent * CONTENT_MARGIN_FACTOR);
  // Floored at 1 — a transiently zero-size container (hidden tab, zero-size
  // iframe) must never make `fitScale` (and therefore `minScale`/`maxScale`)
  // collapse to 0, which would otherwise turn every subsequent zoom
  // computation into a division by zero.
  const fitScale = Math.max(1, Math.min(stageSize.width, stageSize.height)) / contentSpan;
  const minScale = fitScale * MIN_SCALE_FACTOR;
  const maxScale = fitScale * MAX_SCALE_FACTOR;

  const [scale, setScale] = useState(fitScale);
  const [position, setPosition] = useState<Point>({
    x: stageSize.width / 2,
    y: stageSize.height / 2,
  });
  const [isDraggable, setIsDraggable] = useState(true);
  const lastPinchDistanceRef = useRef<number | null>(null);

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
    setIsDraggable(touchCount < 2);
  }

  function handleTouchStart(e: Konva.KonvaEventObject<TouchEvent>) {
    handleTouchTransition(e.evt.touches.length);
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
      applyZoom(midpoint, clampedScale * (distance / lastPinchDistanceRef.current));
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
        draggable={isDraggable}
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
          {room.pieces.map((piece) => (
            <PieceSprite
              key={piece.id}
              piece={piece}
              tileWidth={room.tileWidth}
              tileHeight={room.tileHeight}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
