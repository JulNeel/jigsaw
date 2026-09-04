"use client";

// A tiny, decoupled event channel bridging `collections.ts`'s `onUpdate`
// (which has no natural way to reach React state) and `ClusterGroupSprite`'s
// own `optimisticAnchor` — the signal that a specific piece's `movePiece`
// attempt was just rejected (`STALE_WRITE` or otherwise), so whichever
// component is optimistically guessing that piece's position can stop
// trusting that guess immediately, rather than waiting for (or misreading)
// a Realtime confirmation. Same module-level pub-sub idiom as
// `placement-conflict-events.ts` — carries a `pieceId` here since, unlike a
// Frame-lock conflict (always resolved via a single shared toast), this
// needs to reach the *specific* component instance rendering that piece.
//
// Code review fix (2026-09-05, user report: dragging the same Cluster
// repeatedly made it visibly "replay" through each intermediate position
// afterward). `optimisticAnchor`'s guard used to also compare the
// representative member's live `scatterX`/`scatterY` against the value the
// *latest* drag expected — but an *earlier*, already-superseded drag's own
// confirmed row arriving via Realtime (a normal, harmless event, not a
// failure) has different scatter values too, and briefly failed that
// comparison just the same as a genuine rejection would — falling back to
// the (at that instant, stale-intermediate) confirmed anchor for a frame,
// then repeating for every earlier drag's own confirmation as each one
// arrived. This event replaces that data-comparison guess with an explicit,
// unambiguous signal for the one case it actually needs to react to.
const listeners = new Set<(pieceId: string) => void>();

export function emitMoveConflict(pieceId: string): void {
  for (const listener of listeners) {
    listener(pieceId);
  }
}

export function subscribeMoveConflict(listener: (pieceId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
