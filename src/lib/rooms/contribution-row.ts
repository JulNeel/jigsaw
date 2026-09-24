/**
 * One line of a Room's history, as the UI consumes it.
 *
 * The mapping lives here rather than in either of its two callers because
 * there are two: the paginated read is a Server Action returning rows from
 * `pg`, and the live feed is a Realtime payload arriving in the browser.
 * Both carry the same snake_case columns, and two hand-written conversions
 * of the same row is exactly how a field quietly stops appearing on one path
 * only.
 */
export type ContributionRow = {
  id: string;
  pieceId: string;
  kind: "placed" | "fused";
  /** Set for a registered Participant, and established server-side. */
  userId: string | null;
  /** Set for a Guest — the browser they played from. */
  guestParticipantId: string | null;
  /** A snapshot taken when it happened, not a join to a current name. */
  pseudo: string | null;
  /** ISO 8601. A `Date` would not survive the Server Action boundary. */
  createdAt: string;
};

/**
 * Never throws, and drops anything it cannot read.
 *
 * This feeds a panel from two sources, one of which is a live socket. A row
 * written by a newer build, or a payload shaped differently than expected,
 * must cost that one line rather than the list — and `kind` is checked
 * against the values the UI actually knows how to render, not merely
 * against being a string.
 */
export function toContributionRow(raw: unknown): ContributionRow | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = row.id;
  const pieceId = row.piece_id;
  const kind = row.kind;
  const createdAt = row.created_at;
  if (typeof id !== "string" || typeof pieceId !== "string") {
    return null;
  }
  if (kind !== "placed" && kind !== "fused") {
    return null;
  }
  const iso =
    createdAt instanceof Date
      ? createdAt.toISOString()
      : typeof createdAt === "string"
        ? createdAt
        : null;
  if (iso === null) {
    return null;
  }
  return {
    id,
    pieceId,
    kind,
    userId: typeof row.user_id === "string" ? row.user_id : null,
    guestParticipantId:
      typeof row.guest_participant_id === "string" ? row.guest_participant_id : null,
    pseudo: typeof row.pseudo === "string" && row.pseudo.length > 0 ? row.pseudo : null,
    createdAt: iso,
  };
}

/**
 * Merges live arrivals into a loaded page without letting one appear twice.
 *
 * A row can genuinely reach the panel by both routes at once: the socket
 * delivers it while a `fetchContributions` call that already included it is
 * still in flight. Deduplicating by id is cheaper and more certain than
 * trying to make the two paths mutually exclusive.
 */
export function mergeContributions(
  existing: readonly ContributionRow[],
  incoming: readonly ContributionRow[],
): ContributionRow[] {
  const seen = new Set(existing.map((row) => row.id));
  const added = incoming.filter((row) => !seen.has(row.id));
  if (added.length === 0) {
    return existing as ContributionRow[];
  }
  return [...added, ...existing].sort((a, b) =>
    a.createdAt === b.createdAt
      ? b.id.localeCompare(a.id)
      : b.createdAt.localeCompare(a.createdAt),
  );
}
