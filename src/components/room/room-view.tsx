"use client";

import { useState } from "react";
import type { RoomDetail } from "@/lib/rooms/get-room-by-slug";
import { RoomCanvasClient } from "@/components/canvas/room-canvas-loader";
import { FirstAccessTutorial } from "@/components/room/first-access-tutorial";

// Coordinates the "once the Canvas loads" part of AC #1 (Story 3.2): the
// Canvas and the tutorial are siblings under the Server Component `RoomPage`,
// so this small Client Component is where the "canvas ready" signal actually
// crosses from one to the other.
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

  return (
    <>
      <RoomCanvasClient room={room} onReady={() => setCanvasReady(true)} />
      {isGuest && <FirstAccessTutorial roomSlug={roomSlug} canvasReady={canvasReady} />}
    </>
  );
}
