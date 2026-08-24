"use client";

import dynamic from "next/dynamic";
import type { RoomDetail } from "@/lib/rooms/get-room-by-slug";

/**
 * Client-only loader for the real Room Canvas — `ssr: false` is only valid
 * inside a Client Component in Next.js 16, same constraint that shaped the
 * Story 1.1 smoke-test loader this supersedes on `/room/[id]`.
 */
export const RoomCanvasClient = dynamic<{ room: RoomDetail; onReady?: () => void }>(
  () => import("@/components/canvas/room-canvas").then((mod) => mod.RoomCanvas),
  {
    ssr: false,
    loading: () => <div>Loading canvas…</div>,
  },
);
