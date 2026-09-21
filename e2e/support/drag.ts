import { expect, type Page } from "@playwright/test";

export type Point = { x: number; y: number };

// Konva promotes a pointer-down into a drag only once the pointer has moved
// `Konva.dragDistance` (3px by default). A synthetic drag that jumps straight
// to the target never crosses that threshold in a separate event and the
// drag never starts — the piece just sits there and the test reports a
// mysterious "nothing happened".
const DRAG_PROMOTION_PX = 6;

// Konva applies dragged positions on requestAnimationFrame, and the app reads
// the drop point from `e.target.x()/y()` at dragend. Several interpolated
// moves keep the gesture close to a human one (the app runs prediction and
// highlight logic during the drag), and matter for scenarios that land near
// a tolerance boundary.
const DEFAULT_STEPS = 20;

async function flushFrames(page: Page): Promise<void> {
  // Two frames, not one: the first lets Konva's pending drag frame run, the
  // second guarantees its resulting position has been committed before the
  // pointer is released. A frame of lag here shifts the drop point by a few
  // pixels, which is enough to flip a near-tolerance fusion.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/**
 * Drags a piece so its centre lands on `targetWorld`.
 *
 * Both endpoints are resolved in a single `page.evaluate` so they come from
 * the same transform snapshot — resolving them separately would straddle any
 * pan the app performed in between.
 *
 * A piece Group's x/y is its centre (`offsetX/Y = tile/2`), and
 * `frameSlotCenter` is a centre too, so targets compose with no half-tile
 * correction. That symmetry is easy to break by accident; don't.
 */
export async function dragPieceToWorld(
  page: Page,
  pieceId: string,
  targetWorld: Point,
  opts: { steps?: number } = {},
): Promise<{ from: Point; to: Point }> {
  const endpoints = await page.evaluate(
    ([id, target]) => {
      const handle = window.__jigsawE2E;
      if (!handle) {
        return { error: "__jigsawE2E is not installed — is NEXT_PUBLIC_E2E_HOOKS=1 set?" } as const;
      }
      const from = handle.pieceScreen(id as string);
      if (!from) {
        return { error: `piece ${id} is not in the client's collection` } as const;
      }
      return {
        from,
        to: handle.toScreen(target as { x: number; y: number }),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      } as const;
    },
    [pieceId, targetWorld] as const,
  );

  if ("error" in endpoints) {
    throw new Error(`e2e: ${endpoints.error}`);
  }
  const { from, to, viewport } = endpoints;

  // Playwright silently clamps the mouse to the viewport, so an off-screen
  // endpoint produces a drag that lands somewhere else entirely — the single
  // most confusing failure mode in this harness. Fail with the numbers.
  for (const [label, point] of [
    ["start", from],
    ["target", to],
  ] as const) {
    const inside =
      point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height;
    expect(
      inside,
      `e2e: drag ${label} (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) is outside the ` +
        `${viewport.width}x${viewport.height} viewport — the fixture's world coordinates ` +
        "are too far apart for the stage's fit-to-content scale.",
    ).toBe(true);
  }

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + DRAG_PROMOTION_PX, from.y + DRAG_PROMOTION_PX);
  await page.mouse.move(to.x, to.y, { steps: opts.steps ?? DEFAULT_STEPS });
  await page.mouse.move(to.x, to.y);
  await flushFrames(page);
  await page.mouse.up();

  return { from, to };
}

/** Rotates a piece 90° — a click that must not move more than Konva's drag threshold. */
export async function rotatePiece(page: Page, pieceId: string): Promise<void> {
  const point = await page.evaluate(
    (id) => window.__jigsawE2E?.pieceScreen(id) ?? null,
    pieceId,
  );
  if (!point) {
    throw new Error(`e2e: cannot rotate ${pieceId} — not found on the canvas`);
  }
  await page.mouse.click(point.x, point.y);
}
