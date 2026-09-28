"use client";

// Fires when *this* client's own placement or fusion is accepted by the
// server. Same module-level pub-sub idiom as `piece-placement-events.ts`
// and `move-conflict-events.ts`, and deliberately not the same event:
// `subscribePiecePlaced` fires for every Participant's confirmed placement,
// which is exactly what Story 4.3 must not count. "Have *you* contributed
// this session" has to mean you.
//
// Emitted from `collections.ts`'s `onUpdate`, the one place that sees this
// client's own Server Action result — and therefore knows whether the drop
// actually placed or fused rather than merely moved a piece around the mat.
const listeners = new Set<() => void>();

export function emitOwnContribution(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeOwnContribution(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
