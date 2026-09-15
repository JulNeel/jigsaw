"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { CanvasFab } from "@/components/ui/canvas-fab";
import { useSoundMuted } from "@/lib/audio/use-sound-muted";

// Always visible from the Room, never nested in a menu (Accessibility
// Floor) — same corner-overlay convention as `RecenterButton`. Needs no
// `canvasReady`/ref wiring: it only ever touches `localStorage`, independent
// of whether the Canvas has mounted yet.
export function SoundMuteButton() {
  const t = useTranslations("Canvas");
  const [muted, setMuted] = useSoundMuted();

  return (
    <CanvasFab
      stackSlot={1}
      onClick={() => setMuted(!muted)}
      aria-label={muted ? t("unmuteAriaLabel") : t("muteAriaLabel")}
    >
      {muted ? (
        <VolumeX className="size-5" aria-hidden="true" />
      ) : (
        <Volume2 className="size-5" aria-hidden="true" />
      )}
    </CanvasFab>
  );
}
