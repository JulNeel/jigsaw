"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState = {};

export function SignInForm() {
  const t = useTranslations("Auth");
  const [state, formAction, isPending] = useActionState(
    signIn,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label={t("emailLabel")}
        htmlFor="sign-in-email"
        error={state.error?.field === "email" ? state.error.message : undefined}
      >
        <Input
          id="sign-in-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={state.error?.field === "email" ? fieldErrorId("sign-in-email") : undefined}
          aria-invalid={state.error?.field === "email" || undefined}
        />
      </Field>

      <Field
        label={t("passwordLabel")}
        htmlFor="sign-in-password"
        error={state.error?.field === "password" ? state.error.message : undefined}
      >
        <Input
          id="sign-in-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          aria-describedby={
            state.error?.field === "password" ? fieldErrorId("sign-in-password") : undefined
          }
          aria-invalid={state.error?.field === "password" || undefined}
        />
      </Field>

      {state.error?.field === "general" && (
        <p role="alert" className="text-sm text-destructive">
          {state.error.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} size="cta">
        {isPending ? t("signInSubmitPending") : t("signInSubmit")}
      </Button>
    </form>
  );
}
