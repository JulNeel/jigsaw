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
