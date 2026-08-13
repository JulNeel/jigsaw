"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
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
      <div className="flex flex-col gap-1">
        <label htmlFor="sign-in-email">{t("emailLabel")}</label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={
            state.error?.field === "email" ? "sign-in-email-error" : undefined
          }
          aria-invalid={state.error?.field === "email" || undefined}
        />
        {state.error?.field === "email" && (
          <p id="sign-in-email-error" role="alert">
            {state.error.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sign-in-password">{t("passwordLabel")}</label>
        <input
          id="sign-in-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          aria-describedby={
            state.error?.field === "password"
              ? "sign-in-password-error"
              : undefined
          }
          aria-invalid={state.error?.field === "password" || undefined}
        />
        {state.error?.field === "password" && (
          <p id="sign-in-password-error" role="alert">
            {state.error.message}
          </p>
        )}
      </div>

      {state.error?.field === "general" && (
        <p role="alert">{state.error.message}</p>
      )}

      <button type="submit" disabled={isPending}>
        {isPending ? t("signInSubmitPending") : t("signInSubmit")}
      </button>
    </form>
  );
}
