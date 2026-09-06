"use client";

import { Frame } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// A toggle, not press-and-hold (Story 3.16) — sorting out every frame piece
// from the pile takes real time, unlike a quick glance at the reference
// image (Story 3.14). `aria-pressed` + a state-dependent `variant` (rather
// than two different aria-labels, `SoundMuteButton`'s own approach) is the
// same accessible toggle pattern `create-room-form.tsx`'s library-image
// selection already uses. Same corner-overlay convention as the other
// Canvas buttons, stacked one slot further up again.
export function HighlightFramePiecesButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("Canvas");

  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onToggle}
      aria-pressed={active}
      aria-label={t("highlightFramePiecesAriaLabel")}
      className="absolute right-6 bottom-[calc(env(safe-area-inset-bottom)+13.5rem)] z-10 size-12 rounded-full shadow-md"
    >
      <Frame className="size-5" aria-hidden="true" />
    </Button>
  );
}
