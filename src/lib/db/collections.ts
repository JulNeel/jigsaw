"use client";

/**
 * TanStack DB collection registry.
 *
 * `createRoomCollections` is a fully custom `sync`, not
 * `@tanstack/electric-db-collection` — see Story 3.5's Dev Notes for why
 * (Electric Cloud's discontinuation). Live updates arrive through one
 * Supabase Realtime channel per Room (Architecture AD-1) — never polling,
 * never a second channel.
 *
 * Amended 2026-09-20: that channel is no longer treated as infallible. It
 * can stop delivering while still reporting itself SUBSCRIBED, leaving a
 * client silently stuck on a stale view with no way to notice — measured,
 * not assumed (`e2e/realtime-gap.e2e.ts`). `resyncRoom` re-reads the Room
 * and folds it back through the same write path, on the three occasions
 * this client can tell its own view is wrong. Still no polling and still no
 * second channel: these are plain reads, triggered by events, never a timer.
 *
 * Story 3.8 splits piece position into two collections sharing that one
 * channel: `pieces` (mostly unchanged) and `clusters` (a Cluster's free-
 * floating anchor position). A fused piece's on-screen position is
 * `pieces` joined with `clusters` by `clusterId` — see `pieceRenderPosition`
 * in `room-canvas.tsx`.
 */

