import { describe, expect, it } from "vitest";
import {
  PRESENCE_ACTIVITY_WINDOW_MS,
  diffPresence,
  isActive,
  toPresentParticipants,
} from "./presence";

const NOW = 1_700_000_000_000;
const entry = (participantId: string, agoMs = 0, name: string | null = null) => ({
  participantId,
  name,
  lastActivityAt: NOW - agoMs,
});

describe("isActive", () => {
  it("counts someone who has just acted", () => {
    expect(isActive(NOW, NOW)).toBe(true);
  });

  it("counts someone just inside the window", () => {
    expect(isActive(NOW - PRESENCE_ACTIVITY_WINDOW_MS + 1, NOW)).toBe(true);
  });

  it("drops someone past it", () => {
    expect(isActive(NOW - PRESENCE_ACTIVITY_WINDOW_MS - 1, NOW)).toBe(false);
  });

  it("does not drop someone whose clock runs ahead of ours", () => {
    // `lastActivityAt` is stamped on the *sender's* clock and compared on
    // ours. A few seconds of skew is normal and must not read as "from the
    // future, therefore wrong" — nor make them vanish.
    expect(isActive(NOW + 30_000, NOW)).toBe(true);
  });
});

describe("toPresentParticipants", () => {
  it("is empty when nobody else is there", () => {
    expect(toPresentParticipants({ me: [entry("me")] }, "me", NOW)).toEqual([]);
  });

  it("excludes self — the overlay answers 'who else'", () => {
    const list = toPresentParticipants({ me: [entry("me")], you: [entry("you")] }, "me", NOW);
    expect(list.map((p) => p.participantId)).toEqual(["you"]);
  });

  it("drops anyone past the activity window", () => {
    const state = {
      fresh: [entry("fresh", 1_000)],
      stale: [entry("stale", PRESENCE_ACTIVITY_WINDOW_MS + 1_000)],
    };
    expect(toPresentParticipants(state, "me", NOW).map((p) => p.participantId)).toEqual(["fresh"]);
  });

  it("collapses one Participant's several connections into one entry, keeping the freshest", () => {
    // Two tabs, or a reconnect that has not yet been cleaned up, arrive as
    // several payloads under the same key. Showing the same person twice
    // would be the most obviously wrong thing this could do.
    const state = { you: [entry("you", 60_000, "Julien"), entry("you", 1_000, "Julien")] };
    const list = toPresentParticipants(state, "me", NOW);
    expect(list).toHaveLength(1);
    expect(list[0].lastActivityAt).toBe(NOW - 1_000);
  });

  it("gives everyone a colour, and the same one every time", () => {
    const list = toPresentParticipants({ you: [entry("you")] }, "me", NOW);
    expect(list[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(toPresentParticipants({ you: [entry("you")] }, "me", NOW)[0].color).toBe(list[0].color);
  });

  it("keeps a stable order rather than following activity", () => {
    // Re-sorting on every action would make avatars swap places while you
    // play, which is distracting and tells you nothing.
    const state = { b: [entry("b", 5_000)], a: [entry("a", 1_000)] };
    expect(toPresentParticipants(state, "me", NOW).map((p) => p.participantId)).toEqual(["a", "b"]);
  });

  it("survives malformed payloads instead of taking the overlay down with it", () => {
    const state = {
      ok: [entry("ok")],
      junk: [{ nonsense: true }],
      empty: [],
      wrongTypes: [{ participantId: 42, lastActivityAt: "soon" }],
    } as unknown as Record<string, unknown[]>;
    expect(toPresentParticipants(state, "me", NOW).map((p) => p.participantId)).toEqual(["ok"]);
  });

  it("carries the name through untranslated, leaving 'Invité' to the UI", () => {
    const list = toPresentParticipants({ you: [entry("you", 0, "Julien")] }, "me", NOW);
    expect(list[0].name).toBe("Julien");
    expect(toPresentParticipants({ you: [entry("you")] }, "me", NOW)[0].name).toBeNull();
  });
});

describe("diffPresence", () => {
  const julien = { participantId: "a", name: "Julien", color: "#000", lastActivityAt: NOW };
  const marie = { participantId: "b", name: "Marie", color: "#111", lastActivityAt: NOW };

  it("reports an arrival", () => {
    expect(diffPresence([julien], [julien, marie])).toEqual({ arrived: [marie], left: [] });
  });

  it("reports a departure", () => {
    expect(diffPresence([julien, marie], [julien])).toEqual({ arrived: [], left: [marie] });
  });

  it("reports nothing when the list is unchanged", () => {
    expect(diffPresence([julien], [julien])).toEqual({ arrived: [], left: [] });
  });

  it("ignores a rename, which is not an arrival", () => {
    const renamed = { ...julien, name: "Ju" };
    expect(diffPresence([julien], [renamed])).toEqual({ arrived: [], left: [] });
  });
});
