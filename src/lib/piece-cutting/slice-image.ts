/**
 * Slices a bitmap into `rows * cols` rectangular tiles, row-major order.
 * Plain rectangular cuts (V1 scope decision — see Story 2.4 Dev Notes).
 *
 * Uses a plain `<canvas>` + `toBlob()` rather than `OffscreenCanvas` +
 * `convertToBlob()` — the latter has materially weaker Safari support,
 * a real risk for this app's target audience (households sharing links,
 * plausibly iOS-heavy).
 */
export async function sliceImageIntoTiles(
  bitmap: ImageBitmap,
  rows: number,
  cols: number,
): Promise<Blob[]> {
  const tileWidth = Math.max(1, Math.floor(bitmap.width / cols));
  const tileHeight = Math.max(1, Math.floor(bitmap.height / rows));
  const tiles: Blob[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const canvas = document.createElement("canvas");
      canvas.width = tileWidth;
      canvas.height = tileHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not get a 2D canvas context.");
      }
      ctx.drawImage(
        bitmap,
        col * tileWidth,
        row * tileHeight,
        tileWidth,
        tileHeight,
        0,
        0,
        tileWidth,
        tileHeight,
      );
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("toBlob failed"))),
          "image/webp",
        );
      });
      tiles.push(blob);
    }
  }

  return tiles;
}
