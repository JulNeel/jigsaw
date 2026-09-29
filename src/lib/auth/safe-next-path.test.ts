import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("accepts an ordinary in-app path", () => {
    expect(safeNextPath("/room/famille-dupont-ab12cd")).toBe("/room/famille-dupont-ab12cd");
    expect(safeNextPath("/")).toBe("/");
  });

  it("keeps a query string and a fragment, which are part of the destination", () => {
    expect(safeNextPath("/room/x?tab=history#top")).toBe("/room/x?tab=history#top");
  });

  it("refuses an absolute URL — the open redirect this exists to stop", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("http://evil.example")).toBeNull();
  });

  it("refuses a protocol-relative URL, which a `startsWith('/')` check lets through", () => {
    // Browsers treat `//host` as absolute despite the leading slash. This is
    // the case a naive guard misses, and the reason this function exists at
    // all rather than an inline condition.
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("//evil.example/path")).toBeNull();
  });

  it("refuses backslashes, which some browsers normalise into slashes", () => {
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("/room\\..\\x")).toBeNull();
  });

  it("refuses other schemes", () => {
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("data:text/html,<script>")).toBeNull();
  });

  it("refuses a relative path, which would resolve against wherever we happen to be", () => {
    expect(safeNextPath("room/x")).toBeNull();
    expect(safeNextPath("../room/x")).toBeNull();
  });

  it("refuses control characters", () => {
    expect(safeNextPath("/room/x\nLocation: https://evil.example")).toBeNull();
    expect(safeNextPath("/room/\u0000")).toBeNull();
  });

  it("refuses something long enough to be a payload rather than a destination", () => {
    expect(safeNextPath("/" + "a".repeat(600))).toBeNull();
  });

  it("returns null rather than a fallback, leaving the choice to the caller", () => {
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
  });
});
