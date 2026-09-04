/**
 * Slices a bitmap into `rows * cols` tiles, row-major order. Each stored
 * tile is deliberately larger than its own `tileWidth × tileHeight`
 * footprint — see `TILE_OVERHANG_FACTOR` below — but `tileWidth`/
 * `tileHeight` themselves (the grid's logical spacing, used for scatter
 * positions, placement math, everywhere else in the app) are unaffected:
 * only the stored image asset's own pixel dimensions grow.
 *
 * Uses a plain `<canvas>` + `toBlob()` rather than `OffscreenCanvas` +
 * `convertToBlob()` — the latter has materially weaker Safari support,
 * a real risk for this app's target audience (households sharing links,
 * plausibly iOS-heavy).
 */
export type SlicedTiles = {
  tiles: Blob[];
  tileWidth: number;
  tileHeight: number;
};

// Story 3.12: how far beyond its own `tileWidth`/`tileHeight` footprint
// each stored tile's image extends, as a fraction of that footprint —
// genuine neighboring-pixel content, not a stretch/approximation. This
// exists specifically so a piece's cosmetic tab silhouette
// (`build-piece-outline-path.ts`'s clip mask) has real image content to
// reveal where a tab protrudes past the piece's own rectangle; a "blank"
// (which only ever recedes inward) never needed this. Must stay >= that
// module's own `BUMP_PROFILES`' deepest `depthFactor` (0.20) with margin,
// or a deep tab could protrude past the overhang into never-painted,
// transparent space. Reasonable default, not spec-mandated — tune together
// with `BUMP_PROFILES` if either changes.
export const TILE_OVERHANG_FACTOR = 0.25;

export async function sliceImageIntoTiles(
  bitmap: ImageBitmap,
  rows: number,
  cols: number,
): Promise<SlicedTiles> {
  const tileWidth = Math.max(1, Math.floor(bitmap.width / cols));
  const tileHeight = Math.max(1, Math.floor(bitmap.height / rows));
  const overhangX = Math.round(tileWidth * TILE_OVERHANG_FACTOR);
  const overhangY = Math.round(tileHeight * TILE_OVERHANG_FACTOR);
  const paddedWidth = tileWidth + 2 * overhangX;
  const paddedHeight = tileHeight + 2 * overhangY;
  const tiles: Blob[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const canvas = document.createElement("canvas");
      canvas.width = paddedWidth;
      canvas.height = paddedHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not get a 2D canvas context.");
      }

      // The padded source rectangle, in the full bitmap's own coordinate
      // space — clamped to the bitmap's true bounds below, since a
      // boundary tile's overhang reaches past the source image on at
      // least one side (harmless: that side's edge is always "flat" per
      // `classifyPieceShape`, so its own clip path never protrudes there
      // to reveal the resulting transparent gap).
      const srcX = col * tileWidth - overhangX;
      const srcY = row * tileHeight - overhangY;
      const clampedSrcX = Math.max(0, srcX);
      const clampedSrcY = Math.max(0, srcY);
      const clampedSrcRight = Math.min(bitmap.width, srcX + paddedWidth);
      const clampedSrcBottom = Math.min(bitmap.height, srcY + paddedHeight);
      const clampedWidth = clampedSrcRight - clampedSrcX;
      const clampedHeight = clampedSrcBottom - clampedSrcY;

      if (clampedWidth > 0 && clampedHeight > 0) {
        ctx.drawImage(
          bitmap,
          clampedSrcX,
          clampedSrcY,
          clampedWidth,
          clampedHeight,
          clampedSrcX - srcX,
          clampedSrcY - srcY,
          clampedWidth,
          clampedHeight,
        );
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("toBlob failed"))),
          "image/webp",
        );
      });
      tiles.push(blob);
    }
  }

  return { tiles, tileWidth, tileHeight };
}
