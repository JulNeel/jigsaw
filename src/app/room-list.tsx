import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getRoomsForUser } from "@/lib/rooms/get-rooms-for-user";
import { formatRoomProgress } from "@/lib/rooms/format-room-progress";

export async function RoomList({ userId }: { userId: string }) {
  const rooms = await getRoomsForUser(userId);
  const tHome = await getTranslations("Home");
  const tRooms = await getTranslations("Rooms");

  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="text-4xl" aria-hidden="true">
          🧩
        </span>
        <h2 className="text-lg font-semibold">{tHome("emptyTitle")}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {tHome("emptyBody")}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rooms.map((room) => {
        const isComplete = room.piecesPlaced === room.pieceCount;
        return (
          <li key={room.id}>
            <Link
              href={`/room/${room.inviteSlug}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted"
            >
              <div className="size-13 shrink-0 rounded-lg bg-gradient-to-br from-primary/40 to-primary/70" />
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-semibold">{room.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatRoomProgress(room.piecesPlaced, room.pieceCount, tRooms)}
                  {isComplete
                    ? ` · ${tHome("roomComplete")}`
                    : ` · ${tHome("roomOnline", { count: room.onlineCount })}`}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
