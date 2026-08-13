/**
 * Reads pixel dimensions of an uploaded file. Uses `createImageBitmap`, a
 * standard browser API — deliberately not a new npm dependency.
 */
export async function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}
