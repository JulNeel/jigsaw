"use client";

import { useRef, useState } from "react";
import type { RoomDetail } from "@/lib/rooms/get-room-by-slug";
import { RoomCanvasClient } from "@/components/canvas/room-canvas-loader";
import type { RoomCanvasHandle } from "@/components/canvas/room-canvas";
import { RecenterButton } from "@/components/canvas/recenter-button";
import { SoundMuteButton } from "@/components/canvas/sound-mute-button";
import { ReferenceImageButton } from "@/components/canvas/reference-image-button";
import { FirstAccessTutorial } from "@/components/room/first-access-tutorial";

// Coordinates the "once the Canvas loads" part of AC #1 (Story 3.2): the
// Canvas and the tutorial are siblings under the Server Component `RoomPage`,
// so this small Client Component is where the "canvas ready" signal actually
// crosses from one to the other. Also holds the ref (Story 3.4) that lets
// the always-visible recenter button trigger `RoomCanvas`'s own imperative
// `recenter()` without lifting its pan/zoom state up to this level.
export function RoomView({
  room,
  roomSlug,
  isGuest,
}: {
  room: RoomDetail;
  roomSlug: string;
  isGuest: boolean;
}) {
  const [canvasReady, setCanvasReady] = useState(false);
  const canvasRef = useRef<RoomCanvasHandle>(null);

  return (
    <>
      <RoomCanvasClient ref={canvasRef} room={room} onReady={() => setCanvasReady(true)} />
      <RecenterButton
        onClick={() => canvasRef.current?.recenter()}
        disabled={!canvasReady}
      />
      <SoundMuteButton />
      <ReferenceImageButton referenceImageUrl={room.referenceImageUrl} />
      {isGuest && <FirstAccessTutorial roomSlug={roomSlug} canvasReady={canvasReady} />}
    </>
  );
}
