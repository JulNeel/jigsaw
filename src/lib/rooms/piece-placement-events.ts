"use client";

// A tiny, decoupled event channel bridging `collections.ts`'s Realtime
// sync handler (the only place that ever sees a *server-confirmed*
// placement, never an optimistic guess) and `RoomCanvas`'s placement
// feedback (Story 3.6: sound, haptic, micro-animation, `aria-live`
// announcement). Fixed by code review (2026-09-02): the original Story 3.6
// implementation detected "newly placed" by diffing the optimistically-
// blended `pieces` snapshot, which fired feedback for ordinary invalid
// drops too (any drop near a slot sets `placedRow` optimistically, whether
// or not the server ends up locking it in) — this event only ever fires
// once a `piece` row's `placed_row` is confirmed non-null via Realtime, so
// it can only ever mean a genuine, successful lock. Same module-level
// pub-sub idiom as `use-sound-muted.ts`'s listener set / `placement-
// conflict-events.ts`, not a general-purpose event bus.
const listeners = new Set<(pieceId: string) => void>();

export function emitPiecePlaced(pieceId: string): void {
  for (const listener of listeners) {
    listener(pieceId);
  }
}

export function subscribePiecePlaced(listener: (pieceId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The acting Participant's own sprite plays the success chime and pulse
// *instantly*, from `predictFrameLock`'s prediction, at drag-end — not from
// this confirmed event (2026-09-02, user feedback: "the sound should play
// immediately on release"). But AC #5 still requires every *other*
// Participant present to see/hear it too, and they have no prediction to go
// on — only this confirmed event ever reaches them. So the confirmed
// handler must still play the chime/pulse, *unless* it's the piece this
// same client already showed it for instantly — tracked here, per piece id,
// consumed (read-and-deleted) exactly once. A client that never called
// `predictFrameLock` for this piece (every remote Participant, always) never
// marks it, so their confirmed handler always fires normally.
const instantFeedbackShownByPieceId = new Set<string>();

export function markInstantPlacementFeedbackShown(pieceId: string): void {
  instantFeedbackShownByPieceId.add(pieceId);
}

export function consumeAndCheckInstantPlacementFeedbackShown(pieceId: string): boolean {
  const alreadyShown = instantFeedbackShownByPieceId.has(pieceId);
  instantFeedbackShownByPieceId.delete(pieceId);
  return alreadyShown;
}
