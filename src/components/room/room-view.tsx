"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { RoomDetail } from "@/lib/rooms/get-room-by-slug";
import { RoomCanvasClient } from "@/components/canvas/room-canvas-loader";
import type { RoomCanvasHandle } from "@/components/canvas/room-canvas";
import { RecenterButton } from "@/components/canvas/recenter-button";
import { SoundMuteButton } from "@/components/canvas/sound-mute-button";
import { ReferenceImageButton } from "@/components/canvas/reference-image-button";
import { HighlightFramePiecesButton } from "@/components/canvas/highlight-frame-pieces-button";
import { FirstAccessTutorial } from "@/components/room/first-access-tutorial";
import { NamePrompt } from "@/components/room/name-prompt";
import {
  getSafeLocalStorage,
  loadDisplayName,
  loadOrCreateParticipantId,
  saveDisplayName,
} from "@/lib/rooms/participant-identity";

function subscribeNoop() {
  // `localStorage` never changes out from under this component on its own:
  // the only writer is this component's own submit handler, which updates
  // React state in the same breath. Same reasoning as the tutorial's.
  return () => {};
}

/**
 * The identity this browser plays under, read once.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState`, for the
 * reason `first-access-tutorial.tsx` documents at length: it is the
 * React-blessed way to read a browser-only API across SSR and hydration.
 * The server snapshot reports a name (so nothing renders a prompt during
 * SSR or the first hydration render) and an empty id (never used server
 * side — the canvas mounts client-only behind `ssr: false`).
 */
function useStoredIdentity(): { participantId: string; storedName: string | null } {
  const participantId = useSyncExternalStore(
    subscribeNoop,
    () => loadOrCreateParticipantId(getSafeLocalStorage()),
    () => "",
  );
  const storedName = useSyncExternalStore(
    subscribeNoop,
    () => loadDisplayName(getSafeLocalStorage()),
    () => "",
  );
  return { participantId, storedName };
}

// Coordinates the "once the Canvas loads" part of AC #1 (Story 3.2): the
// Canvas and the tutorial are siblings under the Server Component `RoomPage`,
// so this small Client Component is where the "canvas ready" signal actually
// crosses from one to the other. Also holds the ref (Story 3.4) that lets
// the always-visible recenter button trigger `RoomCanvas`'s own imperative
// `recenter()` without lifting its pan/zoom state up to this level.
export function RoomView({
  room,
  roomSlug,
  isGuest,
  accountPseudo,
}: {
  room: RoomDetail;
  roomSlug: string;
  isGuest: boolean;
  /** Chosen at sign-up. Present means never asking again in a Room. */
  accountPseudo: string | null;
}) {
  const [canvasReady, setCanvasReady] = useState(false);
  const canvasRef = useRef<RoomCanvasHandle>(null);
  // Story 3.16: lifted here, not internal to `RoomCanvas` — unlike
  // `recenter()`'s one-shot imperative call, this button's own styling must
  // reflect the current on/off state, which a plain prop handles more
  // simply than extending the imperative-handle pattern with a getter.
  const [highlightFramePieces, setHighlightFramePieces] = useState(false);

  // Story 4.1. `chosenName` is this visit's answer; `storedName` is what a
  // previous visit left behind. Skipping sets the answer to `null` without
  // writing anything, so the prompt stays closed for this visit and asks
  // again next time — a skip is "not now", not "never".
  const { participantId, storedName } = useStoredIdentity();
  const [chosenName, setChosenName] = useState<string | null | undefined>(undefined);
  const [tutorialResolved, setTutorialResolved] = useState(!isGuest);
  const handleTutorialResolved = useCallback(() => setTutorialResolved(true), []);

  // An account's pseudo wins over anything this browser remembers: it is the
  // one the person deliberately chose for themselves, and it follows them to
  // any device. A locally-stored name is what a Guest has instead — and what
  // a Participant who signed up before the field existed still has.
  const displayName =
    accountPseudo ?? (chosenName !== undefined ? chosenName : storedName);
  const namePromptOpen =
    canvasReady &&
    tutorialResolved &&
    !accountPseudo &&
    chosenName === undefined &&
    !storedName;

  return (
    <>
      <RoomCanvasClient
        ref={canvasRef}
        room={room}
        onReady={() => setCanvasReady(true)}
        highlightFramePieces={highlightFramePieces}
        participantId={participantId}
        displayName={displayName}
      />
      <RecenterButton
        onClick={() => canvasRef.current?.recenter()}
        disabled={!canvasReady}
      />
      <SoundMuteButton />
      <ReferenceImageButton referenceImageUrl={room.referenceImageUrl} />
      <HighlightFramePiecesButton
        active={highlightFramePieces}
        onToggle={() => setHighlightFramePieces((value) => !value)}
      />
      {isGuest && (
        <FirstAccessTutorial
          roomSlug={roomSlug}
          canvasReady={canvasReady}
          onResolved={handleTutorialResolved}
        />
      )}
      <NamePrompt
        open={namePromptOpen}
        onSubmit={(name) => {
          saveDisplayName(name, getSafeLocalStorage());
          setChosenName(name);
        }}
        onSkip={() => setChosenName(null)}
      />
    </>
  );
}
