"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
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
        <label htmlFor="email">{t("emailLabel")}</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={
            state.error?.field === "email" ? "email-error" : undefined
          }
          aria-invalid={state.error?.field === "email" || undefined}
        />
        {state.error?.field === "email" && (
          <p id="email-error" role="alert">
            {state.error.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password">{t("passwordLabel")}</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          aria-describedby={
            state.error?.field === "password" ? "password-error" : undefined
          }
          aria-invalid={state.error?.field === "password" || undefined}
        />
        {state.error?.field === "password" && (
          <p id="password-error" role="alert">
            {state.error.message}
          </p>
        )}
      </div>

      {state.error?.field === "general" && (
        <p role="alert">{state.error.message}</p>
      )}

      <button type="submit" disabled={isPending}>
        {isPending ? t("signUpSubmitPending") : t("signUpSubmit")}
      </button>
    </form>
  );
}
