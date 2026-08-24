"use client";

import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import type { RoomDetail, RoomDetailPiece } from "@/lib/rooms/get-room-by-slug";

// Static view only; no pan/zoom yet (Story 3.3 owns navigation).
const VIEWPORT_SIZE = 800;
const CONTENT_MARGIN_FACTOR = 1.1;

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

  const frameWidth = room.gridCols * room.tileWidth;
  const frameHeight = room.gridRows * room.tileHeight;

  // Content span is derived from the actual Frame size and every piece's
  // real scatter position — not a hardcoded assumption about the scatter
  // radius used at creation time — so nothing is ever clipped regardless of
  // how a given Room was seeded.
  const halfExtentX = Math.max(
    frameWidth / 2,
    ...room.pieces.map((p) => Math.abs(p.scatterX) + room.tileWidth / 2),
  );
  const halfExtentY = Math.max(
    frameHeight / 2,
    ...room.pieces.map((p) => Math.abs(p.scatterY) + room.tileHeight / 2),
  );
  const contentSpan = 2 * Math.max(halfExtentX, halfExtentY) * CONTENT_MARGIN_FACTOR;
  const scale = VIEWPORT_SIZE / contentSpan;

  return (
    <Stage
      width={VIEWPORT_SIZE}
      height={VIEWPORT_SIZE}
      scaleX={scale}
      scaleY={scale}
      x={VIEWPORT_SIZE / 2}
      y={VIEWPORT_SIZE / 2}
    >
      <Layer>
        <Rect
          x={-frameWidth / 2}
          y={-frameHeight / 2}
          width={frameWidth}
          height={frameHeight}
          stroke="#A8541F"
          strokeWidth={3 / scale}
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
  );
}
