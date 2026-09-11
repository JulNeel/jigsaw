"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
      <div className="flex flex-col gap-1">
        <label htmlFor="sign-up-email" className="text-sm font-semibold">
          {t("emailLabel")}
        </label>
        <input
          id="sign-up-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={
            state.error?.field === "email" ? "sign-up-email-error" : undefined
          }
          aria-invalid={state.error?.field === "email" || undefined}
          className="rounded-lg border border-border bg-background p-2 text-sm"
        />
        {state.error?.field === "email" && (
          <p id="sign-up-email-error" role="alert" className="text-sm text-destructive">
            {state.error.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sign-up-password" className="text-sm font-semibold">
          {t("passwordLabel")}
        </label>
        <input
          id="sign-up-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          aria-describedby={
            state.error?.field === "password" ? "sign-up-password-error" : undefined
          }
          aria-invalid={state.error?.field === "password" || undefined}
          className="rounded-lg border border-border bg-background p-2 text-sm"
        />
        {state.error?.field === "password" && (
          <p id="sign-up-password-error" role="alert" className="text-sm text-destructive">
            {state.error.message}
          </p>
        )}
      </div>

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
