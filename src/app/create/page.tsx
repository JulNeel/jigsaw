import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/require-user";
import { CreateRoomForm } from "@/app/create/create-room-form";

export default async function CreateRoomPage() {
  await requireUser();
  const t = await getTranslations("Create");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>

      <CreateRoomForm />
    </div>
  );
}
