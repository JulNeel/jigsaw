// Single shared registry for `error.code` values returned by Server
// Actions — no call site invents its own free-form string (Architecture:
// "error.code vit dans un registre de constantes partagé unique").
// `SHAPE_MISMATCH`/`NEIGHBOR_MISMATCH` were removed (2026-09-01, code
// review): every failing branch in `placePiece` now falls back to
// `restWithoutLocking()` (always `success: true` — a rejected placement
// just rests unplaced, never a rejection), so the `reason` the pure
// validators in `validate-placement.ts` compute was never actually
// returned to any caller. The string literals themselves survive as
// `PlacementRejectionReason`'s own return contract there, tested directly —
// only the dead `ERROR_CODES` entries mirroring them are gone.
// `ROTATION_INVALID` removed the same way (2026-09-03): `rotatePiece` no
// longer accepts an arbitrary target angle (always a fixed `+90°`
// increment, see its own comment for why), so there's no longer an input
// to validate.
export const ERROR_CODES = {
  STALE_WRITE: "STALE_WRITE",
  ALREADY_PLACED: "ALREADY_PLACED",
  NOT_FOUND: "NOT_FOUND",
  // A genuinely unexpected failure (DB error, constraint violation, bug) —
  // distinct from `NOT_FOUND`, which previously doubled as the catch-all
  // and misreported every unrelated failure as "piece not found."
  UNEXPECTED_ERROR: "UNEXPECTED_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
