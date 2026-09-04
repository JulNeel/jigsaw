"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useSoundMuted } from "@/lib/audio/use-sound-muted";

// Always visible from the Room, never nested in a menu (Accessibility
// Floor) — same corner-overlay convention as `RecenterButton`. Needs no
// `canvasReady`/ref wiring: it only ever touches `localStorage`, independent
// of whether the Canvas has mounted yet.
export function SoundMuteButton() {
  const t = useTranslations("Canvas");
  const [muted, setMuted] = useSoundMuted();

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? t("unmuteAriaLabel") : t("muteAriaLabel")}
      className="absolute right-6 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-10 size-12 rounded-full shadow-md"
    >
      {muted ? (
        <VolumeX className="size-5" aria-hidden="true" />
      ) : (
        <Volume2 className="size-5" aria-hidden="true" />
      )}
    </Button>
  );
}
