"use client";

import { Crosshair } from "lucide-react";
import { useTranslations } from "next-intl";
import { CanvasFab } from "@/components/ui/canvas-fab";

// Always visible regardless of pan/zoom state or Guest/Participant status
// (unlike Story 3.2's Guest-only tutorial). `disabled` while the Canvas
// hasn't mounted yet — otherwise an early tap silently no-ops with no
// feedback, since `onClick` optional-chains into a not-yet-attached ref.
export function RecenterButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Canvas");

  return (
    <CanvasFab
      stackSlot={0}
      onClick={onClick}
      disabled={disabled}
      aria-label={t("recenterAriaLabel")}
    >
      <Crosshair className="size-5" aria-hidden="true" />
    </CanvasFab>
  );
}
