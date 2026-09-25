import { describe, expect, it } from "vitest";
import { mergeContributions, toContributionRow, type ContributionRow } from "./contribution-row";

const dbRow = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  piece_id: "22222222-2222-2222-2222-222222222222",
  kind: "placed",
  user_id: null,
  guest_participant_id: "33333333-3333-3333-3333-333333333333",
  pseudo: "Julien",
  created_at: new Date("2026-09-24T10:00:00.000Z"),
  ...overrides,
});

const row = (id: string, createdAt: string): ContributionRow => ({
  id,
  pieceId: "p",
  kind: "placed",
  userId: null,
  guestParticipantId: "g",
  pseudo: "Julien",
  createdAt,
});

describe("toContributionRow", () => {
  it("reads a row from the paginated query, where the date is a Date", () => {
    expect(toContributionRow(dbRow())).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      pieceId: "22222222-2222-2222-2222-222222222222",
      kind: "placed",
      userId: null,
      guestParticipantId: "33333333-3333-3333-3333-333333333333",
      pseudo: "Julien",
      createdAt: "2026-09-24T10:00:00.000Z",
    });
  });

  it("reads a row from the live feed, where the same date is a string", () => {
    // The whole reason this mapping is shared: `pg` hands back a `Date`,
    // Realtime hands back an ISO string, and the two must produce the same
    // line.
    const live = toContributionRow(dbRow({ created_at: "2026-09-24T10:00:00.000Z" }));
    expect(live?.createdAt).toBe("2026-09-24T10:00:00.000Z");
  });

  it("carries a registered contributor's account id", () => {
    const mapped = toContributionRow(
      dbRow({ user_id: "44444444-4444-4444-4444-444444444444", guest_participant_id: null }),
    );
    expect(mapped?.userId).toBe("44444444-4444-4444-4444-444444444444");
    expect(mapped?.guestParticipantId).toBeNull();
  });

  it("treats an absent pseudo as absent, not as an empty name", () => {
    expect(toContributionRow(dbRow({ pseudo: null }))?.pseudo).toBeNull();
    expect(toContributionRow(dbRow({ pseudo: "" }))?.pseudo).toBeNull();
  });

  it("drops a kind the UI has no line for, rather than rendering a blank one", () => {
    expect(toContributionRow(dbRow({ kind: "rotated" }))).toBeNull();
    expect(toContributionRow(dbRow({ kind: 7 }))).toBeNull();
  });

  it("drops anything malformed instead of taking the panel down", () => {
    expect(toContributionRow(null)).toBeNull();
    expect(toContributionRow("nonsense")).toBeNull();
    expect(toContributionRow({})).toBeNull();
    expect(toContributionRow(dbRow({ created_at: 12345 }))).toBeNull();
  });
});

describe("mergeContributions", () => {
  it("puts a live arrival at the head", () => {
    const merged = mergeContributions(
      [row("a", "2026-09-24T10:00:00.000Z")],
      [row("b", "2026-09-24T10:05:00.000Z")],
    );
    expect(merged.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("never shows the same contribution twice", () => {
    // Genuinely reachable: the socket delivers a row while a page fetch that
    // already contained it is still in flight.
    const existing = [row("a", "2026-09-24T10:00:00.000Z")];
    expect(mergeContributions(existing, [row("a", "2026-09-24T10:00:00.000Z")])).toEqual(existing);
  });

  it("returns the same array when nothing is new, so React can skip the render", () => {
    const existing = [row("a", "2026-09-24T10:00:00.000Z")];
    expect(mergeContributions(existing, [])).toBe(existing);
  });

  it("orders ties by id, because one gesture writes several rows at one timestamp", () => {
    // Locking an Îlot writes every piece in a single statement — those rows
    // share `created_at` to the microsecond, so time alone cannot order them.
    const merged = mergeContributions(
      [],
      [row("a", "2026-09-24T10:00:00.000Z"), row("b", "2026-09-24T10:00:00.000Z")],
    );
    expect(merged.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
