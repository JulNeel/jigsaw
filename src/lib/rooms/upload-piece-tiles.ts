import { createClient } from "@/lib/auth/supabase-browser";

const STORAGE_BUCKET = "piece-tiles";
// Sequential uploads (one network round-trip per tile, awaited one at a
// time) made Room creation take minutes for larger piece counts and looked
// "stuck" with no feedback. Uploading with bounded concurrency instead.
const UPLOAD_CONCURRENCY = 8;

/**
 * Best-effort deletion of already-uploaded tiles — used both when a
 * partial upload batch fails and when a later step (e.g. `createRoom`)
 * fails after tiles were already uploaded, to avoid leaving permanent
 * Storage orphans. Failures here are logged, not thrown — cleanup failing
 * shouldn't mask the original error.
 */
export async function removePieceTiles(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  const supabase = createClient();
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) {
    console.warn("removePieceTiles: cleanup failed:", error);
  }
}

/**
 * Uploads sliced tile blobs to Storage, client-side (AD-2 explicitly
 * permits Storage via the Supabase client SDK). Returns the storage paths
 * in the same row-major order as `tiles`/the grid — these become each
 * Piece's `image_asset_ref`. Uploads run with bounded concurrency rather
 * than one at a time or fully unbounded. If any upload fails, already-
 * uploaded tiles for this batch are cleaned up before rethrowing.
 */
export async function uploadPieceTiles(
  roomId: string,
  tiles: Blob[],
  grid: { rows: number; cols: number },
): Promise<string[]> {
  const supabase = createClient();
  const paths: (string | undefined)[] = new Array(tiles.length);

  async function uploadTile(index: number): Promise<void> {
    const row = Math.floor(index / grid.cols);
    const col = index % grid.cols;
    const path = `${roomId}/${row}-${col}.webp`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, tiles[index], { contentType: "image/webp" });
    if (error) {
      throw new Error(`Failed to upload tile ${path}: ${error.message}`);
    }
    paths[index] = path;
  }

  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < tiles.length) {
      const index = nextIndex++;
      await uploadTile(index);
    }
  }

  const workerCount = Math.min(UPLOAD_CONCURRENCY, tiles.length);
  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } catch (err) {
    await removePieceTiles(paths.filter((path): path is string => Boolean(path)));
    throw err;
  }

  return paths as string[];
}
