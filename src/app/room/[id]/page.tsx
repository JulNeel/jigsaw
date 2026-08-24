import { getTranslations } from "next-intl/server";
import { getRoomBySlug, type RoomDetail } from "@/lib/rooms/get-room-by-slug";
import { RoomCanvasClient } from "@/components/canvas/room-canvas-loader";

// No auth gate here, intentionally — this is the one route every prior
// story's "gate behind sign-in" pattern deliberately does not apply to.
// A Guest (a session with no account) must reach it with zero friction.
export default async function RoomPage({
  params,
}: PageProps<"/room/[id]">) {
  const { id: slug } = await params;
  const t = await getTranslations("RoomView");

  let room: RoomDetail | null;
  try {
    room = await getRoomBySlug(slug);
  } catch (err) {
    // Distinct from "not found" — a DB/Storage failure isn't the visitor's
    // fault, and telling them to double-check their link would be misleading.
    console.error("getRoomBySlug failed:", err);
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-lg font-semibold">{t("errorTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("errorBody")}</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-lg font-semibold">{t("notFoundTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("notFoundBody")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <h1 className="text-xl font-semibold">{room.name}</h1>
      <RoomCanvasClient room={room} />
    </div>
  );
}
