const SIMULATED_LATENCY_MS =
  process.env.NODE_ENV === "development"
    ? Number(process.env.NEXT_PUBLIC_DEV_NETWORK_DELAY_MS) || 0
    : 0;

/**
 * Wraps `fetch` with an artificial delay, gated to development and
 * NEXT_PUBLIC_DEV_NETWORK_DELAY_MS so it can never leak into production —
 * for exercising loading/optimistic-UI states against realistic latency
 * (Supabase queries, storage uploads, auth) without DevTools throttling,
 * which doesn't slow down Node-side Server Actions.
 */
export function withSimulatedLatency(fetchImpl: typeof fetch = fetch): typeof fetch {
  if (!SIMULATED_LATENCY_MS) {
    return fetchImpl;
  }
  return async (...args: Parameters<typeof fetch>) => {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
    return fetchImpl(...args);
  };
}
