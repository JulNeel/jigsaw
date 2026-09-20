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

/** One predicted-fusion member's own live row, as far as this client knows it. */
export type PredictedFusionMemberState = {
  clusterId: string | null;
  placedRow: number | null;
};

/**
 * Whether an optimistic fusion prediction has been overtaken by real data and
 * can be dropped — `room-canvas.tsx`'s own exit condition, extracted here as a
 * pure predicate for the same reason `shouldFireFrameComplete` was: the rule is
 * subtle, it is the whole correctness of the feature, and it belongs under test
 * rather than inline in a 2000-line component.
 *
 * A prediction has exactly two ways to come true, matching the server's own
 * outcomes for a drop that genuinely made contact:
 *
 * - **fused** — every member now agrees on one real Cluster id, and that
 *   Cluster's own row has actually arrived (`loadedClusterIds`). Realtime has
 *   caught up, so the synthetic grouping this predicted now exists for real.
 * - **placed** — the merged group was locked into the Frame by contagion
 *   instead (Story 3.19). That path sets every member's `placed_row` and
 *   clears `cluster_id`, so the "one shared non-null Cluster id" test above can
 *   never become true for it.
 *
 * Missing that second outcome was a real bug (2026-09-18): the prediction
 * survived for the rest of the session, kept those now-locked pieces rendering
 * inside a synthetic, still-draggable Îlot, and every drag on them came back
 * `ALREADY_PLACED` — the piece snapping back to its slot every single time,
 * with only a page reload to clear it. A *rejected* prediction is not this
 * function's job: that arrives as an explicit `emitFusionConflict` signal.
 */
export function isPredictedFusionConfirmed({
  memberStates,
  loadedClusterIds,
}: {
  // `undefined` for a member whose own row this client hasn't synced yet —
  // never confirm on incomplete knowledge, just keep waiting.
  memberStates: readonly (PredictedFusionMemberState | undefined)[];
  loadedClusterIds: ReadonlySet<string>;
}): boolean {
  if (memberStates.length === 0) {
    return false;
  }
  if (memberStates.every((m) => m?.placedRow != null)) {
    return true;
  }
  const realClusterIds = new Set(memberStates.map((m) => m?.clusterId ?? null));
  return (
    realClusterIds.size === 1 &&
    !realClusterIds.has(null) &&
    loadedClusterIds.has([...realClusterIds][0]!)
  );
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
