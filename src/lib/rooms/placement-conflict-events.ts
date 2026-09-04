"use client";

// A tiny, decoupled event channel bridging `collections.ts`'s `onUpdate`
// (which has no natural way to reach React state) and `RoomCanvas`'s toast/
// `aria-live` surface for Story 3.11's AC #4 — the rare "client predicted a
// lock, the server's own re-validation disagreed" case (a genuine
// concurrent conflict, never an ordinary predicted-invalid drop). Same
// module-level pub-sub idiom as `use-sound-muted.ts`'s listener set, not a
// general-purpose event bus — this only ever carries this one signal.
const listeners = new Set<() => void>();

export function emitPlacementConflict(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribePlacementConflict(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Bridges `predictFrameLock`'s result (computed in `room-canvas.tsx`, at
// drag-end) to `collections.ts`'s `onUpdate` (which has no visibility into
// what the client predicted — the optimistic mutation only ever carries
// domain fields, never prediction metadata). Fixed by code review
// (2026-09-02): without this, `placePiece` returning `placed: false` was
// being treated as a "genuine conflict" for *every* ordinary invalid drop
// (predicted-invalid ones included), not just the rare case where the
// client's own prediction said it should have worked. Keyed by piece id,
// consumed (read-and-deleted) exactly once by the matching `onUpdate` call
// — never left to accumulate.
const predictedLockByPieceId = new Map<string, boolean>();

export function markPredictedLock(pieceId: string, predicted: boolean): void {
  predictedLockByPieceId.set(pieceId, predicted);
}

// Defaults to `false` (no toast) if never marked — e.g. a drop far from any
// Frame slot never calls `predictFrameLock` at all. Erring toward silence
// over a false "someone beat you to it" narrative.
export function consumeAndCheckPredictedLock(pieceId: string): boolean {
  const predicted = predictedLockByPieceId.get(pieceId) ?? false;
  predictedLockByPieceId.delete(pieceId);
  return predicted;
}
