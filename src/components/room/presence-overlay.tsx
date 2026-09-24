"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PresenceDot } from "@/components/ui/presence-dot";
import { diffPresence, type PresentParticipant } from "@/lib/rooms/presence";

/**
 * Who else is here, top-right.
 *
 * The only free corner: top-left carries the back link and the Room name,
 * and the right edge carries the vertical tool stack.
 *
 * Renders nothing at all when nobody else is active — a lone Participant
 * should not be shown an empty box explaining that they are alone.
 */
export function PresenceOverlay({ participants }: { participants: PresentParticipant[] }) {
  const t = useTranslations("Presence");
  const announcement = usePresenceAnnouncement(participants);

  return (
    <>
      {/*
        Its own region, deliberately not `RoomCanvas`'s. AC #3 asks for
        announcements "decoupled from Canvas manipulation", and the canvas
        region is already carrying placement announcements — sharing it
        would have someone arriving compete with a piece being placed, and
        lose.
      */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {participants.length > 0 && (
        /*
          Labelled, not just drawn. A row of coloured initials is legible to
          nobody who has not been told what it is (user feedback,
          2026-09-24) — the avatars answer "who", and only the dot and the
          count answer "who *what*".

          The dot plus "{count} en ligne" is not invented here: it is the
          same atom and the same wording Home already uses for each Room in
          the list, so a Participant arriving in a Room meets a phrase they
          have already read. Same chrome treatment as the Room title
          opposite, for the same reason.
        */
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-accent-hover">
            <PresenceDot />
            {t("onlineCount", { count: participants.length })}
          </span>
          <ul
            aria-label={t("listAriaLabel")}
            className="flex items-center -space-x-2"
          >
            {participants.map((participant) => {
              const name = participant.name ?? t("anonymous");
              return (
                <li key={participant.participantId}>
                  <span
                    // `title` for a mouse, the visually-hidden span for a
                    // screen reader: an avatar showing one letter is
                    // meaningless to both without it.
                    title={name}
                    style={{ backgroundColor: participant.color }}
                    className="flex size-8 items-center justify-center rounded-full border-2 border-card text-sm font-semibold text-white shadow-sm"
                  >
                    <span aria-hidden="true">{firstLetter(name)}</span>
                    <span className="sr-only">{name}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function firstLetter(name: string): string {
  // `Intl.Segmenter` rather than `name[0]`: an emoji or an accented
  // grapheme would otherwise be sliced in half.
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(name)][0]?.segment.toUpperCase() ?? "?";
}

/**
 * Turns list changes into something worth saying.
 *
 * Never announces the first list: arriving in a Room where three people are
 * already working is one fact, not three arrivals, and reading it out as
 * three would be the first thing a screen-reader user heard.
 */
function usePresenceAnnouncement(participants: PresentParticipant[]): string {
  const t = useTranslations("Presence");
  const previous = useRef<PresentParticipant[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Toggled to make two identical messages differ at the DOM level —
  // several screen readers won't re-announce a region whose text hasn't
  // visibly changed (the same reason `RoomCanvas.announce` does this).
  const toggle = useRef(false);

  useEffect(() => {
    const before = previous.current;
    previous.current = participants;
    if (before === null) {
      return;
    }
    const { arrived, left } = diffPresence(before, participants);
    const named = (p: PresentParticipant) => p.name ?? t("anonymous");
    const parts = [
      ...arrived.map((p) => t("arrived", { name: named(p) })),
      ...left.map((p) => t("left", { name: named(p) })),
    ];
    if (parts.length === 0) {
      return;
    }
    toggle.current = !toggle.current;
    setAnnouncement(parts.join(" ") + (toggle.current ? "​" : ""));
  }, [participants, t]);

  return announcement;
}
