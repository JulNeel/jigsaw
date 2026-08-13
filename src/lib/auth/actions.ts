"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/auth/supabase-server";
import { classifySignUpError } from "@/lib/auth/classify-sign-up-error";

export type AuthFormState = {
  error?: {
    field: "email" | "password" | "general";
    message: string;
  };
};

export type SignUpState = AuthFormState;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUp(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const emailField = formData.get("email");
  const passwordField = formData.get("password");

  if (typeof emailField !== "string" || typeof passwordField !== "string") {
    return {
      error: { field: "general", message: "Invalid form submission." },
    };
  }

  const email = emailField.trim();
  const password = passwordField;

  if (!email) {
    return { error: { field: "email", message: "Email is required." } };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return {
      error: { field: "email", message: "Enter a valid email address." },
    };
  }
  if (!password) {
    return { error: { field: "password", message: "Password is required." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const field = classifySignUpError(error.message);
    return { error: { field, message: error.message } };
  }

  if (!data.session) {
    return {
      error: {
        field: "general",
        message: "Could not complete sign-up. Please try again.",
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
  const emailField = formData.get("email");
  const passwordField = formData.get("password");

  if (typeof emailField !== "string" || typeof passwordField !== "string") {
    return {
      error: { field: "general", message: "Invalid form submission." },
    };
  }

  const email = emailField.trim();
  const password = passwordField;

  if (!email) {
    return { error: { field: "email", message: "Email is required." } };
  }
  if (!password) {
    return { error: { field: "password", message: "Password is required." } };
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
        error: { field: "general", message: "Invalid email or password." },
      };
    }
    return {
      error: {
        field: "general",
        message: "Something went wrong. Please try again.",
      },
    };
  }

  if (!data.session) {
    return {
      error: { field: "general", message: "Invalid email or password." },
    };
  }

  redirect("/");
}
