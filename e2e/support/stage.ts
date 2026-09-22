import type { Page } from "@playwright/test";

/**
 * One top-level thing the canvas has drawn: a loose piece, or an Îlot.
 *
 * `members` is what distinguishes them — an Îlot is a single rigid Group
 * holding one child per member, a loose piece is a Group of one.
 */
export type DrawnGroup = { x: number; y: number; members: number };

/**
 * Reads what the Konva stage is *actually drawing*, right now.
 *
 * The test hook reports the collection's own pieces, which is the right
 * answer for anything the server has confirmed and the wrong one for an
 * optimistic prediction: a predicted fusion is a local render override that
 * deliberately never touches the collection, so it is invisible there by
 * construction. The stage is where it does exist, and reading it needs no
 * production code to cooperate — no `name` props, no extra hook surface.
 *
 * Only top-level Groups are returned. Konva reports a nested node's
 * coordinates relative to its parent, so an Îlot's members would come back
 * as (0,0) and (100,0) and read like pieces sitting at the world origin.
 */
export async function readDrawnGroups(page: Page): Promise<DrawnGroup[]> {
  return page.evaluate(() => {
    const stage = window.__jigsawE2E!.stage;
    return stage
      .find("Group")
      .filter((node) => node.getParent()?.getClassName() === "Layer")
      .map((node) => ({
        x: Math.round(node.x() * 10) / 10,
        y: Math.round(node.y() * 10) / 10,
        // `find` is typed as returning bare Nodes; every match here is a
        // Group, which is a Container and does have children.
        members: (node as unknown as { getChildren(): unknown[] }).getChildren().length,
      }))
      .sort((a, b) => a.x - b.x || a.y - b.y);
  });
}
