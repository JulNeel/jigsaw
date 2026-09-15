"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUp, type SignUpState } from "@/lib/auth/actions";

const initialState: SignUpState = {};

export function SignUpForm() {
  const t = useTranslations("Auth");
  const [state, formAction, isPending] = useActionState(
    signUp,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label={t("emailLabel")}
        htmlFor="sign-up-email"
        error={state.error?.field === "email" ? state.error.message : undefined}
      >
        <Input
          id="sign-up-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={state.error?.field === "email" ? fieldErrorId("sign-up-email") : undefined}
          aria-invalid={state.error?.field === "email" || undefined}
        />
      </Field>

      <Field
        label={t("passwordLabel")}
        htmlFor="sign-up-password"
        error={state.error?.field === "password" ? state.error.message : undefined}
      >
        <Input
          id="sign-up-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          aria-describedby={
            state.error?.field === "password" ? fieldErrorId("sign-up-password") : undefined
          }
          aria-invalid={state.error?.field === "password" || undefined}
        />
      </Field>

      {state.error?.field === "general" && (
        <p role="alert" className="text-sm text-destructive">
          {state.error.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="min-h-11 w-full">
        {isPending ? t("signUpSubmitPending") : t("signUpSubmit")}
      </Button>
    </form>
  );
}
