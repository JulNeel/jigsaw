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
import { requireUser } from "./require-user";

describe("requireUser", () => {
  it("returns the user when signed in", async () => {
    const fakeUser = { id: "user-123" };
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: fakeUser },
          error: null,
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = await requireUser();
    expect(user).toBe(fakeUser);
  });

  it("redirects to /sign-in when there is no user", async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(requireUser()).rejects.toThrow("redirect() called");
  });

  it("redirects to /sign-in when getUser() returns an error", async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "invalid token" },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(requireUser()).rejects.toThrow("redirect() called");
  });

  it("redirects to /sign-in when getUser() throws", async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockRejectedValue(new Error("network error")),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(requireUser()).rejects.toThrow("redirect() called");
  });
});
