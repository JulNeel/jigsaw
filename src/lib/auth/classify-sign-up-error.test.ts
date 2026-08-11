import { describe, expect, it } from "vitest";
import { classifySignUpError } from "./classify-sign-up-error";

describe("classifySignUpError", () => {
  it("buckets 'already registered' messages under email", () => {
    expect(classifySignUpError("User already registered")).toBe("email");
  });

  it("buckets messages mentioning email under email", () => {
    expect(classifySignUpError("Invalid email format")).toBe("email");
  });

  it("buckets messages mentioning password under password", () => {
    expect(classifySignUpError("Password should be at least 6 characters")).toBe(
      "password",
    );
  });

  it("falls back to general for unrecognized messages", () => {
    expect(classifySignUpError("Something went wrong")).toBe("general");
  });

  it("is case-insensitive", () => {
    expect(classifySignUpError("EMAIL ALREADY REGISTERED")).toBe("email");
  });
});
