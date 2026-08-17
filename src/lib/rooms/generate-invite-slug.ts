function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, ""); // truncation above can leave a trailing hyphen
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

/**
 * Human-readable public invite identifier (e.g. `key-creation-salon.html`'s
 * `famille-dupont-8k2p`) — distinct from `Room.id` (internal UUID PK).
 * Uniqueness is enforced at the DB level; the caller retries on collision.
 */
export function generateInviteSlug(roomName: string): string {
  const base = slugify(roomName) || "salon";
  return `${base}-${randomSuffix()}`;
}
