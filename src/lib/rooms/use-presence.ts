"use client";

import { useEffect, useState } from "react";
import {
  PRESENCE_TICK_MS,
  toPresentParticipants,
  type PresentParticipant,
} from "./presence";

type PresenceApi = {
  track(payload: { participantId: string; name: string | null; lastActivityAt: number }): void;
  state(): Record<string, unknown[]>;
  subscribe(listener: () => void): () => void;
};

/**
 * Who else is in the Room, kept current.
 *
 * Two clocks drive this, and they are not the same thing. The channel tells
 * us when someone joins, leaves or re-broadcasts; a timer tells us when
 * someone we already know about has gone quiet long enough to drop off.
 * Only the first involves any traffic — fading out costs nothing, because an
 * idle Participant simply stops re-tracking and every client works out the
 * rest on its own.
 */
export function usePresence(
  presence: PresenceApi,
  participantId: string,
  displayName: string | null,
): PresentParticipant[] {
  const [participants, setParticipants] = useState<PresentParticipant[]>([]);

  // Broadcast who we are, and again whenever the name changes — which is
  // exactly what happens when the prompt is answered, some seconds after
  // the channel already joined.
  useEffect(() => {
    presence.track({ participantId, name: displayName, lastActivityAt: Date.now() });
  }, [presence, participantId, displayName]);

  useEffect(() => {
    const recompute = () =>
      setParticipants((previous) => {
        const next = toPresentParticipants(presence.state(), participantId, Date.now());
        // Returning the previous array when nothing changed keeps this from
        // re-rendering the overlay on every tick and every unrelated
        // broadcast — this runs every 30s for the life of the Room.
        return sameParticipants(previous, next) ? previous : next;
      });

    recompute();
    const unsubscribe = presence.subscribe(recompute);
    const ticker = setInterval(recompute, PRESENCE_TICK_MS);
    return () => {
      unsubscribe();
      clearInterval(ticker);
    };
  }, [presence, participantId]);

  return participants;
}

function sameParticipants(
  a: readonly PresentParticipant[],
  b: readonly PresentParticipant[],
): boolean {
  // Compares what is drawn, not `lastActivityAt` — a Participant acting
  // again changes their timestamp on every broadcast and changes nothing
  // on screen.
  return (
    a.length === b.length &&
    a.every((p, i) => p.participantId === b[i].participantId && p.name === b[i].name)
  );
}
