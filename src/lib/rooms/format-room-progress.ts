type Translate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

export function formatRoomProgress(
  piecesPlaced: number,
  pieceCount: number,
  t: Translate,
): string {
  if (pieceCount <= 0) {
    return t("progressUnavailable");
  }
  return t("progress", { piecesPlaced, pieceCount });
}
