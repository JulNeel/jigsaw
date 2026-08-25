"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { RoomCanvasProps } from "@/components/canvas/room-canvas";

function CanvasLoadingPlaceholder() {
  const t = useTranslations("Canvas");
  return <div className="absolute inset-0 flex items-center justify-center">{t("loading")}</div>;
}

/**
 * Client-only loader for the real Room Canvas — `ssr: false` is only valid
 * inside a Client Component in Next.js 16, same constraint that shaped the
 * Story 1.1 smoke-test loader this supersedes on `/room/[id]`.
 */
export const RoomCanvasClient = dynamic<RoomCanvasProps>(
  () => import("@/components/canvas/room-canvas").then((mod) => mod.RoomCanvas),
  {
    ssr: false,
    loading: CanvasLoadingPlaceholder,
  },
);
