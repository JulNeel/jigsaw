import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require-user";
import { RoomList } from "@/app/room-list";
import { RoomListSkeleton } from "@/app/room-list-skeleton";
import { ClaimContributionsOnAuth } from "@/app/claim-contributions-on-auth";

export default async function HomePage() {
  const user = await requireUser();
  const t = await getTranslations("Home");

  return (
    <>
      {/* Story 4.3: finishes a Guest's claim, if they asked for one on the
          way out. Mounted here because both `signUp` and `signIn` redirect
          to this page; it renders nothing and does nothing without an
          explicit intent. */}
      <ClaimContributionsOnAuth />
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <Button asChild>
            <Link href="/create">{t("createRoom")}</Link>
          </Button>
        </div>

        <Suspense fallback={<RoomListSkeleton />}>
          <RoomList userId={user.id} />
        </Suspense>
      </div>
    </>
  );
}
