"use client";

import dynamic from "next/dynamic";

/**
 * Client-only loader for the Konva smoke test (Story 1.1). `ssr: false` is
 * only valid inside a Client Component in Next.js 16 — this wrapper exists
 * so Server Component pages can still opt out of SSR for canvas content.
 */
export const CanvasSmokeTest = dynamic(
  () =>
    import("@/components/canvas/canvas-smoke-test").then(
      (mod) => mod.CanvasSmokeTest,
    ),
  {
    ssr: false,
    loading: () => <div>Loading canvas…</div>,
  },
);
