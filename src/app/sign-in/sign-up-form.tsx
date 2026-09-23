"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUp, type SignUpState } from "@/lib/auth/actions";
import { MAX_PSEUDO_LENGTH } from "@/lib/rooms/participant-identity";

const initialState: SignUpState = {};

export function SignUpForm() {
  const t = useTranslations("Auth");
  const [state, formAction, isPending] = useActionState(
    signUp,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* First, and deliberately: it is the only field the other people in
          a Room will ever see, and asking for it before the credentials
          reads as an introduction rather than as paperwork. */}
      <Field
        label={t("pseudoLabel")}
        htmlFor="sign-up-pseudo"
        error={state.error?.field === "pseudo" ? state.error.message : undefined}
      >
        <Input
          id="sign-up-pseudo"
          name="pseudo"
          type="text"
          required
          maxLength={MAX_PSEUDO_LENGTH}
          autoComplete="nickname"
          aria-describedby={
            state.error?.field === "pseudo" ? fieldErrorId("sign-up-pseudo") : undefined
          }
          aria-invalid={state.error?.field === "pseudo" || undefined}
        />
      </Field>

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

      <Button type="submit" disabled={isPending} size="cta">
        {isPending ? t("signUpSubmitPending") : t("signUpSubmit")}
      </Button>
    </form>
  );
}
