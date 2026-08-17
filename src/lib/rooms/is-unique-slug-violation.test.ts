import { describe, expect, it } from "vitest";
import { isUniqueSlugViolation } from "./is-unique-slug-violation";

describe("isUniqueSlugViolation", () => {
  it("recognizes a unique_violation on the invite_slug constraint", () => {
    expect(
      isUniqueSlugViolation({ code: "23505", constraint: "room_invite_slug_key" }),
    ).toBe(true);
  });

  it("rejects a unique_violation on a different constraint", () => {
    expect(
      isUniqueSlugViolation({ code: "23505", constraint: "piece_room_id_grid_row_grid_col_key" }),
    ).toBe(false);
  });

  it("rejects a non-unique-violation error code", () => {
    expect(isUniqueSlugViolation({ code: "23503", constraint: "room_invite_slug_key" })).toBe(
      false,
    );
  });

  it("rejects non-object errors", () => {
    expect(isUniqueSlugViolation(new Error("boom"))).toBe(false);
    expect(isUniqueSlugViolation("boom")).toBe(false);
    expect(isUniqueSlugViolation(null)).toBe(false);
    expect(isUniqueSlugViolation(undefined)).toBe(false);
  });
});
