"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/auth/supabase-server";
import { classifySignUpError } from "@/lib/auth/classify-sign-up-error";
import { normalizePseudo } from "@/lib/rooms/participant-identity";

export type AuthFormState = {
  error?: {
    field: "pseudo" | "email" | "password" | "general";
    message: string;
  };
};

export type SignUpState = AuthFormState;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUp(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const t = await getTranslations("Auth");
  const pseudoField = formData.get("pseudo");
  const emailField = formData.get("email");
  const passwordField = formData.get("password");

  if (
    typeof pseudoField !== "string" ||
    typeof emailField !== "string" ||
    typeof passwordField !== "string"
  ) {
    return {
      error: { field: "general", message: t("invalidFormSubmission") },
    };
  }

  const email = emailField.trim();
  const password = passwordField;
  // Normalised by the same rule the Room applies, so an account's pseudo
  // can never be one thing on the form and another in the presence overlay.
  const pseudo = normalizePseudo(pseudoField);

  if (!pseudo) {
    return { error: { field: "pseudo", message: t("pseudoRequired") } };
  }
  if (!email) {
    return { error: { field: "email", message: t("emailRequired") } };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return {
      error: { field: "email", message: t("invalidEmailFormat") },
    };
  }
  if (!password) {
    return { error: { field: "password", message: t("passwordRequired") } };
  }

  const supabase = await createClient();
  // Carried in `user_metadata` rather than in a table of our own: it is the
  // only thing we know about the person, it belongs to the account, and a
  // `participant` table is Story 4.2/4.4's decision to make, not this one's.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { pseudo } },
  });

  if (error) {
    const field = classifySignUpError(error.message);
    const message =
      field === "email"
        ? t("invalidEmailFormat")
        : field === "password"
          ? t("passwordRequired")
          : t("genericError");
    return { error: { field, message } };
  }

  if (!data.session) {
    return {
      error: {
        field: "general",
        message: t("signUpIncomplete"),
      },
    };
  }

  redirect("/");
}

export type SignInState = AuthFormState;

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const t = await getTranslations("Auth");
  const emailField = formData.get("email");
  const passwordField = formData.get("password");

  if (typeof emailField !== "string" || typeof passwordField !== "string") {
    return {
      error: { field: "general", message: t("invalidFormSubmission") },
    };
  }

  const email = emailField.trim();
  const password = passwordField;

  if (!email) {
    return { error: { field: "email", message: t("emailRequired") } };
  }
  if (!password) {
    return { error: { field: "password", message: t("passwordRequired") } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Supabase deliberately returns one generic message for both a wrong
  // password and an unknown email, to avoid letting callers enumerate
  // registered accounts — do not try to split this into a field-specific
  // error. Non-credential failures (rate limiting, network/server errors)
  // get a different generic message so they aren't misreported as a wrong
  // password.
  if (error) {
    if (error.status === 400) {
      return {
        error: { field: "general", message: t("invalidCredentials") },
      };
    }
    return {
      error: {
        field: "general",
        message: t("genericError"),
      },
    };
  }

  if (!data.session) {
    return {
      error: { field: "general", message: t("invalidCredentials") },
    };
  }

  redirect("/");
}
