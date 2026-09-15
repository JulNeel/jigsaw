import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { getRoomsForUser, type Room } from "@/lib/rooms/get-rooms-for-user";
import { formatRoomProgress } from "@/lib/rooms/format-room-progress";
import { LIBRARY_IMAGES } from "@/lib/rooms/library-images";
import { DeleteRoomButton } from "@/app/delete-room-button";
import { EmptyState } from "@/components/ui/empty-state";
import { RoomListItem } from "@/components/ui/room-list-item";
import { PresenceDot } from "@/components/ui/presence-dot";

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
    return <EmptyState title={tHome("emptyTitle")} body={tHome("emptyBody")} />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {rooms.map((room) => {
        const isComplete = room.piecesPlaced === room.pieceCount;
        return (
          <RoomListItem
            key={room.id}
            href={`/room/${room.inviteSlug}`}
            thumbnail={<RoomThumbnail room={room} />}
            name={room.name}
            meta={
              <>
                {formatRoomProgress(room.piecesPlaced, room.pieceCount, tRooms)}
                <span aria-hidden="true">·</span>
                {isComplete ? (
                  <span className="font-medium text-primary">{tHome("roomComplete")}</span>
                ) : room.onlineCount > 0 ? (
                  <span className="inline-flex items-center gap-1 font-medium text-brand-accent-hover">
                    <PresenceDot />
                    {tHome("roomOnline", { count: room.onlineCount })}
                  </span>
                ) : (
                  tHome("roomOnline", { count: room.onlineCount })
                )}
              </>
            }
            action={<DeleteRoomButton roomId={room.id} roomName={room.name} />}
          />
        );
      })}
    </ul>
  );
}
