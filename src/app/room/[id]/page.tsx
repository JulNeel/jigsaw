import Link from "next/link";
import { Home, LogIn } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getRoomBySlug, type RoomDetail } from "@/lib/rooms/get-room-by-slug";
import { RoomView } from "@/components/room/room-view";
import { normalizePseudo } from "@/lib/rooms/participant-identity";
import { createClient } from "@/lib/auth/supabase-server";
import { EmptyState } from "@/components/ui/empty-state";

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
      <div className="mx-auto w-full max-w-md py-24">
        <EmptyState glyph={null} title={t("errorTitle")} body={t("errorBody")} />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="mx-auto w-full max-w-md py-24">
        <EmptyState glyph={null} title={t("notFoundTitle")} body={t("notFoundBody")} />
      </div>
    );
  }

  // Informational only — never a gate (Story 3.1 AC #1: this route must
  // never redirect an unauthenticated visitor away). A failure here (auth
  // service unreachable, env misconfigured) must not crash the route either
  // — falling back to "treat as Guest" is the safe direction: worst case an
  // already-signed-in Participant sees an extra tutorial modal once, which
  // is far better than the zero-friction Guest entry point going down.
  let isGuest = true;
  // Story 4.1: the pseudo chosen at sign-up, so a registered Participant is
  // never asked for one again in a Room. Read here rather than client-side
  // because this is the only place that already holds the session — and the
  // account's *email* is deliberately not carried any further than this
  // function.
  let accountPseudo: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      console.warn("RoomPage: auth.getUser() returned an error:", error);
    }
    isGuest = !user;
    accountPseudo = normalizePseudo(
      typeof user?.user_metadata?.pseudo === "string" ? user.user_metadata.pseudo : null,
    );
  } catch (err) {
    console.warn("RoomPage: auth check failed, treating visitor as Guest:", err);
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <Link
          href={isGuest ? "/sign-in" : "/"}
          aria-label={isGuest ? t("signInAriaLabel") : t("backToHomeAriaLabel")}
          className="flex size-9 items-center justify-center rounded-full border border-border bg-card/90 shadow-sm backdrop-blur-sm"
        >
          {isGuest ? (
            <LogIn className="size-4" aria-hidden="true" />
          ) : (
            <Home className="size-4" aria-hidden="true" />
          )}
        </Link>
        <h1 className="pointer-events-none rounded-md border border-border bg-card/90 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm">
          {room.name}
        </h1>
      </div>
      <RoomView
        room={room}
        roomSlug={slug}
        isGuest={isGuest}
        accountPseudo={accountPseudo}
      />
    </div>
  );
}
