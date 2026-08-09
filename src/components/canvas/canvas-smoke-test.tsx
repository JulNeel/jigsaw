"use client";

import { Layer, Stage } from "react-konva";

/**
 * Bootstrap smoke test only (Story 1.1) — confirms Konva/react-konva render
 * client-side with no SSR/hydration errors. Real canvas implementation
 * (Epic 3) replaces this.
 */
export function CanvasSmokeTest() {
  return (
    <Stage width={200} height={200}>
      <Layer />
    </Stage>
  );
}
