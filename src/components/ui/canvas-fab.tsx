import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The shared circular floating-action-button shape stacked along the
// Canvas's right edge (recenter, mute, reference image, highlight-frame-
// pieces) — previously an identical className string repeated across four
// separate files. `stackSlot` is the stacking position (0 = closest to the
// bottom edge), spaced 4rem apart starting 1.5rem up from the safe area —
// the exact offsets those four buttons already used. Named `stackSlot`, not
// `slot` — the latter collides with the native HTML `slot` attribute already
// present on `React.ComponentProps<"button">`.
const FAB_SLOT_OFFSETS_REM = [1.5, 5.5, 9.5, 13.5] as const;

export function CanvasFab({
  stackSlot,
  className,
  variant = "outline",
  style,
  ...props
}: React.ComponentProps<typeof Button> & { stackSlot: 0 | 1 | 2 | 3 }) {
  return (
    <Button
      type="button"
      variant={variant}
      className={cn("absolute right-6 z-10 size-12 rounded-full shadow-md", className)}
      style={{
        bottom: `calc(env(safe-area-inset-bottom) + ${FAB_SLOT_OFFSETS_REM[stackSlot]}rem)`,
        ...style,
      }}
      {...props}
    />
  );
}
