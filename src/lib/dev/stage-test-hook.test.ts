import { afterEach, describe, expect, it, vi } from "vitest";
import { isStageTestHookEnabled } from "./stage-test-hook";

// `useStageTestHook` publishes a handle that lets an automated browser read
// the canvas's live transform and piece state. That is a genuine escape
// hatch, so the gate that keeps it out of production is worth pinning down —
// it is the only thing standing between a debugging aid and a shipped one.
//
// The hook itself is a React hook and this project has no DOM renderer (the
// whole suite runs in Vitest's `node` environment, by design), so the gate is
// exported separately and tested here. In a real production build both reads
// below are inlined as string literals by Next and the branch is eliminated
// outright; this test covers the logic, and `pnpm build` + a grep for
// `__jigsawE2E` in `.next/static` covers the elimination.
describe("isStageTestHookEnabled", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.NEXT_PUBLIC_E2E_HOOKS;

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_E2E_HOOKS;
    } else {
      process.env.NEXT_PUBLIC_E2E_HOOKS = originalFlag;
    }
  });

  it("is off by default — the flag has to be set deliberately", () => {
    delete process.env.NEXT_PUBLIC_E2E_HOOKS;
    expect(isStageTestHookEnabled()).toBe(false);
  });

  it("is on in development once the flag is set", () => {
    process.env.NEXT_PUBLIC_E2E_HOOKS = "1";
    expect(isStageTestHookEnabled()).toBe(true);
  });

  it("stays off in production even if the flag somehow leaks in", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_E2E_HOOKS = "1";
    expect(isStageTestHookEnabled()).toBe(false);
  });

  it("ignores any value other than exactly \"1\"", () => {
    process.env.NEXT_PUBLIC_E2E_HOOKS = "true";
    expect(isStageTestHookEnabled()).toBe(false);
  });
});
