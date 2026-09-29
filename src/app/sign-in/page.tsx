import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import { SignUpForm } from "@/app/sign-in/sign-up-form";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const t = await getTranslations("Auth");
  // Validated here as well as in the Server Action. Not belt and braces:
  // this value is about to be rendered into a form field, and a page should
  // not echo back something it would refuse to act on.
  const next = safeNextPath((await searchParams).next) ?? undefined;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8 p-6 py-16">
      <h1 className="text-center text-2xl font-semibold">Jigsaw</h1>

      <section
        aria-label={t("signInHeading")}
        className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">{t("signInHeading")}</h2>
        <SignInForm next={next} />
      </section>

      <section
        aria-label={t("signUpHeading")}
        className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">{t("signUpHeading")}</h2>
        <SignUpForm next={next} />
      </section>
    </div>
  );
}
