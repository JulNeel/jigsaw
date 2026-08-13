import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-123" }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { requireUser } from "@/lib/auth/require-user";
import CreateRoomPage from "./page";

describe("CreateRoomPage", () => {
  it("gates access behind requireUser()", async () => {
    await CreateRoomPage();
    expect(requireUser).toHaveBeenCalled();
  });
});
