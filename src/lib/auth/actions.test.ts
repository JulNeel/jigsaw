import { describe, expect, it, vi } from "vitest";
import authMessages from "../../../messages/fr.json";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect() called");
  }),
}));

vi.mock("@/lib/auth/supabase-server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => {
    const dict = (authMessages as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => dict[key];
  }),
}));

import { createClient } from "@/lib/auth/supabase-server";
import { signIn, signUp } from "./actions";

const t = authMessages.Auth;
const VALID_PSEUDO = "Julien";

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
      formDataWith({ pseudo: VALID_PSEUDO, email: "", password: "password123" }),
    );
    expect(result.error).toEqual({
      field: "email",
      message: t.emailRequired,
    });
  });

  it("rejects a malformed email", async () => {
    const result = await signUp(
      {},
      formDataWith({ pseudo: VALID_PSEUDO, email: "not-an-email", password: "password123" }),
    );
    expect(result.error).toEqual({
      field: "email",
      message: t.invalidEmailFormat,
    });
  });

  it("trims whitespace before validating email format", async () => {
    const result = await signUp(
      {},
      formDataWith({ pseudo: VALID_PSEUDO, email: "  not-an-email  ", password: "password123" }),
    );
    expect(result.error?.field).toBe("email");
  });

  it("rejects a missing password", async () => {
    const result = await signUp(
      {},
      formDataWith({ pseudo: VALID_PSEUDO, email: "user@example.com", password: "" }),
    );
    expect(result.error).toEqual({
      field: "password",
      message: t.passwordRequired,
    });
  });

  it("rejects a missing pseudo", async () => {
    const result = await signUp(
      {},
      formDataWith({ pseudo: "", email: "user@example.com", password: "password123" }),
    );
    expect(result.error).toEqual({
      field: "pseudo",
      message: t.pseudoRequired,
    });
  });

  it("rejects a pseudo made only of whitespace", async () => {
    // Stored as-is it would look like a name, render as nothing, and leave
    // an unlabelled avatar in everyone else's overlay.
    const result = await signUp(
      {},
      formDataWith({ pseudo: "   ", email: "user@example.com", password: "password123" }),
    );
    expect(result.error?.field).toBe("pseudo");
  });

  it("checks the pseudo before the email, so the first field asked for is the first reported", async () => {
    const result = await signUp(
      {},
      formDataWith({ pseudo: "", email: "", password: "" }),
    );
    expect(result.error?.field).toBe("pseudo");
  });

  it("rejects a non-string form field (e.g. a File)", async () => {
    const formData = new FormData();
    formData.set("pseudo", VALID_PSEUDO);
    formData.set("email", new Blob(["x"]), "file.txt");
    formData.set("password", "password123");

    const result = await signUp({}, formData);
    expect(result.error).toEqual({
      field: "general",
      message: t.invalidFormSubmission,
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
      message: t.emailRequired,
    });
  });

  it("rejects a missing password", async () => {
    const result = await signIn(
      {},
      formDataWith({ email: "user@example.com", password: "" }),
    );
    expect(result.error).toEqual({
      field: "password",
      message: t.passwordRequired,
    });
  });

  it("rejects a non-string form field (e.g. a File)", async () => {
    const formData = new FormData();
    formData.set("email", new Blob(["x"]), "file.txt");
    formData.set("password", "password123");

    const result = await signIn({}, formData);
    expect(result.error).toEqual({
      field: "general",
      message: t.invalidFormSubmission,
    });
  });

  it("trims whitespace from the email before validating it's present", async () => {
    const result = await signIn(
      {},
      formDataWith({ email: "   ", password: "password123" }),
    );
    expect(result.error).toEqual({
      field: "email",
      message: t.emailRequired,
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
      message: t.invalidCredentials,
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
      message: t.genericError,
    });
  });
});
