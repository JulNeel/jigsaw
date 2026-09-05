"use client";

// Story 3.13's own analogue of `placement-conflict-events.ts`'s
// `markPredictedLock`/`consumeAndCheckPredictedLock`/`emitPlacementConflict`
// trio, for the optimistic-fusion case. `collections.ts`'s `onUpdate` has no
// visibility into what `room-canvas.tsx` predicted at drag-end — the
// optimistic mutation only ever carries domain fields (`scatterX`/`scatterY`),
// never prediction metadata — so this bridges the two, the same
// module-level pub-sub idiom used throughout this codebase.

// Keyed by piece id, storing the *temporary* local Cluster id
// `room-canvas.tsx` optimistically grouped this piece under — consumed
// (read-and-deleted) exactly once by the matching `onUpdate` call, mirroring
// `consumeAndCheckPredictedLock`'s own "unconditionally drain the registry
// every time, success or failure" fix (2026-09-02).
const predictedFusionByPieceId = new Map<string, string>();

export function markPredictedFusion(pieceId: string, tempClusterId: string): void {
  predictedFusionByPieceId.set(pieceId, tempClusterId);
}

// Returns `null` if this piece's drop was never marked as a predicted
// fusion (e.g. an ordinary move, or a Frame-slot drop — those predict a
// lock instead, never a fusion).
export function consumeAndCheckPredictedFusion(pieceId: string): string | null {
  const tempClusterId = predictedFusionByPieceId.get(pieceId) ?? null;
  predictedFusionByPieceId.delete(pieceId);
  return tempClusterId;
}

// Fired when a piece's `movePiece` (or `placePiece`'s own fallback) result
// comes back with `fused: false` despite the client having predicted
// "genuine" — a real, rare disagreement between prediction and server
// re-validation (same class of event as `placement-conflict-events.ts`'s
// `emitPlacementConflict`, but scoped to a specific temporary Cluster id
// since, unlike a Frame-lock conflict, this needs to reach the exact
// component instance rendering that optimistic grouping).
const listeners = new Set<(tempClusterId: string) => void>();

export function emitFusionConflict(tempClusterId: string): void {
  for (const listener of listeners) {
    listener(tempClusterId);
  }
}

export function subscribeFusionConflict(listener: (tempClusterId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
