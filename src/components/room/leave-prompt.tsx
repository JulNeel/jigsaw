"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { subscribeOwnContribution } from "@/lib/rooms/session-contribution-events";
import { getSafeLocalStorage, loadOrCreateParticipantId } from "@/lib/rooms/participant-identity";
import { rememberClaimIntent } from "@/lib/rooms/claim-intent";

/**
 * A Guest's way out of a Room — which is also the last moment anyone can
 * offer to keep what they just did.
 *
 * Replaces the plain link a Guest had, rather than adding a second exit:
 * that link already went to `/sign-in`, it simply never said why.
 *
 * **Only asks someone who actually contributed.** Prompting a visitor who
 * watched for thirty seconds and left is how a product teaches people to
 * dismiss its dialogs without reading them.
 *
 * AC #2 — the same offer on tab close — is deliberately not implemented,
 * and the reason is recorded in Story 4.3 rather than in a comment nobody
 * will find: no browser lets a page put its own content in the unload
 * dialog, and the generic one ("changes you made may not be saved") would
 * be false here, since every contribution was committed the moment it
 * happened. Nothing is lost by closing the tab — the browser keeps its
 * `participantId`, so signing up days later still claims those
 * contributions.
 */
export function LeavePrompt({
  isGuest,
  ariaLabel,
  roomPath,
}: {
  isGuest: boolean;
  ariaLabel: string;
  /**
   * Where to come back to. Without it, someone who signs up to keep their
   * contributions lands on a dashboard that lists only Rooms they created —
   * so a Guest's first sight of their new account is an empty page and no
   * way back to the puzzle they were just playing (user report,
   * 2026-09-29). Listing contributed-to Rooms on Home is Story 4.4's own
   * AC; returning someone to where they were interrupted is this story's
   * job either way.
   */
  roomPath: string;
}) {
  const t = useTranslations("Leave");
  const [contributed, setContributed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isGuest) {
      return;
    }
    return subscribeOwnContribution(() => setContributed(true));
  }, [isGuest]);


  return (
    <>
      <Link
        href="/sign-in"
        aria-label={ariaLabel}
        onClick={(event) => {
          if (contributed) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-card/90 shadow-sm backdrop-blur-sm"
      >
        <LogIn className="size-4" aria-hidden="true" />
      </Link>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          {/*
            Two choices, not three. Both go to `/sign-in` — which shows the
            sign-up and sign-in forms side by side, so there is no tab to
            pick — and the only thing that differs is whether the intent to
            claim is recorded. Offering "sign up" and "sign in" as separate
            buttons would have been two labels for one destination.

            AC #1 asks for "dismissible without pressure": leaving is a
            plain, full-width choice, not a shrunken grey escape hatch, and
            nothing is pre-selected.
          */}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              asChild
              className="min-h-11 w-full"
              onClick={() => rememberClaimIntent(loadOrCreateParticipantId(getSafeLocalStorage()))}
            >
              <Link href={`/sign-in?next=${encodeURIComponent(roomPath)}`}>{t("keep")}</Link>
            </Button>
            {/* `outline`, not `ghost`: AC #1's "without pressure" is a
                design constraint, and a muted-text button next to a filled
                one reads as the discouraged choice however wide it is. */}
            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link href="/sign-in">{t("leaveAnyway")}</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
