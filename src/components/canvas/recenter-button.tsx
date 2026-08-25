"use client";

import { Crosshair } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("recenterAriaLabel")}
      className="absolute right-6 bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] z-10 size-12 rounded-full shadow-md"
    >
      <Crosshair className="size-5" aria-hidden="true" />
    </Button>
  );
}
