export function formatRoomProgress(
  piecesPlaced: number,
  pieceCount: number,
): string {
  if (pieceCount <= 0) {
    return "—";
  }
  return `${piecesPlaced} / ${pieceCount} pièces posées`;
}
