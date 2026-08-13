# Deferred Work

## Deferred from: code review of story-1-1-project-bootstrap (2026-08-09)

- `.dark` block never updates `--brand-accent`, so its contrast against dark backgrounds is unverified (`src/app/globals.css`) — dark mode is explicitly out of scope for V1 (DESIGN.md assumption), nothing consumes `.dark` yet.
- No code-level guard (e.g. `server-only` import) stops `SUPABASE_SECRET_KEY` from being imported into client code by accident — the network-gateway rejection is the only current protection. No file in this diff actually imports the secret key yet; establish the guard convention when the first Server Action does.
- No `error.tsx` boundary exists for `room/[id]` (or the other route segments) — low risk for a static placeholder with no real logic yet.
- ElectricSQL sync engine provisioning — decided: **Electric Cloud** (managed), not self-hosted. Deferred to Epic 3 (where real-time sync first becomes load-bearing) rather than provisioning another account/service now. When picked up: create the Electric Cloud project, add `ELECTRIC_URL`/token to `.env.example` and Vercel env vars, and wire `src/lib/db/collections.ts` to actually use `@tanstack/electric-db-collection`.
- No CI/automated gate (lint/build/test) enforces anything going forward — nothing in `.github/` runs on this repo yet. Separate infrastructure decision outside Story 1.1's scope.

## Deferred from: code review of story-1-2-sign-up (2026-08-10)

- No rate limiting or bot protection on the sign-up Server Action (`src/lib/auth/actions.ts`) — Supabase Auth has its own baseline server-side rate limits; revisit with a dedicated hardening pass if abuse becomes a real problem.
- `src/proxy.ts`'s matcher doesn't specifically exclude API/route-handler paths from the session-refresh call — no API routes exist yet (Server Actions are the write-path per Architecture AD-2), so nothing to exclude today; revisit if/when a Route Handler with different auth needs is added.

## Deferred from: code review of story-1-3-sign-in (2026-08-13)

- `createClient()` and `supabase.auth.signInWithPassword()` are both unguarded against a thrown/rejected promise — pre-existing pattern shared with `signUp` (Story 1.2), not introduced by Story 1.3; a fix should cover both actions together rather than diverging between them [src/lib/auth/actions.ts]
- No timeout on the Supabase network call in either `signIn` or `signUp` — a stalled network leaves the pending state hanging indefinitely; no story-wide timeout strategy exists yet [src/lib/auth/actions.ts]
- Potential timing side-channel: `signInWithPassword` likely takes measurably longer for a real account (password hash comparison) than an unknown email, theoretically distinguishing the two despite the identical error message — mitigating this is an architecture-level decision (e.g. constant-time padding), out of scope for a single story [src/lib/auth/actions.ts]

## Deferred from: code review of story-1-4-home (2026-08-13)

- No error boundary (`error.tsx`) or try/catch covers a failure of the Room-list data fetch — premature to build against `getRoomsForUser`'s current stub, which cannot throw; revisit once Epic 2 replaces it with a real (fallible) query [src/app/room-list.tsx]
- `formatRoomProgress` has no handling for `piecesPlaced > pieceCount`, negative values, or non-integer input — no real data source can produce these yet (stub only returns `[]`); Epic 2's real `Room` table should define these invariants at the DB level rather than requiring speculative UI-side clamping now [src/lib/rooms/format-room-progress.ts]
