"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * "What shall we call you?" — asked once, never enforced.
 *
 * Skipping is a first-class outcome, not a failure path. A Guest reaches a
 * Room with zero friction by design (FR-9, and the whole shape of the
 * first-access flow), and a mandatory name would make entering a shared
 * puzzle a form. Dismissing leaves the Participant visible to everyone as
 * `Invité` in their own colour, which is enough for presence to do its job.
 *
 * Not Guest-only: sign-up collects an email and a password and nothing
 * else, so a registered Participant has no display name either — and their
 * email must never be shown to the rest of the Room.
 *
 * Shown by `room-view.tsx` only once the tutorial is out of the way, so a
 * first-time Guest meets one dialog at a time rather than two in a row.
 */
export function NamePrompt({
  open,
  onSubmit,
  onSkip,
}: {
  open: boolean;
  onSubmit: (name: string) => void;
  onSkip: () => void;
}) {
  const t = useTranslations("Presence");
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  function handleOpenChange(nextOpen: boolean) {
    // Escape, the overlay, anything — every way out that isn't the submit
    // button is a skip, and none of them should leave the dialog able to
    // come back this visit.
    if (!nextOpen) {
      onSkip();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("promptTitle")}</DialogTitle>
          <DialogDescription>{t("promptDescription")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed.length > 0) {
              onSubmit(trimmed);
            } else {
              onSkip();
            }
          }}
        >
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            // Matches `participant-identity.ts`'s own cap, so the field
            // cannot accept something that will then be silently truncated.
            maxLength={24}
            aria-label={t("promptInputAriaLabel")}
            placeholder={t("promptPlaceholder")}
          />
          <Button type="submit" className="min-h-11 w-full" disabled={trimmed.length === 0}>
            {t("promptConfirm")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full text-muted-foreground"
            onClick={onSkip}
          >
            {t("promptSkip")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
