import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-123" }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

// CreateRoomForm pulls in the createRoom Server Action, which imports the
// server-only `pg` pool — outside Next's bundler (i.e. in Vitest), the
// `server-only` guard throws unconditionally, so this chain must be
// mocked at its boundary rather than actually resolved.
vi.mock("@/lib/rooms/actions", () => ({
  createRoom: vi.fn(),
}));

import { requireUser } from "@/lib/auth/require-user";
import CreateRoomPage from "./page";

describe("CreateRoomPage", () => {
  it("gates access behind requireUser()", async () => {
    await CreateRoomPage();
    expect(requireUser).toHaveBeenCalled();
  });
});
