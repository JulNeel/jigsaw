"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Press-and-hold, not a toggle (Story 3.14) — a physical puzzle's box lid
// is glanced at, not kept propped open. Pointer Events (not separate
// mouse/touch handlers) + `setPointerCapture` are what make AC #2 work:
// once captured, `onPointerUp`/`onPointerCancel` fire on *this* element
// even if the pointer wandered off it while still held, so a hold-then-drag
// gesture can never get stuck open. Same corner-overlay convention as
// `RecenterButton`/`SoundMuteButton`, stacked one slot further up.
export function ReferenceImageButton({
  referenceImageUrl,
}: {
  referenceImageUrl: string | null;
}) {
  const t = useTranslations("Canvas");
  const [isShowing, setIsShowing] = useState(false);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsShowing(true);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsShowing(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={referenceImageUrl == null}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label={t("referenceImageAriaLabel")}
        className="absolute right-6 bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] z-10 size-12 rounded-full shadow-md touch-none select-none"
      >
        <ImageIcon className="size-5" aria-hidden="true" />
      </Button>

      {isShowing && referenceImageUrl != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95">
          {/* eslint-disable-next-line @next/next/no-img-element -- a plain
              <img>, not next/image: this is a transient fullscreen overlay
              of an already-resized asset, not a layout-managed image. */}
          <img
            src={referenceImageUrl}
            alt={t("referenceImageAriaLabel")}
            draggable={false}
            className="max-h-full max-w-full object-contain pointer-events-none select-none"
            style={{ touchAction: "none" }}
          />
        </div>
      )}
    </>
  );
}
