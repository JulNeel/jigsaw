/**
 * Serialises reconciliation reads without ever answering a caller with a
 * read that is older than their reason for asking.
 *
 * The obvious dedupe — "a read is already in flight, hand that one back" —
 * conflates two different things. A read that is *running* is not a read
 * that *contains what you need*: its database snapshot was taken when it
 * started, which may be before the event that made this caller ask. That
 * matters because every caller of a resync is calling precisely because it
 * has just discovered its own view is wrong:
 *
 *   T+0ms   the tab regains focus  -> read A starts, snapshot taken
 *   T+30ms  another player writes the piece, version 7
 *   T+50ms  this client's write is rejected as STALE_WRITE
 *   T+50ms  the rejection asks for a repair -> handed read A, taken pre-7
 *
 * The repair then "succeeds" having learned nothing, and the next attempt
 * goes out with the same stale version. So a caller arriving during a read
 * waits for a *fresh* one instead.
 *
 * Callers arriving during the same read still share one follow-up, so the
 * stampede protection the naive dedupe was there for is intact: at most one
 * read running and one queued, however many callers pile up.
 */
export function createResyncScheduler(read: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let queued: Promise<void> | null = null;

  function start(): Promise<void> {
    // Swallowing here is what makes the scheduler safe rather than merely
    // convenient: if a failed read rejected, the promise `queued` is chained
    // onto would never run its continuation and the scheduler would refuse
    // to read again for the life of the page. A failed repair is not worth
    // surfacing anyway — every trigger recurs.
    const run: Promise<void> = read()
      .catch(() => {})
      .finally(() => {
        // Guarded: a later read may already have claimed the slot.
        if (inFlight === run) {
          inFlight = null;
        }
      });
    inFlight = run;
    return run;
  }

  return function requestResync(): Promise<void> {
    if (!inFlight) {
      return start();
    }
    queued ??= inFlight.then(() => {
      // Cleared before starting, so anyone arriving during *this* read gets
      // queued behind it in turn rather than joining a read already running.
      queued = null;
      return start();
    });
    return queued;
  };
}
