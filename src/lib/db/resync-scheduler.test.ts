import { describe, expect, it } from "vitest";
import { createResyncScheduler } from "./resync-scheduler";

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void };

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every pending microtask *and* timer callback run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness() {
  const reads: Deferred[] = [];
  const request = createResyncScheduler(() => {
    const d = deferred();
    reads.push(d);
    return d.promise;
  });
  return { reads, request };
}

describe("createResyncScheduler", () => {
  it("reads immediately when nothing is in flight", async () => {
    const { reads, request } = harness();

    let settled = false;
    void request().then(() => {
      settled = true;
    });
    await flush();

    expect(reads).toHaveLength(1);
    expect(settled).toBe(false);
    reads[0].resolve();
    await flush();
    expect(settled).toBe(true);
  });

  it("never answers a caller with a read that began before it asked", async () => {
    const { reads, request } = harness();

    // First caller starts read #0.
    const first = request();
    await flush();
    expect(reads).toHaveLength(1);

    // Second caller arrives *while* read #0 is in flight. Read #0's database
    // snapshot may predate whatever made this caller ask, so it cannot
    // answer for it — this is the whole point of the scheduler.
    let secondSettled = false;
    void request().then(() => {
      secondSettled = true;
    });
    await flush();
    expect(reads, "a follow-up read must not start until the current one finishes").toHaveLength(1);

    reads[0].resolve();
    await first;
    await flush();

    expect(reads, "finishing read #0 must start a fresh read for the second caller").toHaveLength(
      2,
    );
    expect(secondSettled, "the second caller was answered by the stale read").toBe(false);

    reads[1].resolve();
    await flush();
    expect(secondSettled).toBe(true);
  });

  it("collapses every caller that arrives during one read into a single follow-up", async () => {
    const { reads, request } = harness();

    void request();
    await flush();

    const waiting = [request(), request(), request()];
    await flush();
    expect(reads).toHaveLength(1);

    reads[0].resolve();
    await flush();
    // One follow-up for all three — the dedupe that protects against a
    // stampede is still doing its job.
    expect(reads).toHaveLength(2);

    reads[1].resolve();
    await Promise.all(waiting);
    expect(reads).toHaveLength(2);
  });

  it("queues again for a caller that arrives during the follow-up read", async () => {
    const { reads, request } = harness();

    void request();
    await flush();
    void request();
    await flush();
    reads[0].resolve();
    await flush();
    expect(reads).toHaveLength(2);

    // Arrives while the follow-up is in flight — same reasoning, same answer.
    let thirdSettled = false;
    void request().then(() => {
      thirdSettled = true;
    });
    await flush();
    expect(reads).toHaveLength(2);

    reads[1].resolve();
    await flush();
    expect(reads).toHaveLength(3);
    expect(thirdSettled).toBe(false);

    reads[2].resolve();
    await flush();
    expect(thirdSettled).toBe(true);
  });

  it("is not wedged by a read that rejects", async () => {
    const { reads, request } = harness();

    const first = request();
    await flush();
    reads[0].reject(new Error("network"));

    // A rejected read must not surface as an unhandled rejection, and must
    // not leave the scheduler believing a read is still running forever.
    await expect(first).resolves.toBeUndefined();

    void request();
    await flush();
    expect(reads).toHaveLength(2);
  });
});
