"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { claimContributions } from "@/lib/rooms/claim-contributions";
import { consumeClaimIntent } from "@/lib/rooms/claim-intent";

/**
 * Finishes what the leave prompt started (AC #3).
 *
 * Mounted on Home because that is where both `signUp` and `signIn` redirect
 * — narrower than the root layout, which would run this on every page in
 * the app to do nothing.
 *
 * **Runs only when the intent was recorded**, never on every sign-in. On a
 * shared machine, claiming at each auth event would attach whatever a
 * previous Guest did to whoever signs in next, which is precisely the
 * mis-attribution this story exists to avoid.
 *
 * Renders nothing. The only outward sign is a toast, and only when
 * something actually moved.
 */
export function ClaimContributionsOnAuth() {
  const t = useTranslations("Leave");
  // React Strict Mode runs effects twice in development. The intent is
  // read-and-cleared, so the second pass finds nothing — but the ref makes
  // that a property of this component rather than a lucky consequence of
  // how `consumeClaimIntent` happens to work.
  const done = useRef(false);

  useEffect(() => {
    if (done.current) {
      return;
    }
    done.current = true;
    const participantId = consumeClaimIntent();
    if (!participantId) {
      return;
    }
    void claimContributions(participantId).then((result) => {
      if (result.ok && result.claimed > 0) {
        toast.success(t("claimed", { count: result.claimed }));
      }
      // Silent otherwise, deliberately. "Nothing to claim" is the normal
      // outcome for someone who signed in on a browser that had no Guest
      // history, and a failure is not something the person can act on —
      // their contributions are still there, still claimable, and the Room
      // is unaffected either way.
    });
  }, [t]);

  return null;
}
