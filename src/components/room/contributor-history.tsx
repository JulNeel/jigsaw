"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CanvasFab } from "@/components/ui/canvas-fab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { colorForParticipant } from "@/lib/rooms/participant-identity";
import type { ContributionRow } from "@/lib/rooms/contribution-row";

/**
 * The Room's story (FR-13), as a panel rather than a screen.
 *
 * AC #1 asks for it "from the Room or from Statistics […] without a
 * dedicated separate screen", so this is one component with two eventual
 * mount points. Statistics (`stats/[roomId]`) is still Epic 5's unbuilt
 * stub; when it exists it renders `ContributorHistoryPanel` directly and
 * skips the button.
 */
export function ContributorHistory({ rows, hasMore, loading, onLoadMore }: PanelProps) {
  const t = useTranslations("History");
  const [open, setOpen] = useState(false);

  return (
    <>
      <CanvasFab stackSlot={4} onClick={() => setOpen(true)} aria-label={t("openAriaLabel")}>
        <History className="size-5" aria-hidden="true" />
      </CanvasFab>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("subtitle")}</DialogDescription>
          </DialogHeader>
          <ContributorHistoryPanel
            rows={rows}
            hasMore={hasMore}
            loading={loading}
            onLoadMore={onLoadMore}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type PanelProps = {
  rows: ContributionRow[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
};

export function ContributorHistoryPanel({ rows, hasMore, loading, onLoadMore }: PanelProps) {
  const t = useTranslations("History");

  if (rows.length === 0) {
    return <EmptyState glyph={null} title={t("emptyTitle")} body={t("emptyBody")} />;
  }

  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
      <ol className="flex flex-col gap-2">
        {rows.map((row) => (
          <HistoryLine key={row.id} row={row} />
        ))}
      </ol>
      {hasMore && (
        <Button type="button" variant="ghost" onClick={onLoadMore} disabled={loading}>
          {loading ? t("loading") : t("loadMore")}
        </Button>
      )}
    </div>
  );
}

function HistoryLine({ row }: { row: ContributionRow }) {
  const t = useTranslations("History");
  const format = useFormatter();
  // Passed explicitly, for two reasons. `relativeTime` without it raises
  // `IntlError: ENVIRONMENT_FALLBACK` and silently substitutes the current
  // time — caught by the dev overlay while looking at this panel, not by
  // any test. And a ticking `now` is what makes "il y a 1 minute" become
  // "il y a 2 minutes" while the panel stays open; a fixed one would leave
  // every line frozen at the moment it was first drawn.
  const now = useNow({ updateInterval: 60_000 });
  const name = row.pseudo ?? t("anonymous");
  // A Guest is coloured by the browser they played from, exactly as the
  // presence overlay colours them, so the same person reads the same way in
  // both places. A registered Participant is coloured by their account id
  // for the same reason — it is stable across their devices.
  const color = colorForParticipant(row.userId ?? row.guestParticipantId ?? row.id);
  const at = new Date(row.createdAt);

  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        style={{ backgroundColor: color }}
        className="size-2 shrink-0 rounded-full"
      />
      <span className="min-w-0 flex-1 truncate">
        {t(row.kind === "placed" ? "placedLine" : "fusedLine", { name })}
      </span>
      {/*
        Relative time is what anyone actually wants from a history ("il y a
        3 min"), and useless on its own once it passes a day. The exact
        instant stays available on hover and to assistive technology through
        `<time>`'s own `dateTime`.
      */}
      <time
        dateTime={row.createdAt}
        title={format.dateTime(at, { dateStyle: "long", timeStyle: "short" })}
        className="shrink-0 text-xs text-muted-foreground"
      >
        {format.relativeTime(at, now)}
      </time>
    </li>
  );
}
