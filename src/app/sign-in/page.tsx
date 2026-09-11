import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import { SignUpForm } from "@/app/sign-in/sign-up-form";

export default async function SignInPage() {
  const t = await getTranslations("Auth");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8 p-6 py-16">
      <h1 className="text-center text-2xl font-semibold">Jigsaw</h1>

      <section
        aria-label={t("signInHeading")}
        className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">{t("signInHeading")}</h2>
        <SignInForm />
      </section>

      <section
        aria-label={t("signUpHeading")}
        className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">{t("signUpHeading")}</h2>
        <SignUpForm />
      </section>
    </div>
  );
}
