"use client";

// A tiny, decoupled event channel bridging `collections.ts`'s Realtime sync
// handler (the only place that ever sees a *server-confirmed* placed-piece
// count, never an optimistic guess) and `RoomCanvas`'s Frame-completion
// celebration (Story 3.7: victory sound, full-Frame glow, `aria-live`
// announcement). Same module-level pub-sub idiom as `piece-placement-
// events.ts`/`placement-conflict-events.ts` — no payload needed, since
// there's only ever one Frame per Room, and this can only ever fire once.
const listeners = new Set<() => void>();

export function emitFrameComplete(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeFrameComplete(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Pure decision extracted from `collections.ts`'s Realtime handler so the
// "fire exactly once, ever" invariant — this feature's single highest-stakes
// piece of logic — has direct unit test coverage, rather than only being
// exercisable through a full Realtime-wired collection. Mirrors the call
// site's own three guards: a Room already complete at mount never replays
// the celebration for a late joiner, and a Room that already fired this
// session never fires twice no matter how many more confirmed rows arrive
// (e.g. a burst of several pieces confirming in the same tick).
export function shouldFireFrameComplete({
  confirmedPlacedCountAfterIncrement,
  totalPieceCount,
  alreadyCompleteAtMount,
  hasFiredCompletion,
}: {
  confirmedPlacedCountAfterIncrement: number;
  totalPieceCount: number;
  alreadyCompleteAtMount: boolean;
  hasFiredCompletion: boolean;
}): boolean {
  return (
    !alreadyCompleteAtMount &&
    !hasFiredCompletion &&
    confirmedPlacedCountAfterIncrement >= totalPieceCount
  );
}
