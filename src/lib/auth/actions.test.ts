import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect() called");
  }),
}));

vi.mock("@/lib/auth/supabase-server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/auth/supabase-server";
import { signIn, signUp } from "./actions";

function formDataWith(entries: Record<string, FormDataEntryValue>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("signUp validation", () => {
  it("rejects a missing email", async () => {
    const result = await signUp(
      {},
      formDataWith({ email: "", password: "password123" }),
    );
    expect(result.error).toEqual({
      field: "email",
      message: "Email is required.",
    });
  });

  it("rejects a malformed email", async () => {
    const result = await signUp(
      {},
      formDataWith({ email: "not-an-email", password: "password123" }),
    );
    expect(result.error).toEqual({
      field: "email",
      message: "Enter a valid email address.",
    });
  });

  it("trims whitespace before validating email format", async () => {
    const result = await signUp(
      {},
      formDataWith({ email: "  not-an-email  ", password: "password123" }),
    );
    expect(result.error?.field).toBe("email");
  });

  it("rejects a missing password", async () => {
    const result = await signUp(
      {},
      formDataWith({ email: "user@example.com", password: "" }),
    );
    expect(result.error).toEqual({
      field: "password",
      message: "Password is required.",
    });
  });

  it("rejects a non-string form field (e.g. a File)", async () => {
    const formData = new FormData();
    formData.set("email", new Blob(["x"]), "file.txt");
    formData.set("password", "password123");

    const result = await signUp({}, formData);
    expect(result.error).toEqual({
      field: "general",
      message: "Invalid form submission.",
    });
  });
});

describe("signIn validation", () => {
  it("rejects a missing email", async () => {
    const result = await signIn(
      {},
      formDataWith({ email: "", password: "password123" }),
    );
    expect(result.error).toEqual({
      field: "email",
      message: "Email is required.",
    });
  });

  it("rejects a missing password", async () => {
    const result = await signIn(
      {},
      formDataWith({ email: "user@example.com", password: "" }),
    );
    expect(result.error).toEqual({
      field: "password",
      message: "Password is required.",
    });
  });

  it("rejects a non-string form field (e.g. a File)", async () => {
    const formData = new FormData();
    formData.set("email", new Blob(["x"]), "file.txt");
    formData.set("password", "password123");

    const result = await signIn({}, formData);
    expect(result.error).toEqual({
      field: "general",
      message: "Invalid form submission.",
    });
  });

  it("trims whitespace from the email before validating it's present", async () => {
    const result = await signIn(
      {},
      formDataWith({ email: "   ", password: "password123" }),
    );
    expect(result.error).toEqual({
      field: "email",
      message: "Email is required.",
    });
  });
});

describe("signIn credential-error handling", () => {
  it("does not reveal whether the email or the password was wrong (anti-enumeration)", async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: null },
          error: { status: 400, message: "Invalid login credentials" },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await signIn(
      {},
      formDataWith({ email: "user@example.com", password: "wrong-password" }),
    );

    expect(result.error).toEqual({
      field: "general",
      message: "Invalid email or password.",
    });
  });

  it("uses a different generic message for non-credential errors (e.g. rate limiting)", async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: null },
          error: { status: 429, message: "Too many requests" },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await signIn(
      {},
      formDataWith({ email: "user@example.com", password: "whatever123" }),
    );

    expect(result.error).toEqual({
      field: "general",
      message: "Something went wrong. Please try again.",
    });
  });
});
