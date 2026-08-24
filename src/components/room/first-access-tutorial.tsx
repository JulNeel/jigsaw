"use client";

import { useState, useSyncExternalStore } from "react";
import { Frame, Group, Hand, RotateCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSafeSessionStorage, hasSeenTutorial, markTutorialSeen } from "@/lib/rooms/tutorial-seen";

const STEPS = [
  { icon: Hand, titleKey: "step1Title", descriptionKey: "step1Description" },
  { icon: RotateCw, titleKey: "step2Title", descriptionKey: "step2Description" },
  { icon: Frame, titleKey: "step3Title", descriptionKey: "step3Description" },
  { icon: Group, titleKey: "step4Title", descriptionKey: "step4Description" },
] as const;

function subscribeNoop() {
  // sessionStorage never changes out from under this component on its own
  // (no cross-tab broadcast to listen for) — this store's only "update" is
  // the dismiss handler's own local `dismissed` state below, so there's
  // nothing external to subscribe to.
  return () => {};
}

// `useSyncExternalStore` (not `useEffect`+`setState`) is the React-blessed
// way to read a browser-only API (`sessionStorage`) safely across SSR and
// hydration: the server snapshot always reports "seen" (so SSR/the first
// hydration render always renders closed, matching Radix Dialog's own
// default and avoiding a hydration mismatch), and the client snapshot reads
// the real value once mounted. This sidesteps the `react-hooks/set-state-in-
// effect` lint rule that a direct `setOpen(true)` inside a `useEffect` body
// tripped here (a 3rd occurrence, after Stories 2.3 and 3.1) — this case
// has no async callback to hang the update off of the way `usePieceImage`
// (Story 3.1) does, so `useSyncExternalStore` is the correct tool, not a
// workaround.
function useTutorialAlreadySeen(roomSlug: string): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => hasSeenTutorial(roomSlug, getSafeSessionStorage()),
    () => true,
  );
}

// Guest-only, first-visit-per-Room-per-session (FR-9). `sessionStorage` is a
// client-side UI-state cache only — no relationship to a real Guest session
// (Epic 4's concern, per Story 3.1's Dev Notes).
export function FirstAccessTutorial({
  roomSlug,
  canvasReady,
}: {
  roomSlug: string;
  canvasReady: boolean;
}) {
  const t = useTranslations("Tutorial");
  const alreadySeen = useTutorialAlreadySeen(roomSlug);
  // Local override for the current visit only — `alreadySeen` itself never
  // flips back to false once true, so this tracks "dismissed just now"
  // without needing to touch the external store's snapshot at all.
  const [dismissed, setDismissed] = useState(false);
  const open = canvasReady && !alreadySeen && !dismissed;

  function handleOpenChange(nextOpen: boolean) {
    // Every dismissal path (Escape, overlay click, close X, CTA, skip) goes
    // through here — AC #3 requires it never reappear regardless of how it
    // was dismissed, not just via the primary button.
    if (!nextOpen) {
      markTutorialSeen(roomSlug, getSafeSessionStorage());
      setDismissed(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {STEPS.map(({ icon: Icon, titleKey, descriptionKey }) => (
            <div key={titleKey} className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t(titleKey)}</p>
                <p className="text-sm text-muted-foreground">{t(descriptionKey)}</p>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          autoFocus
          className="min-h-11 w-full"
          onClick={() => handleOpenChange(false)}
        >
          {t("start")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full text-muted-foreground"
          onClick={() => handleOpenChange(false)}
        >
          {t("later")}
        </Button>

        {/* Placed last in DOM order (not first) so it's never the initial-
            focus target — its `absolute` positioning keeps it visually in
            the top-right corner regardless of source order. */}
        <DialogClose asChild>
          <Button
            variant="ghost"
            className="absolute top-2 right-2 min-h-11 min-w-11"
            aria-label={t("closeAriaLabel")}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