import { createCollection } from "@tanstack/db";
import { createResyncScheduler } from "./resync-scheduler";
import { createClient } from "@/lib/auth/supabase-browser";
import { movePiece, rotatePiece } from "@/lib/rooms/piece-actions";
import { fetchRoomState } from "@/lib/rooms/room-state";
import type { PresencePayload } from "@/lib/rooms/presence";
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
  participantId,
  initialPieces,
  initialClusters,
  totalPieceCount,
}: {
  roomId: string;
  // Story 4.1: the Realtime *presence key*, which is what makes a reconnect
  // replace this browser's entry instead of adding a second one. Needed at
  // channel-creation time, which is why it comes in here rather than being
  // handed to `presence.track()` later along with the name.
  participantId: string;
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

  // The highest version this client has seen *confirmed* for each piece.
  //
  // Not derivable from the collection: while a mutation is pending, TanStack
  // DB overlays the optimistic value, and that value carries the version the
  // row had *before* the write. Reading `version` back from the collection
  // during a pending mutation therefore reports the pre-move number even
  // though the synced row has already advanced — which is exactly the state
  // `awaitVersion` has to be able to interrogate.
  //
  // It is also the high-water mark `writePieceRow` refuses to go back below,
  // so a row delivered out of order cannot overwrite a newer one. Seeded from
  // the page-load snapshot rather than left empty, so that guard covers the
  // first event a piece receives too — a stale row buffered across a
  // reconnect would otherwise be applied unchallenged.
  const confirmedVersionByPieceId = new Map(initialPieces.map((p) => [p.id, p.version]));

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
    const known = confirmedVersionByPieceId.get(pieceId) ?? -1;
    if (version > known) {
      confirmedVersionByPieceId.set(pieceId, version);
    }
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
    // Level-triggered, not edge-triggered. The confirmation this is about to
    // wait for may already have arrived: the Realtime event is pushed
    // straight out of Postgres on an open socket, while the Server Action's
    // response — whose `result.version` is what names the target here — has
    // to travel back from the app server. Deployed, those two paths are
    // comparable and the event frequently wins; on `next dev` over loopback
    // it essentially never does, which is why this only ever showed up away
    // from a local machine (`e2e/response-after-event.e2e.ts`).
    //
    // Subscribing to an event already consumed used to mean waiting the full
    // AWAIT_VERSION_TIMEOUT_MS for nothing, and — far worse than a stalled
    // promise — the mutation stayed pending, so the collection kept serving
    // the optimistic row and its *pre-move* version. The next drag then sent
    // that stale `expectedVersion`, was rejected as STALE_WRITE, and the
    // piece snapped back.
    const confirmed = confirmedVersionByPieceId.get(pieceId);
    if (confirmed != null && confirmed >= version) {
      return Promise.resolve();
    }
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
        // Before giving up, go and look. This write very often *did* land —
        // the channel simply stopped delivering — and in that case rolling
        // the optimistic move back would throw away a correct write and jump
        // the piece home to a stale position, which is exactly the bug this
        // exists to stop. `resyncRoom` folds the true row through the normal
        // path, so if the version did arrive, `entry.resolve` has already run
        // and been removed from the pending list by the time we look.
        void resyncRoom().finally(() => {
          const pending = pendingByPieceId.get(pieceId);
          if (!pending?.includes(entry)) {
            return;
          }
          const stillWaiting = pending.filter((p) => p !== entry);
          if (stillWaiting.length > 0) {
            pendingByPieceId.set(pieceId, stillWaiting);
          } else {
            pendingByPieceId.delete(pieceId);
          }
          reject(
            new Error(
              `Timed out waiting for piece ${pieceId} to reach version ${version} via Realtime`,
            ),
          );
        });
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

  // Story 4.1 — presence rides this same channel, never a second one (NFR5 /
  // AD-1). Supabase multiplexes it over the socket that already exists, so
  // "no separate real-time channel" holds structurally rather than by
  // promise. Nothing about presence is persisted: it lives here and dies
  // with the session.
  let presencePayload: PresencePayload | null = null;
  let channelJoined = false;
  const presenceListeners = new Set<() => void>();

  // Story 4.2 — the Room's history is append-only, so it needs none of the
  // machinery the piece and cluster collections carry. There is no update to
  // reconcile, no version to compare, and therefore none of the out-of-order
  // hazard that shaped those two: a row either arrives or it does not, and a
  // missed one is recovered by the panel's own next read. A plain listener
  // is the whole requirement.
  const contributionListeners = new Set<(row: Record<string, unknown>) => void>();

  function notifyPresenceListeners() {
    for (const listener of presenceListeners) {
      listener();
    }
  }

  // Presence broadcasts to every subscriber in the Room, so a drag-heavy
  // session would chatter without this. The exact cadence does not matter —
  // the window it feeds is five minutes.
  const PRESENCE_TRACK_THROTTLE_MS = 5_000;
  let lastPresencePushAt = 0;

  function pushPresence() {
    // `track()` is only meaningful once joined; before that the payload is
    // kept and sent by the subscribe callback below.
    if (channelJoined && sharedChannel && presencePayload) {
      lastPresencePushAt = Date.now();
      void sharedChannel.track(presencePayload);
    }
  }

  // A tab that was hidden — backgrounded, the laptop asleep — is where a
  // connection most often dies without saying so. Reconciling on the way
  // back costs nothing while the tab is in use, and there is no polling: it
  // fires on a user action, not a timer.
  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      void resyncRoom();
    }
  }

  function ensureChannel() {
    channelRefCount++;
    if (sharedChannel) {
      return;
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    sharedSupabase = createClient();
    sharedChannel = sharedSupabase
      // The presence key has to be fixed at creation — hence `participantId`
      // being a parameter of this factory.
      .channel(`room-${roomId}`, { config: { presence: { key: participantId } } })
      .on("presence", { event: "sync" }, notifyPresenceListeners)
      .on("presence", { event: "join" }, notifyPresenceListeners)
      .on("presence", { event: "leave" }, notifyPresenceListeners)
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
      // A third table on the same channel. AD-1 forbids a second *channel*,
      // not a second table — `piece` and `cluster` already share this one.
      // INSERT only: a contribution is never updated in a way anyone reads
      // (Story 4.3 back-fills `user_id`, which no line displays) and never
      // deleted except with its Room.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contribution", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          for (const listener of contributionListeners) {
            listener(row);
          }
        },
      )
      // **The status callback is not a health check, and must not become
      // one.** A dead subscription still reports SUBSCRIBED (measured — see
      // `resyncRoom`), so nothing here is worth reacting to as a signal that
      // the channel works. Recovery is still driven entirely by the
      // detectors that do work. It exists for exactly one reason: `track()`
      // is only meaningful once the channel has joined, so this is where a
      // payload recorded before that gets sent.
      .subscribe((status) => {
        const joined = status === "SUBSCRIBED";
        if (joined && !channelJoined) {
          channelJoined = true;
          pushPresence();
        } else if (!joined) {
          channelJoined = false;
        }
      });
  }

  function releaseChannel() {
    channelRefCount--;
    if (channelRefCount <= 0 && sharedSupabase && sharedChannel) {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      channelJoined = false;
      sharedSupabase.removeChannel(sharedChannel);
      sharedChannel = null;
      sharedSupabase = null;
    }
  }

  // One path for a piece row, whether it arrived by Realtime or by a
  // reconciliation read. Extracted so a resync cannot quietly diverge from
  // live sync — the placement chime, the frame-completion check and the
  // pending-write bookkeeping all have to happen either way.
  let writePieceRow:
    | ((row: Record<string, unknown>, isInsert: boolean) => void)
    | null = null;

  function applyPieceRow(row: Record<string, unknown>, isInsert: boolean) {
    writePieceRow?.(row, isInsert);
  }

  // Reconciliation: re-read the Room and fold it back through the very same
  // path a Realtime event takes.
  //
  // Needed because the channel can stop delivering while still reporting
  // itself SUBSCRIBED — observed, not theorised (`e2e/realtime-gap.e2e.ts`).
  // There is no error to listen for and no reconnect to hook, so the only
  // workable detectors are the moments this client can tell *on its own*
  // that its view is wrong: a write of its own that never comes back
  // confirmed, a write rejected as STALE_WRITE (the server knows something
  // this client does not), and the tab becoming visible again — the point
  // where a sleeping connection has most likely died unnoticed.
  //
  // Without it the failure is self-sustaining: a rejected write produces no
  // Realtime event either, so nothing ever repairs the stale version that
  // caused the rejection, and only a page reload recovers. That closed loop
  // is the "une pièce revient systématiquement à sa place" report.
  //
  // Concurrent repairs are collapsed by `createResyncScheduler` rather than
  // by a plain in-flight check, because every caller here asks *because it
  // has just found its own view wrong* — so being handed a read whose
  // snapshot predates that discovery answers the wrong question. See that
  // module for the timeline.
  const resyncRoom = createResyncScheduler(() =>
    fetchRoomState(roomId)
      .then(({ pieces, clusters }) => {
        // Clusters first: a piece whose Cluster row hasn't landed yet is
        // excluded from rendering entirely, so the other order would blink
        // those pieces out for a frame.
        replaceClusters?.(clusters);
        for (const row of pieces) {
          applyPieceRow(row, false);
        }
      })
      .catch(() => {
        // A failed repair is not worth surfacing: every trigger recurs (the
        // next rejected write, the next time the tab is focused), and the
        // caller's own error is the one the user needs to see.
      }),
  );

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

        writePieceRow = (row, isInsert) => {
          const piece: RoomDetailPiece = {
            id: row.id as string,
            shapeType: row.shape_type as RoomDetailPiece["shapeType"],
            gridRow: row.grid_row as number,
            gridCol: row.grid_col as number,
            scatterX: row.scatter_x as number,
            scatterY: row.scatter_y as number,
            // Signed tile URLs are minted server-side per page load and are
            // not in the row, so they carry over from the initial snapshot
            // either way.
            imageUrl: initialPieces.find((p) => p.id === row.id)?.imageUrl ?? null,
            rotation: row.rotation as number,
            placedRow: row.placed_row as number | null,
            placedCol: row.placed_col as number | null,
            version: row.version as number,
            clusterId: row.cluster_id as string | null,
            clusterOffsetRow: row.cluster_offset_row as number | null,
            clusterOffsetCol: row.cluster_offset_col as number | null,
          };
          // Older than what this client has already applied — drop it.
          //
          // One drag of a loose piece writes its row *twice*: `repositionPlain`
          // sets `scatter_x`/`scatter_y` in one statement and bumps `version`
          // in the next, so Postgres replicates two row changes for a single
          // gesture, carrying versions N and N+1. Delivered in order that is
          // harmless. Delivered swapped — measured, 8ms apart, on a real
          // channel — the last one applied is the *pre-bump* row, and the
          // collection is left holding version N for good.
          //
          // That is not a cosmetic lag. The client's cached version stays one
          // behind the server's, so the next drag sends a stale
          // `expectedVersion`, is rejected as STALE_WRITE, and the piece is
          // rolled back onto the position the server already moved it away
          // from — the "une pièce revient systématiquement à sa place" report,
          // and the exact failure `e2e/out-of-order-events.e2e.ts` now pins.
          //
          // Dropping the older row loses nothing: it is only ever the first
          // half of a pair whose second half carries the same data plus the
          // bump (every other write in `piece-actions.ts` sets its columns and
          // its version in one statement). A reconciliation read is unaffected
          // — those rows are the truth, so they are never behind.
          const applied = confirmedVersionByPieceId.get(piece.id);
          if (applied != null && piece.version < applied) {
            return;
          }
          begin();
          write({ type: isInsert ? "insert" : "update", value: piece });
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
          applyPieceRow(payload.new as Record<string, unknown>, payload.eventType === "INSERT");
        };

        return () => {
          pieceHandler = null;
          writePieceRow = null;
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
      // Story 4.1: every interaction that reaches the server passes here.
      presence.reportActivity();
      // Story 3.19's unified mechanic: `placePiece` is gone — `movePiece`
      // is the single drag-end Server Action now, everywhere (Frame or
      // free space alike). This must never depend on the client's own
      // prediction (AD-2, unchanged) — an optimistic placement guess sets
      // `placedRow` alongside `scatterX`/`scatterY` (see `predict-drop.ts`'s
      // caller in `room-canvas.tsx`), but the Server Action call itself is
      // exactly the same either way, so a false-negative prediction can
      // never silently block a genuinely valid placement.
      let result;
      if (changes.rotation !== undefined) {
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
          // Story 4.2. The pseudo comes from the presence payload rather
          // than from a second prop, so the name recorded in the Room's
          // history is by construction the one the overlay is showing —
          // they cannot disagree. The server decides what to believe of it.
          actor: { participantId, pseudo: presencePayload?.name ?? null },
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
        // Tells `ClusterGroupSprite`'s `optimisticAnchor`/`RoomCanvas`'s
        // `predictedClusterLocks` (if this piece is a Cluster's
        // representative member) to stop trusting their guess immediately —
        // see `move-conflict-events.ts`'s own comment for why this explicit
        // signal replaced an earlier data-comparison guess. Fires on *any*
        // rejected write.
        emitMoveConflict(pieceId);
        // A rejection is this client saying something the server disagrees
        // with, so go and find out what it actually knows before the next
        // attempt. This matters most for `STALE_WRITE`, where the rejection
        // is *caused by* a stale cached version: a rejected write produces
        // no Realtime event of its own, so without this the stale version
        // that caused the rejection is exactly what the next attempt would
        // send again — rejected again, forever, until a page reload. Awaited
        // so the repair has landed before the optimistic change is rolled
        // back below, which keeps the piece from flashing through a stale
        // position on its way to the truth.
        await resyncRoom().catch(() => {
          // A failed repair must not mask the original rejection — that is
          // what the caller needs to see, and the next attempt (or the tab
          // regaining focus) will try again.
        });
        // AD-6: the optimistic local mutation is simply abandoned — no
        // automatic retry that would overwrite server state. The thrown
        // error is what tells TanStack DB to roll the optimistic change
        // back, onto the freshly reconciled state.
        throw new Error(result.error.code);
      }

      // Story 3.11 AC #4 / Story 3.19: fires only when the client's own
      // prediction (`predict-drop.ts`'s `predictDropOutcome`) said this
      // specific drop would place the piece, and the server's own
      // re-validation disagreed anyway (`result.placed === false`) — a
      // genuine concurrent conflict, something changed between the
      // client's snapshot and the server's transaction.
      // `consumeAndCheckPredictedLock` is the actual "did the client expect
      // this to work" signal, recorded by the prediction's caller at
      // drag-end — see `placement-conflict-events.ts`. Consumed
      // unconditionally on *every* move (not gated on any particular
      // `changes` field — every drop is a placement attempt now, not just a
      // near-Frame-slot one), draining the registry every time regardless
      // of outcome; a move the client never predicted as a placement simply
      // reads back `false` here, a no-op.
      const wasPredictedLock = consumeAndCheckPredictedLock(pieceId);
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
  // Mirrors `writePieceRow` for Clusters, plus the set of ids currently in
  // the collection — needed because reconciliation has to notice a Cluster
  // that has *disappeared*, which no read of surviving rows can tell you.
  let replaceClusters: ((rows: Record<string, unknown>[]) => void) | null = null;
  let knownClusterIds = new Set(initialClusters.map((c) => c.id));

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

        replaceClusters = (rows) => {
          // Clusters are replaced wholesale rather than merged: a Cluster row
          // is *deleted* when its members lock into the Frame, and a resync
          // that only wrote the rows it found would leave those ghosts behind
          // — every member would keep rendering at a stale anchor.
          const seen = new Set(rows.map((row) => row.id as string));
          begin();
          for (const row of rows) {
            write({
              type: "update",
              value: {
                id: row.id as string,
                anchorX: row.anchor_x as number,
                anchorY: row.anchor_y as number,
                version: row.version as number,
              },
            });
          }
          for (const existing of knownClusterIds) {
            if (!seen.has(existing)) {
              write({ type: "delete", key: existing });
            }
          }
          commit();
          knownClusterIds = seen;
        };

        ensureChannel();
        clusterHandler = (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            begin();
            write({ type: "delete", key: id });
            commit();
            knownClusterIds.delete(id);
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
          knownClusterIds.add(cluster.id);
        };

        return () => {
          clusterHandler = null;
          replaceClusters = null;
          releaseChannel();
        };
      },
    },
  });

  /**
   * Story 4.1 — the only presence surface the rest of the app gets.
   *
   * The channel object itself is deliberately *not* exposed: handing it out
   * would make AD-1's "one channel per Room, never a second" unenforceable
   * by reading the code, which is the only way it is enforced at all.
   */
  const presence = {
    /** Replaces what this browser broadcasts about itself. Never throttled —
     *  an identity change is rare and should show up at once. */
    track(payload: PresencePayload) {
      presencePayload = payload;
      pushPresence();
    },
    /**
     * "This Participant just did something."
     *
     * Called from `onUpdate` rather than from the canvas, because every
     * move, rotation and placement this client dispatches goes through
     * there — one place, and impossible to forget when a new interaction is
     * added later.
     */
    reportActivity() {
      if (!presencePayload) {
        return;
      }
      presencePayload = { ...presencePayload, lastActivityAt: Date.now() };
      if (Date.now() - lastPresencePushAt >= PRESENCE_TRACK_THROTTLE_MS) {
        pushPresence();
      }
    },
    /** Raw presence state, keyed by presence key — `toPresentParticipants` shapes it. */
    state(): Record<string, unknown[]> {
      return (sharedChannel?.presenceState() ?? {}) as Record<string, unknown[]>;
    },
    /** Fires on join, leave and sync. Returns its own unsubscribe. */
    subscribe(listener: () => void): () => void {
      presenceListeners.add(listener);
      return () => {
        presenceListeners.delete(listener);
      };
    },
  };

  /** Story 4.2 — live history, as thin as the append-only log allows. */
  const contributions = {
    subscribe(listener: (row: Record<string, unknown>) => void): () => void {
      contributionListeners.add(listener);
      return () => {
        contributionListeners.delete(listener);
      };
    },
  };

  return { pieceCollection, clusterCollection, presence, contributions };
}
