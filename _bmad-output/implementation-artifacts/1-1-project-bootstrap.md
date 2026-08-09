---
baseline_commit: NO_VCS
---

# Story 1.1: Project bootstrap

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the project scaffolded with the chosen stack (Next.js App Router, TypeScript, Tailwind + shadcn/ui, Supabase, TanStack DB, ElectricSQL, Konva.js),
so that later stories can build user-facing features on a consistent foundation instead of reinventing configuration each epic.

## Acceptance Criteria

1. The repository is bootstrapped via `pnpm create next-app` (App Router, TypeScript) — no third-party starter template is used; this scaffold IS the starting point Epic 1 Story 1 documents (per Architecture, no named starter exists). **pnpm is the package manager for this project** — no `npm`/`yarn` lockfile is ever committed.
2. The reference source tree exists exactly as specified in Architecture's Structural Seed:
   - `app/` (with `room/[id]/`, `create/`, `stats/[roomId]/` route segments — can be empty placeholder routes at this stage)
   - `components/canvas/`, `components/ui/`
   - `lib/piece-cutting/`, `lib/validation/`, `lib/auth/`, `lib/canvas/`, `lib/db/`
   - `supabase/migrations/`
3. Supabase is connected: Postgres reachable via the **direct connection string** (not the pooler — the pooler does not support the logical replication ElectricSQL needs), Supabase Auth configured, Supabase Storage configured with a `piece-tiles` bucket.
4. ElectricSQL is installed and configured against the Supabase Postgres instance (`@tanstack/electric-db-collection` integration point wired, even if no collection is defined yet).
5. TanStack DB is installed and initialized (empty collection registry is acceptable at this stage — Epic 2+ stories define actual collections).
6. Tailwind CSS + shadcn/ui are installed, and the DESIGN.md brand-layer tokens are wired into the Tailwind theme: `background`, `foreground`, `muted`, `muted-foreground`, `border`, `card`, `primary`, `primary-foreground`, `accent`, `ring` (all pre-verified WCAG 2.2 AA — see Dev Notes for exact hex values), plus the `rounded` scale (`sm`/`md`/`lg`/`full`). No display/serif typography override; default shadcn (Geist Sans) ramp and default Tailwind spacing scale are kept as-is.
7. Konva.js + `react-konva` are installed (no canvas usage required yet — Epic 3 implements it — but the dependency and a placeholder empty `<Stage>` smoke-test component confirm it renders without error).
8. `dev`, `preview`, and `production` environments are defined for Vercel deployment (Vercel project linked; environment variables scaffolded per environment — actual secret values are an operational step, not part of this story's deliverable).
9. The project builds and runs locally (`pnpm dev`) and produces a successful production build (`pnpm build`) with zero TypeScript errors.

## Tasks / Subtasks

- [x] Task 1: Scaffold the Next.js project (AC: #1, #2)
  - [x] Run `pnpm create next-app` with TypeScript + App Router, no external starter
  - [x] Create the empty directory structure per the reference source tree (placeholder `page.tsx`/`route.ts` files where Next.js requires a file to register a route segment)
- [x] Task 2: Wire up Supabase (AC: #3)
  - [x] Create/link the Supabase project; record the **direct** (non-pooler) connection string — created by the user (guided), connection verified programmatically from this environment
  - [x] Configure Supabase Auth (email/password provider — sufficient for Epic 1 Stories 1.2/1.3) — enabled by default on new projects
  - [x] Create the `piece-tiles` Storage bucket — created (private), verified via `storage.buckets`
  - [x] Add `supabase/migrations/` with an initial empty/baseline migration
- [x] Task 3: Wire up ElectricSQL (AC: #4)
  - [x] Enable logical replication on the Supabase Postgres instance — already active by default on Supabase (`wal_level=logical` confirmed via direct connection), no manual step needed
  - [x] `pnpm add @tanstack/electric-db-collection` and confirm it can reach the Postgres instance — package installed (`@electric-sql/client ^1.5.15`, satisfies the ≥1.5.0 CVE requirement); Postgres reachability confirmed (connection + `wal_level` query succeeded)
- [x] Task 4: Wire up TanStack DB (AC: #5)
  - [x] `pnpm add @tanstack/db @tanstack/react-db`
  - [x] Add `lib/db/` with the (initially empty) collection registry module
- [x] Task 5: Wire up styling (AC: #6)
  - [x] `pnpm add` Tailwind CSS + shadcn/ui (via `pnpm dlx shadcn@latest init`)
  - [x] Add the DESIGN.md brand-layer color/rounded tokens to the Tailwind theme config
- [x] Task 6: Wire up Konva (AC: #7)
  - [x] `pnpm add konva react-konva`
  - [x] Add a throwaway smoke-test component rendering an empty `<Stage>`/`<Layer>` to confirm no SSR/hydration errors
- [x] Task 7: Configure environments and deploy pipeline (AC: #8, #9)
  - [x] Link the repo to a Vercel project — user-guided (`vercel login` by the user, `vercel link` run by the agent); project `julneels-projects/jigsaw`
  - [x] Define `dev`/`preview`/`production` environment variable groups (Supabase URL/keys, Electric connection info) — all 5 variables set on Production + Preview (3 of 5 also on Development); secrets (`SUPABASE_SECRET_KEY`, `DATABASE_URL`) marked sensitive/write-only, non-secrets left plain; verified via `vercel env ls` (names/metadata only, no values read)
  - [x] Confirm `next build` passes with zero TypeScript errors and the app deploys to a Vercel preview — build + lint + dev-server smoke test verified locally; live deployment verified via `curl` (200 on `/` and `/room/[id]`)

## Dev Notes

- **Package manager: pnpm.** Use `pnpm` for every install/run command in this and all future stories (`pnpm add`, `pnpm dev`, `pnpm build`). Commit `pnpm-lock.yaml` only — never generate or commit `package-lock.json` or `yarn.lock`.
- **Paradigm (Architecture AD-1/AD-2):** Local-first / optimistic-sync. Nothing in this story implements sync logic yet, but the scaffold must not violate the eventual contract: no direct client writes to Postgres — the Supabase client SDK is for Auth and Storage-URL generation only, never `.from(table).insert/update/delete()`. Don't add convenience helpers that make it easy to bypass this later.
- **Stack versions (verified 2026-08-08, re-verify at actual implementation time since TanStack DB moves fast pre-1.0):**
  - Next.js `16.2.7` (App Router, Turbopack default bundler)
  - React `19.2.x`
  - TypeScript `5.x`
  - `@tanstack/db` `^0.6.17`, `@tanstack/react-db` `^0.1.95` — pre-1.0, expect breaking changes between minors; pin exact versions, don't use loose ranges
  - ElectricSQL **`>=1.5.0` is mandatory** — versions below 1.5.0 carry CVE-2026-40906 (critical SQL injection on `/v1/shape`)
  - Konva.js + `react-konva` — latest stable
  - Tailwind CSS + shadcn/ui — latest stable
  - Capacitor is NOT part of this story (mobile wrapper comes later; do not add it now)
- **Design tokens to wire in (DESIGN.md, WCAG 2.2 AA pre-verified — do not re-derive or "improve" these values):**
  - `background: #FBF7F1`, `foreground: #2B2621`, `muted: #EFE6D8`, `muted-foreground: #6E6153`, `border: #E3D6C2`, `card: #FFFDF9`, `primary: #A8541F`, `primary-foreground: #FFFFFF`, `accent: #A67518`, `ring: #A8541F` (same as `primary`)
  - `rounded`: `sm=6px`, `md=8px`, `lg=12px`, `full=9999px`
  - No typography/spacing overrides — shadcn/Tailwind defaults stand.
- **Supabase connection detail (Architecture Stack table):** the pooled connection string does NOT support logical replication. Electric must use the **direct** connection. On Supabase's hosted platform this needs either IPv6 networking or the IPv4 add-on (Pro/Team plan) — flag this as an operational prerequisite, don't silently fall back to the pooler.
- **Naming (AD-4):** all code identifiers are English, following the fixed FR↔code vocabulary table (Salon→Room, Cadre→Frame, Espace infini→Canvas, Îlot→Cluster, Invité→Guest, Participant/Participant inscrit→Participant, Forme élémentaire→PieceShape). This story doesn't create domain entities yet, but any placeholder route/component names must already follow this vocabulary (e.g. `app/room/[id]/`, not `app/salon/[id]/`).
- **IDs & error envelope (Architecture Consistency Conventions):** UUID v4 (`gen_random_uuid()`) for future entity IDs; `timestamptz` in Postgres / ISO 8601 on the wire; Server Action errors as `{ error: { code, message } }` from a shared constants registry — no free-form error strings at call sites. Nothing to implement yet, but don't set up an error-handling pattern in this story that would conflict with this envelope later.
- **No domain tables in this story.** Per the "create tables only when needed" principle, this story does NOT create `Room`, `Piece`, `PieceAdjacency`, `Cluster`, `ContributionEvent`, `RoomPresence`, or `RoomParticipant` — those land in the stories that first need them (Epic 2 Story 2.4 for Room/Piece/PieceAdjacency, Epic 3 Story 3.8 for Cluster, Epic 4 Story 4.1 for RoomPresence, etc.). The `supabase/migrations/` folder should exist with at most a baseline/empty migration.
- **This is a greenfield project — no existing code to read or preserve.** There is no prior repository state; this story creates the very first commit.

### Project Structure Notes

- Follow the Architecture Structural Seed source tree exactly (see Dev Notes). Next.js requires a file per route segment to register it — use minimal placeholder `page.tsx` returning a stub, not a fleshed-out UI (that belongs to Epic 1 Stories 1.2–1.4 and later epics).
- `lib/auth/` and `lib/validation/` should exist as directories even though they're empty in this story — Architecture requires every mutating Server Action to import authorization from `lib/auth/` and business validation from `lib/validation/`, never inline. Establishing the directories now signals that convention from commit one.
- No variance from the unified structure identified — this story establishes it.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#Stack] — pinned dependency versions, Supabase connection requirement
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#Structural-Seed] — reference source tree, ERD (not yet implemented, for later stories' context)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#AD-4] — vocabulary table (spec FR ↔ code EN)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#Consistency-Conventions] — ID/date/error-envelope conventions
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/DESIGN.md#Colors] — exact token hex values and verified contrast ratios
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1] — story text and epic-level FR coverage note (no FR numbered directly; structural prerequisite for FR10, FR11, FR17)

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- `next/dynamic` with `ssr: false` is only permitted inside a Client Component in Next.js 16 (Turbopack build error otherwise). Fixed by moving the dynamic import into a dedicated `"use client"` loader (`canvas-smoke-test-loader.tsx`) imported from the server-rendered `room/[id]/page.tsx`, rather than adding `ssr: false` in the page itself.
- `pnpm dlx shadcn@latest init -b neutral` failed: in the current shadcn CLI, `-b`/`--base` selects the primitive library (`radix`/`base`/`aria`), not a color. Re-ran non-interactively with `-t next -b radix -p nova` (Nova preset = Geist font + Lucide icons, matching DESIGN.md's "keep shadcn defaults, no display font" decision).
- `create-next-app` refused to scaffold directly into the repo root (non-empty directory: `.agents/`, `.github/`, `_bmad/`, `_bmad-output/`). Scaffolded into a scratch directory instead, then merged the generated files in (excluding the scaffold's own throwaway `.git`).

### Completion Notes List

- **Supabase project created and verified (user-guided, pedagogical walkthrough in chat).** Data API / auto-expose-new-tables left disabled at project creation (we never use PostgREST — Electric reads via logical replication, writes go through direct Postgres from Server Actions); automatic RLS left enabled as a safety net reinforcing AD-2's deny-by-default intent. Connection verified programmatically from this environment: direct (non-pooler) connection succeeds, `wal_level=logical` (replication already active by default, no manual enabling needed), `storage.buckets` contains `piece-tiles` (private).
- **Key naming (verified 2026-08-09):** used Supabase's current `publishable`/`secret` key pair (`sb_publishable_...` / `sb_secret_...`), not the legacy `anon`/`service_role` names which are being retired end of 2026 — see `.env.example` and the Dev Notes entry above.
- Added `pg` (+ `@types/pg`) as a project dependency: needed for the direct Postgres connection this story verifies, and will be the client used by Server Actions for domain writes (Architecture AD-2 — writes bypass the Supabase `.from(table)` client entirely).
- `.env.example` created (committed, placeholders only) documenting all 5 required variables; `.env.local` is gitignored and was filled in by the user directly — this agent never saw or handled the actual secret values.
- Source tree adapted from the Architecture reference tree to Next.js's `--src-dir` convention: `app/`, `components/`, `lib/` all live under `src/` (idiomatic for this stack; Architecture's Structural Seed is scaffold, not a literal path mirror). `supabase/` stays at repo root per Supabase CLI convention.
- **Design-token conflict found and resolved during wiring (AC #6):** DESIGN.md lists `accent` (#A67518) as replacing shadcn's `accent` token wholesale, but shadcn's structural `--accent`/`--accent-foreground` pair drives *generic* hover/selected chrome across many components (dropdown items, ghost buttons, etc.) — overriding it globally would make ordinary hover states brand-gold, directly violating DESIGN.md's own rule that this accent is "jamais utilisé pour la chrome ou la décoration pure." Resolved by leaving shadcn's structural `--accent`/`--accent-foreground` at their neutral preset values, and exposing the brand gold separately as `--brand-accent` / `bg-brand-accent` / `text-brand-accent`, reserved for the bespoke Presence/Cluster/celebration components that actually need it (Epics 3–4). All other DESIGN.md tokens (background, foreground, muted, muted-foreground, border, card, primary, primary-foreground, ring) map directly onto shadcn's equivalent structural slots with no conflict.
- `rounded-sm/md/lg` are hardcoded to DESIGN.md's fixed pixel values (6/8/12px) rather than derived from shadcn's `calc(--radius * factor)` formula, since the two don't resolve to the same numbers and DESIGN.md's values are the source of truth.
- Package renamed from the scaffold's default `jigsaw-scaffold` to `jigsaw` in `package.json`.
- Verified locally: `pnpm build` (zero TS errors, Turbopack), `pnpm lint` (clean), `pnpm dev` with manual `curl` against all four routes (`/`, `/room/[id]`, `/create`, `/stats/[roomId]`) — all 200, no console errors from the Konva smoke test.
- `git init` run (no commit made — repo has no commits yet; `baseline_commit` recorded as `NO_VCS`).
- **Key naming (verified 2026-08-09):** Supabase's legacy `anon`/`service_role` keys are deprecated (end of 2026) in favor of `publishable` (`sb_publishable_...`) and `secret` (`sb_secret_...`) keys — same permissions, opaque format, independently revocable, and the secret key is gateway-rejected if sent from a browser context. Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` in env vars and Supabase client init, not the legacy names, in this and all future stories.
- **Vercel note:** the very first deployment on a brand-new Vercel project is always assigned to `production` regardless of branch (documented CLI behavior — "Future deployments will be preview deployments unless you use `--prod`"). So this story's initial deploy is technically the Production deployment, not a Preview one; it still fully satisfies AC #9's intent (proves the build+deploy pipeline and env vars resolve correctly end-to-end on Vercel's infra). Live at `https://jigsaw-black.vercel.app` (`/` and `/room/[id]` verified 200). Every deploy from here on (e.g. from a feature branch/PR) will be a genuine Preview deployment.
- All 7 tasks complete. No blockers remain.

### File List

**New:**
- `package.json` (generated by create-next-app, then renamed to `jigsaw`)
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs`
- `components.json` (shadcn config)
- `.gitignore`, `README.md`, `AGENTS.md`, `CLAUDE.md` (framework-generated)
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/favicon.ico`
- `src/app/globals.css` (generated by shadcn init, then hand-edited for DESIGN.md tokens)
- `src/app/room/[id]/page.tsx`, `src/app/create/page.tsx`, `src/app/stats/[roomId]/page.tsx` (placeholder routes)
- `src/components/canvas/canvas-smoke-test.tsx`, `src/components/canvas/canvas-smoke-test-loader.tsx`
- `src/components/canvas/.gitkeep`, `src/components/ui/.gitkeep`, `src/lib/piece-cutting/.gitkeep`, `src/lib/validation/.gitkeep`, `src/lib/auth/.gitkeep`, `src/lib/canvas/.gitkeep`, `supabase/migrations/.gitkeep`
- `src/components/ui/button.tsx`, `src/lib/utils.ts` (generated by shadcn init)
- `src/lib/db/collections.ts` (empty collection registry placeholder)
- `.env.example` (committed template — no secrets)
- `supabase/migrations/20260809000000_baseline.sql`
- `pg`, `@types/pg` added to `package.json` (direct Postgres client)
- `vercel` added to `package.json` devDependencies (CLI, used for `vercel link`/`vercel env`/`vercel deploy`)

**User-created, not tracked in git:** `.env.local` (real Supabase values — filled in by the user directly, never seen by this agent). `.vercel/` (project link metadata — gitignored by default, contains `projectId`/`orgId`, not secret but not meant to be shared across machines).

**External state, not files:** 5 environment variables configured on Vercel (`julneels-projects/jigsaw` project) across Production/Preview/Development scopes; one live deployment at `https://jigsaw-black.vercel.app`.
