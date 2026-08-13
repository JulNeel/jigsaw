import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import { SignUpForm } from "@/app/sign-in/sign-up-form";

export default async function SignInPage() {
  const t = await getTranslations("Auth");

  return (
    <div>
      <h1>Jigsaw</h1>

      <section aria-label={t("signInHeading")}>
        <h2>{t("signInHeading")}</h2>
        <SignInForm />
      </section>

      <section aria-label={t("signUpHeading")}>
        <h2>{t("signUpHeading")}</h2>
        <SignUpForm />
      </section>
    </div>
  );
}
