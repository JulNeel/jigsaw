"use client";

/**
 * TanStack DB collection registry.
 *
 * `createRoomCollections` is a fully custom `sync`, not
 * `@tanstack/electric-db-collection` — see Story 3.5's Dev Notes for why
 * (Electric Cloud's discontinuation). It syncs exclusively through one
 * Supabase Realtime channel per Room (Architecture AD-1) — never polling,
 * never a second channel.
 *
 * Story 3.8 splits piece position into two collections sharing that one
 * channel: `pieces` (mostly unchanged) and `clusters` (a Cluster's free-
 * floating anchor position). A fused piece's on-screen position is
 * `pieces` joined with `clusters` by `clusterId` — see `pieceRenderPosition`
 * in `room-canvas.tsx`.
 */

import { createCollection } from "@tanstack/db";
import { createClient } from "@/lib/auth/supabase-browser";
import { movePiece, placePiece, rotatePiece } from "@/lib/rooms/piece-actions";
import {
  consumeAndCheckPredictedLock,
  emitPlacementConflict,
} from "@/lib/rooms/placement-conflict-events";
import { emitPiecePlaced } from "@/lib/rooms/piece-placement-events";
import { emitMoveConflict } from "@/lib/rooms/move-conflict-events";
import {
  consumeAndCheckPredictedFusion,
  emitFusionConflict,
} from "@/lib/rooms/predicted-fusion-events";
import {
  emitFrameComplete,
  shouldFireFrameComplete,
} from "@/lib/rooms/frame-completion-events";
import type {
  RoomDetailCluster,
  RoomDetailPiece,
} from "@/lib/rooms/get-room-by-slug";

type PendingVersionWait = { version: number; resolve: () => void };

// A dropped/missed Realtime message (brief disconnect, a piece deleted
// mid-flight) would otherwise leave `awaitVersion`'s promise pending
// forever — the mutation never resolves *or* rolls back, stuck in limbo
// with no user-visible recovery. This timeout rejects instead, which
// `onUpdate` lets propagate — the same "thrown error rolls the optimistic
// change back" path every other failure already goes through.
const AWAIT_VERSION_TIMEOUT_MS = 15000;

