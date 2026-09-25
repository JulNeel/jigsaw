"use client";

import { useCallback, useEffect, useState } from "react";
import {
  mergeContributions,
  toContributionRow,
  type ContributionRow,
} from "./contribution-row";
import { fetchContributions, type ContributionCursor } from "./fetch-contributions";

type ContributionsApi = {
  subscribe(listener: (row: Record<string, unknown>) => void): () => void;
};

/**
 * A Room's history: one page loaded, then kept current.
 *
 * Two sources, one list. The paginated read answers "what happened before I
 * arrived"; the channel answers "what is happening now". They overlap — a
 * row can reach both at once — so everything goes through
 * `mergeContributions`, which deduplicates by id rather than trying to make
 * the two mutually exclusive.
 *
 * The subscription is live from mount, not from when the panel opens. A
 * contribution that lands while the panel is shut must still be there when
 * it is opened, and re-reading the first page on every open would be both
 * slower and wrong (it would silently drop anything older that had already
 * been paged in).
 */
export function useContributions(
  api: ContributionsApi,
  roomId: string,
): {
  rows: ContributionRow[];
  hasMore: boolean;
  loading: boolean;
  loadMore: () => void;
} {
  const [rows, setRows] = useState<ContributionRow[]>([]);
  const [cursor, setCursor] = useState<ContributionCursor | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Applying a page is separate from fetching one, and that split is not
  // stylistic. `react-hooks/set-state-in-effect` cannot see past an `await`
  // inside a function it is only handed by reference, so a `loadPage` that
  // both fetched and set state was rejected when the mount effect called it
  // — the fourth time this rule has shaped a file here (Stories 2.3, 3.1 and
  // 3.2 each found their own way round it). Fetching in the effect and
  // applying afterwards puts the await where the rule can see it, and buys
  // the cancellation the first version was missing.
  const applyPage = useCallback(
    (page: Awaited<ReturnType<typeof fetchContributions>>) => {
      setRows((current) => mergeContributions(current, page.rows));
      setCursor(page.nextCursor);
      setExhausted(page.nextCursor === null);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await fetchContributions(roomId, undefined);
        if (!cancelled) {
          applyPage(page);
        }
      } catch {
        // A failed first page is not worth surfacing: the Room is unaffected,
        // and the live feed keeps working regardless of whether the backlog
        // ever loaded.
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, applyPage]);

  useEffect(() => {
    return api.subscribe((raw) => {
      const row = toContributionRow(raw);
      if (row) {
        setRows((current) => mergeContributions(current, [row]));
      }
    });
  }, [api]);

  const loadMore = useCallback(() => {
    if (loading || !cursor) {
      return;
    }
    setLoading(true);
    void fetchContributions(roomId, cursor)
      .then(applyPage)
      .catch(() => setLoading(false));
  }, [loading, cursor, roomId, applyPage]);

  return { rows, hasMore: !exhausted && cursor !== null, loading, loadMore };
}
