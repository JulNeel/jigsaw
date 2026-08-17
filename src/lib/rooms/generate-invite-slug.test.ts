import { describe, expect, it } from "vitest";
import { generateInviteSlug } from "./generate-invite-slug";

describe("generateInviteSlug", () => {
  it("slugifies the room name and appends a random suffix", () => {
    const slug = generateInviteSlug("Le Salon de la famille Dupont");
    expect(slug).toMatch(/^le-salon-de-la-famille-dupont-[a-z0-9]{6}$/);
  });

  it("strips accents", () => {
    const slug = generateInviteSlug("Été à Château-Thierry");
    expect(slug.startsWith("ete-a-chateau-thierry-")).toBe(true);
  });

  it("falls back to a generic base for an empty/unsluggable name", () => {
    const slug = generateInviteSlug("");
    expect(slug).toMatch(/^salon-[a-z0-9]{6}$/);
  });

  it("produces a different suffix on each call", () => {
    const a = generateInviteSlug("Room");
    const b = generateInviteSlug("Room");
    expect(a).not.toBe(b);
  });

  it("always produces a 6-character suffix", () => {
    for (let i = 0; i < 50; i++) {
      const slug = generateInviteSlug("Room");
      const suffix = slug.split("-").pop()!;
      expect(suffix).toHaveLength(6);
    }
  });

  it("never leaves a trailing hyphen from name truncation", () => {
    const longName = "a".repeat(60) + " b";
    const slug = generateInviteSlug(longName);
    const nameParts = slug.split("-");
    nameParts.pop(); // drop the random suffix
    expect(nameParts.join("-")).not.toMatch(/-$/);
  });
});
