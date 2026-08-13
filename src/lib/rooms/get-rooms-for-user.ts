export type Room = {
  id: string;
  name: string;
  pieceCount: number;
  piecesPlaced: number;
  onlineCount: number;
};

/**
 * Stub — the `Room` Postgres table doesn't exist yet (Epic 2 Story 2.4
 * creates it). Returns an empty list unconditionally until then; this
 * function's body is the seam Epic 2 replaces with a real query.
 */
export async function getRoomsForUser(userId: string): Promise<Room[]> {
  void userId;
  return [];
}
