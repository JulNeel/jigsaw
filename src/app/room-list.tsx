import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { getRoomsForUser, type Room } from "@/lib/rooms/get-rooms-for-user";
import { formatRoomProgress } from "@/lib/rooms/format-room-progress";
import { LIBRARY_IMAGES } from "@/lib/rooms/library-images";

function RoomThumbnail({ room }: { room: Room }) {
  // Library-sourced Rooms can show their real cover image — it's already a
  // public static asset, independent of the private piece-tiles bucket.
  // Uploaded-photo Rooms have no persisted cover image yet (only sliced
  // tiles, in a private bucket) — falls back to the gradient placeholder
  // until that's addressed.
  const libraryImage =
    room.imageSource === "library"
      ? LIBRARY_IMAGES.find((entry) => entry.id === room.imageLibraryId)
      : undefined;

  if (libraryImage) {
    return (
      <div className="relative size-13 shrink-0 overflow-hidden rounded-lg">
        <Image
          src={libraryImage.src}
          alt={libraryImage.alt}
          fill
          sizes="52px"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div className="size-13 shrink-0 rounded-lg bg-gradient-to-br from-primary/40 to-primary/70" />
  );
}

export async function RoomList({ userId }: { userId: string }) {
  const tHome = await getTranslations("Home");
  const tRooms = await getTranslations("Rooms");

  let rooms: Room[];
  try {
    rooms = await getRoomsForUser(userId);
  } catch (err) {
    // A connection failure must show a distinct, honest message — silently
    // falling back to the empty state would misleadingly suggest the user
    // has no Rooms when the real problem is that they couldn't be loaded.
    console.error("getRoomsForUser failed:", err);
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-lg font-semibold">{tHome("loadErrorTitle")}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {tHome("loadErrorBody")}
        </p>
      </div>
    );
  }

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
              <RoomThumbnail room={room} />
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
