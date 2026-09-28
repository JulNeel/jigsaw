import { describe, expect, it } from "vitest";
import { guestKeyFor } from "./guest-key";

describe("guestKeyFor", () => {
  it("matches what Postgres computes, byte for byte", () => {
    // Not a hash of a hash of an assumption: this value was read back from
    // the project's own database —
    //   select encode(sha256(convert_to($1, 'UTF8')), 'hex')
    // — and pinned here.
    //
    // It is the one property in this file that cannot be checked any other
    // way, and the one whose failure is silent. The migration hashes
    // existing rows in Postgres; the Server Action hashes a claim in Node.
    // If those ever disagree, nothing throws and no test fails — every claim
    // simply matches zero rows, and a Guest's contributions quietly stay
    // unclaimable for ever.
    expect(guestKeyFor("11111111-1111-4111-8111-111111111111")).toBe(
      "bd7662a5eeb41614e720d477abfcb2272e19a8a70a93b7e3bc8560d44ad326e9",
    );
  });

  it("is stable, which is what makes a Guest's lines group together", () => {
    expect(guestKeyFor("abc")).toBe(guestKeyFor("abc"));
  });

  it("separates two Guests", () => {
    expect(guestKeyFor("abc")).not.toBe(guestKeyFor("abd"));
  });

  it("is lowercase hex of a fixed length, because a column holds it", () => {
    expect(guestKeyFor(crypto.randomUUID())).toMatch(/^[0-9a-f]{64}$/);
  });
});