export function createRoomCollections({
  roomId,
  initialPieces,
  initialClusters,
  totalPieceCount,
}: {
  roomId: string;
  initialPieces: RoomDetailPiece[];
  initialClusters: RoomDetailCluster[];
  // Story 3.7: `gridRows * gridCols` — the Frame is a fixed rectangle, so
  // this is a constant computed once by the caller (`RoomCanvas`), not
  // something this module derives itself.
  totalPieceCount: number;
}) {
  // Populated by the sync() write handler below, drained whenever a
  // Realtime-confirmed row reaches (or exceeds) the version a pending
  // mutation is waiting for. Keyed by piece id — a piece can only be
  // mid-mutation once at a time from a single client, but a Map of arrays
  // costs nothing and avoids any assumption about that.
  const pendingByPieceId = new Map<string, PendingVersionWait[]>();

  // The version this *same client's own* most recent successful move/place
  // actually produced, keyed by piece id — read from the Server Action's
  // own synchronous return value, never waiting for that write's Realtime
  // confirmation to arrive first. Without this, a second move/place fired
  // on the same piece before its predecessor's confirmation lands would use
  // `mutation.original.version` — which only ever changes once Realtime
  // confirms, never from an optimistic mutation — so it'd carry the exact
  // same (now-stale) version the first write already consumed, and get
  // rejected as `STALE_WRITE` even though nothing but this same client's
  // own prior action changed. Unlike `rotatePiece` (commutative, so it
  // simply never needs `expectedVersion` at all — see its own comment),
  // move/place are position-setting, not order-independent, so a genuine
  // conflict between two *different* Participants must still be rejected —
  // this only patches the false-positive case where the "conflict" is a
  // client racing against its own not-yet-confirmed prior write. Cleared
  // once the real confirmed version catches up (`pieceHandler`, below), so
  // this never grows unbounded or outlives its purpose.
  const ownLastKnownVersionByPieceId = new Map<string, number>();

  // Story 3.6 placement feedback needs to know when a piece's `placed_row`
  // transitions from unset to server-*confirmed*-set — never from an
  // optimistic guess. Seeded from the initial snapshot so an already-placed
  // piece never re-fires on first load; a locked piece never moves again
  // (no un-place mechanic exists anywhere in this app), so this transition
  // can only ever happen once per piece, ever.
  const confirmedPlacedIds = new Set(
    initialPieces.filter((p) => p.placedRow != null).map((p) => p.id),
  );

  // Story 3.7: counts confirmed placements only (the same transition
  // `confirmedPlacedIds` already tracks), never the optimistically-blended
  // count a `useLiveQuery` snapshot would give — the whole Room seeing a
  // false "puzzle complete!" celebration triggered by a since-rejected
  // optimistic placement would be a far louder mistake than one piece's
  // feedback misfiring (Story 3.6's own lesson, one level up). `alreadyComplete
  // AtMount` guarantees a Participant who loads an already-finished Room
  // never sees the celebration replay — only a live incomplete→complete
  // transition observed *during this client's own session* fires it.
  let confirmedPlacedCount = confirmedPlacedIds.size;
  const alreadyCompleteAtMount = confirmedPlacedCount >= totalPieceCount;
  let hasFiredCompletion = false;

  function resolvePending(pieceId: string, version: number) {
    const pending = pendingByPieceId.get(pieceId);
    if (!pending) {
      return;
    }
    const [ready, stillWaiting] = [
      pending.filter((p) => version >= p.version),
      pending.filter((p) => version < p.version),
    ];
    for (const p of ready) {
      p.resolve();
    }
    if (stillWaiting.length > 0) {
      pendingByPieceId.set(pieceId, stillWaiting);
    } else {
      pendingByPieceId.delete(pieceId);
    }
  }

  function awaitVersion(pieceId: string, version: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // `entry` declared first so `timeoutId`'s callback below references
      // an already-fully-defined value, not a forward reference to a
      // binding declared later in the function body (only `entry.resolve`
      // itself still forward-references `timeoutId` — unavoidable given
      // the two need each other — but that's a closure invoked later, well
      // after `timeoutId` is assigned, same as today).
      const entry: PendingVersionWait = {
        version,
        resolve: () => {
          clearTimeout(timeoutId);
          resolve();
        },
      };
      const timeoutId = setTimeout(() => {
        const pending = pendingByPieceId.get(pieceId);
        if (pending) {
          const stillWaiting = pending.filter((p) => p !== entry);
          if (stillWaiting.length > 0) {
            pendingByPieceId.set(pieceId, stillWaiting);
          } else {
            pendingByPieceId.delete(pieceId);
          }
        }
        reject(
          new Error(
            `Timed out waiting for piece ${pieceId} to reach version ${version} via Realtime`,
          ),
        );
      }, AWAIT_VERSION_TIMEOUT_MS);
      const existing = pendingByPieceId.get(pieceId) ?? [];
      existing.push(entry);
      pendingByPieceId.set(pieceId, existing);
    });
  }

  // Both collections' sync() bodies run once each (TanStack DB calls sync
  // per collection), but must share the *same* underlying Realtime channel
  // (AD-1: one channel per Room, not one per collection). The channel is
  // opened lazily by whichever collection's sync() runs first; the second
  // just attaches its own handler to the same channel object.
  let sharedChannel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
  let sharedSupabase: ReturnType<typeof createClient> | null = null;
  let pieceHandler: ((payload: { eventType: string; new: unknown; old: unknown }) => void) | null =
    null;
  let clusterHandler:
    | ((payload: { eventType: string; new: unknown; old: unknown }) => void)
    | null = null;
  // Reference-counted so either collection's cleanup can run first without
  // leaking the channel or removing it out from under the other — whichever
  // of the two `sync()`s runs first opens it via `ensureChannel`, and it's
  // only actually torn down once both have called `releaseChannel`.
  let channelRefCount = 0;

  function ensureChannel() {
    channelRefCount++;
    if (sharedChannel) {
      return;
    }
    sharedSupabase = createClient();
    sharedChannel = sharedSupabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "piece", filter: `room_id=eq.${roomId}` },
        (payload) => pieceHandler?.(payload),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cluster", filter: `room_id=eq.${roomId}` },
        (payload) => clusterHandler?.(payload),
      )
      .subscribe();
  }

  function releaseChannel() {
    channelRefCount--;
    if (channelRefCount <= 0 && sharedSupabase && sharedChannel) {
      sharedSupabase.removeChannel(sharedChannel);
      sharedChannel = null;
      sharedSupabase = null;
    }
  }

  const pieceCollection = createCollection<RoomDetailPiece, string>({
    id: `pieces-${roomId}`,
    getKey: (piece) => piece.id,
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        // Seed from the Server Component's own snapshot (Story 3.1) — no
        // separate initial-fetch round-trip needed.
        begin();
        for (const piece of initialPieces) {
          write({ type: "insert", value: piece });
        }
        commit();
        markReady();

        ensureChannel();
        pieceHandler = (payload) => {
          if (payload.eventType === "DELETE") {
            // Pieces are never deleted in this app (Architecture: no
            // "un-place"/removal mechanic exists anywhere in Epic 3) —
            // handled for completeness, not because it's expected.
            begin();
            write({ type: "delete", key: (payload.old as { id: string }).id });
            commit();
            return;
          }
          const row = payload.new as Record<string, unknown>;
          const piece: RoomDetailPiece = {
            id: row.id as string,
            shapeType: row.shape_type as RoomDetailPiece["shapeType"],
            gridRow: row.grid_row as number,
            gridCol: row.grid_col as number,
            scatterX: row.scatter_x as number,
            scatterY: row.scatter_y as number,
            imageUrl: initialPieces.find((p) => p.id === row.id)?.imageUrl ?? null,
            rotation: row.rotation as number,
            placedRow: row.placed_row as number | null,
            placedCol: row.placed_col as number | null,
            version: row.version as number,
            clusterId: row.cluster_id as string | null,
            clusterOffsetRow: row.cluster_offset_row as number | null,
            clusterOffsetCol: row.cluster_offset_col as number | null,
          };
          begin();
          write({
            type: payload.eventType === "INSERT" ? "insert" : "update",
            value: piece,
          });
          commit();
          resolvePending(piece.id, piece.version);
          // The confirmed version has caught up to (or passed) this
          // client's own last known write — the entry has done its job.
          const ownVersion = ownLastKnownVersionByPieceId.get(piece.id);
          if (ownVersion != null && piece.version >= ownVersion) {
            ownLastKnownVersionByPieceId.delete(piece.id);
          }
          if (piece.placedRow != null && !confirmedPlacedIds.has(piece.id)) {
            confirmedPlacedIds.add(piece.id);
            emitPiecePlaced(piece.id);
            confirmedPlacedCount++;
            if (
              shouldFireFrameComplete({
                confirmedPlacedCountAfterIncrement: confirmedPlacedCount,
                totalPieceCount,
                alreadyCompleteAtMount,
                hasFiredCompletion,
              })
            ) {
              hasFiredCompletion = true;
              emitFrameComplete();
            }
          }
        };

        return () => {
          pieceHandler = null;
          releaseChannel();
        };
      },
    },
    onUpdate: async ({ transaction }) => {
      const mutation = transaction.mutations[0];
      const pieceId = mutation.key as string;
      const changes = mutation.changes as Partial<RoomDetailPiece>;
      // Floors at this client's own last known write for this piece, if
      // more recent than what the optimistic snapshot itself reflects —
      // see `ownLastKnownVersionByPieceId`'s own comment for why.
      const expectedVersion = Math.max(
        mutation.original.version,
        ownLastKnownVersionByPieceId.get(pieceId) ?? 0,
      );
      // Speculatively advance the floor *before* awaiting the Server
      // Action's response — code review fix (2026-09-04, user report: the
      // original version of this fix "ne semble pas fonctionner"). Setting
      // it only *after* a successful response left the exact same race
      // unfixed whenever two actions on the same piece fire close enough
      // together that the second's `onUpdate` reads this map before the
      // first's own response has come back — each `.update()` call starts
      // its own independent direct-op transaction immediately (TanStack
      // DB), so two rapid actions race each other, not just the eventual
      // Realtime confirmation. Every successful place/move/rotate
      // increments the row's `version` by exactly 1 server-side, so
      // `expectedVersion + 1` is the correct speculative next value —
      // rolled back below if *this* action turns out to fail, so a
      // genuine rejection doesn't poison a later action's floor with a
      // wrong guess.
      const speculativeVersion = expectedVersion + 1;
      ownLastKnownVersionByPieceId.set(pieceId, speculativeVersion);
      // Recorded before dispatch so the failure branch below knows which
      // Server Action this was without re-deriving it from `changes` a
      // second time (`changes.placedRow`/`changes.rotation` haven't been
      // read yet at that point structurally, but keeping the branch
      // decision in one place — here — is simpler than repeating the same
      // three-way check twice).
      const isMove = changes.placedRow == null && changes.rotation === undefined;

      let result;
      if (changes.placedRow != null) {
        result = await placePiece({
          pieceId,
          targetRow: changes.placedRow,
          targetCol: mutation.modified.placedCol!,
          // The raw drop point — used only as the fallback resting position
          // if locking into the Frame doesn't validate (never rejected
          // outright, see `placePiece`'s Dev Notes).
          x: mutation.modified.scatterX,
          y: mutation.modified.scatterY,
          expectedVersion,
        });
      } else if (changes.rotation !== undefined) {
        // No `expectedVersion` here — `rotatePiece` is a commutative,
        // order-independent `+90°` server-side increment specifically so
        // that two rotations racing (a fast double-click before the first's
        // own Realtime confirmation arrives, or two Participants rotating
        // the same piece at once) both always apply, instead of the second
        // being rejected as a false conflict. See its own comment.
        result = await rotatePiece({ pieceId });
      } else {
        result = await movePiece({
          pieceId,
          x: mutation.modified.scatterX,
          y: mutation.modified.scatterY,
          expectedVersion,
        });
      }

      if (!result.success) {
        // This action's own speculative bump above was wrong — remove it,
        // but only if nothing newer has since replaced it (a later,
        // still-in-flight action's own speculative value must not be
        // clobbered by an earlier action failing after it). A subsequent
        // action then falls back to whatever this map (or the confirmed
        // collection) next actually knows to be true, instead of chaining
        // off a guess that just proved incorrect.
        if (ownLastKnownVersionByPieceId.get(pieceId) === speculativeVersion) {
          ownLastKnownVersionByPieceId.delete(pieceId);
        }
        // Tells `ClusterGroupSprite`'s `optimisticAnchor` (if this piece is
        // a Cluster's representative member) to stop trusting its guess
        // immediately — see `move-conflict-events.ts`'s own comment for why
        // this explicit signal replaced an earlier data-comparison guess.
        if (isMove) {
          emitMoveConflict(pieceId);
        }
        // AD-6: the optimistic local mutation is simply abandoned — no
        // automatic retry that would overwrite server state — and the next
        // Realtime event for this piece (already in flight regardless)
        // brings the UI back to the true confirmed state. Nothing else to
        // do here; the thrown error is what tells TanStack DB to roll the
        // optimistic change back.
        throw new Error(result.error.code);
      }

      // Story 3.11 AC #4: fires only when the client's own prediction
      // (`predictFrameLock`) said this specific piece would lock, and the
      // server's own re-validation disagreed anyway (`result.placed ===
      // false`) — a genuine concurrent conflict, something changed between
      // the client's snapshot and the server's transaction. Code review fix
      // (2026-09-02): `changes.placedRow != null` alone is not that signal —
      // `placedRow` is set optimistically on *every* Frame-slot drop
      // regardless of prediction (AC #3 requires the server always gets a
      // real chance to lock it in), so `result.placed === false` is the
      // ordinary, frequent outcome of a predicted-invalid drop too, not just
      // a rare race. `consumeAndCheckPredictedLock` is the actual "did the
      // client expect this to work" signal, recorded by `predictFrameLock`'s
      // caller at drag-end — see `placement-conflict-events.ts`.
      //
      // Code review fix (2026-09-02): this used to be the third operand of
      // one `&&` chain (`changes.placedRow != null && result.placed ===
      // false && consumeAndCheckPredictedLock(pieceId)`) — `&&`
      // short-circuits, so on `result.placed === true` (every ordinary
      // *successful* lock, the common case) the registry entry for this
      // piece was never consumed at all, leaking one entry per successful
      // predicted-valid placement for the lifetime of the tab. Consuming it
      // unconditionally whenever a Frame-slot drop was attempted — success
      // or failure — drains the registry every time, regardless of outcome.
      const wasPredictedLock = changes.placedRow != null && consumeAndCheckPredictedLock(pieceId);
      if (wasPredictedLock && result.placed === false) {
        emitPlacementConflict();
      }

      // Story 3.13: the analogous "did the client expect this to work"
      // check for a predicted-genuine fusion — `consumeAndCheckPredictedFusion`
      // is drained unconditionally (same "success or failure, every time"
      // reasoning as `wasPredictedLock` just above), and only a genuine
      // disagreement (predicted a fusion, `result.fused === false`) tells
      // `room-canvas.tsx` to stop trusting its optimistic grouping.
      const predictedFusionTempClusterId = consumeAndCheckPredictedFusion(pieceId);
      if (predictedFusionTempClusterId && result.fused === false) {
        emitFusionConflict(predictedFusionTempClusterId);
      }

      // AD-1's core rule: never resolve from the Server Action's own
      // return value directly — wait for the Realtime-confirmed write to
      // actually arrive through sync() above.
      await awaitVersion(pieceId, result.version);
    },
  });

  // Read-only from the client's perspective: nothing ever calls `.update()`
  // on this collection directly — dragging a Cluster calls the same
  // `movePiece`/`placePiece` Server Actions (any member's id works) that
  // `pieceCollection`'s `onUpdate` already awaits confirmation through;
  // this collection only exists so components can read a Cluster's anchor
  // reactively once that write lands via Realtime.
  const clusterCollection = createCollection<RoomDetailCluster, string>({
    id: `clusters-${roomId}`,
    getKey: (cluster) => cluster.id,
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        begin();
        for (const cluster of initialClusters) {
          write({ type: "insert", value: cluster });
        }
        commit();
        markReady();

        ensureChannel();
        clusterHandler = (payload) => {
          if (payload.eventType === "DELETE") {
            begin();
            write({ type: "delete", key: (payload.old as { id: string }).id });
            commit();
            return;
          }
          const row = payload.new as Record<string, unknown>;
          const cluster: RoomDetailCluster = {
            id: row.id as string,
            anchorX: row.anchor_x as number,
            anchorY: row.anchor_y as number,
            version: row.version as number,
          };
          begin();
          write({
            type: payload.eventType === "INSERT" ? "insert" : "update",
            value: cluster,
          });
          commit();
        };

        return () => {
          clusterHandler = null;
          releaseChannel();
        };
      },
    },
  });

  return { pieceCollection, clusterCollection };
}
