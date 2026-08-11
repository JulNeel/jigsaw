"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/auth/supabase-server";
import { classifySignUpError } from "@/lib/auth/classify-sign-up-error";

export type SignUpState = {
  error?: {
    field: "email" | "password" | "general";
    message: string;
  };
};

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
