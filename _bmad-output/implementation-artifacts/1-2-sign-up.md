---
baseline_commit: 1850c30
---

# Story 1.2: Sign-up

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor,
I want to create an account,
so that I become a registered Participant and can access gated capabilities (creating a Room, keeping my progress).

## Acceptance Criteria

1. An unauthenticated visitor can reach a Sign-in/Sign-up screen at `/sign-in`, which shows a sign-up form (this story) — a sign-in form is added to the same screen by Story 1.3, so this story does not remove or block that future addition.
2. Submitting a valid email + password creates a Supabase Auth account and signs the visitor in automatically — no separate email-confirmation step blocks first access (see Dev Notes: requires a specific Supabase Auth setting).
3. On success, the visitor is redirected to `/` (Home — Story 1.4 will build its real content; until then a minimal placeholder is acceptable there).
4. An already-registered email shows an inline error under the email field; an invalid email format or a password that fails Supabase's minimum policy shows an inline error under the relevant field. In every error case, the values already typed are preserved (no form reset).
5. The submit action is unavailable (disabled / no-op) while a submission is in flight, so a double-click cannot fire two sign-up attempts.

## Tasks / Subtasks

- [x] Task 1: Install and configure the Supabase JS client libraries (AC: #2)
  - [x] `pnpm add @supabase/supabase-js @supabase/ssr` — installed `@supabase/ssr@0.12.4`, `@supabase/supabase-js@2.112.2` (matches researched versions exactly)
  - [x] Create `src/lib/auth/supabase-browser.ts` — browser client via `createBrowserClient` (reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
  - [x] Create `src/lib/auth/supabase-server.ts` — server client via `createServerClient`, wired to the Next.js cookie store (reads the same two `NEXT_PUBLIC_*` vars — the publishable key is safe server-side too, it's just also safe in the browser)
  - [x] Create `src/proxy.ts` (**not** `middleware.ts` — Next.js 16 deprecated and renamed the `middleware` file convention to `proxy`; export the function as `proxy`, not `middleware`, or the build warns and the codemod suggestion appears) — refreshes the Supabase session cookie on every request (required per Supabase's Next.js SSR guide; Server Components cannot write cookies themselves). **Discovered during implementation:** initially written as `middleware.ts`/`export function middleware`, which built successfully but with a deprecation warning ("middleware-to-proxy" codemod suggestion) — corrected to `proxy.ts`/`export function proxy` per `node_modules/next/dist/docs/.../file-conventions/proxy.md`, confirmed with a clean rebuild (no warning, route table shows "ƒ Proxy (Middleware)").
- [x] Task 2: Verify the Supabase Auth email-confirmation setting (AC: #2)
  - [x] Checked with the user; "Confirm email" was ON, user disabled it (2026-08-10) — `supabase.auth.signUp()` now signs the user in immediately, satisfying AC #2 literally
- [x] Task 3: Build the Sign-in/Sign-up screen and the sign-up Server Action (AC: #1, #3, #4, #5)
  - [x] Create `src/app/sign-in/page.tsx` — hosts `<SignUpForm />` (colocated at `src/app/sign-in/sign-up-form.tsx`, a Client Component); a code comment marks the extension point for Story 1.3's sign-in form on the same page
  - [x] Create the sign-up Server Action `src/lib/auth/actions.ts` — `signUp(prevState, formData)` calling `supabase.auth.signUp({ email, password })` via the server client, typed as `SignUpState` for `useActionState`
  - [x] Wire form submission to the Server Action via `useActionState`; on success the action calls `redirect("/")`
  - [x] Surface Supabase Auth errors as inline, field-associated messages via a best-effort `classifySignUpError()` text match (email/password/general), each rendered with `role="alert"` and `aria-describedby` on the matching input; uncontrolled inputs mean typed values are never cleared on error (no client-side form reset anywhere)
  - [x] Disable the submit control while pending — `useActionState`'s third return value (`isPending`) drives `disabled` on the submit button
- [x] Task 4: Regression check
  - [x] `pnpm build` — zero TypeScript errors, `/sign-in` registered as a static route
  - [x] `pnpm lint` — clean
  - [x] Verified end-to-end against the real Supabase project (script using the publishable key only, no secrets exposed): a fresh sign-up returns an immediate session (confirm-email OFF, satisfies AC #2) and a real `user.id`
  - [x] Verified duplicate-email behavior against the real project: second sign-up with the same email returns "User already registered", and `classifySignUpError` correctly buckets it as the `email` field (satisfies AC #4's field-association requirement)
  - [x] Verified `/sign-in` renders the expected form fields via a local `pnpm dev` + `curl` smoke test (200, `name="email"`, `name="password"`, submit button present)

### Review Findings

- [x] [Review][Decision] No automated test coverage exists for this story's ~230 lines of auth-critical logic (client factories, `proxy.ts`, the Server Action, `classifySignUpError`), and no test framework is configured in the project at all yet (no test runner in `package.json`, established by any prior story). Options: (1) add a minimal test framework (e.g. Vitest) now and write unit tests for `classifySignUpError` and the action's validation branches, or (2) explicitly defer test-infrastructure setup to a dedicated future story and accept this story ships without automated tests, verified only by the manual/scripted checks already in Task 4. **Resolved: option (1).** Added Vitest, extracted `classifySignUpError` to its own module (required — `"use server"` files may only export async functions), and wrote 10 unit tests covering it plus `signUp()`'s pre-Supabase validation branches.
- [x] [Review][Patch] Stale comment in `supabase-server.ts` still says "middleware.ts" — the file was renamed to `proxy.ts` during this story but the comment wasn't updated [src/lib/auth/supabase-server.ts:28]
- [x] [Review][Patch] Malformed email never reaches the app's own inline-error mechanism — only native HTML5 `type="email"` validation blocks it client-side, which doesn't use the same `role="alert"`/`aria-describedby` pattern as the other two error cases and isn't guaranteed consistent across browsers. AC #4 asks for an inline error under the field for this case specifically [src/lib/auth/actions.ts]
- [x] [Review][Patch] `signUp()` can return no error while not actually producing a usable session (e.g. Supabase's "fake user, empty identities" response for an edge case in its own API) — the action redirects to `/` unconditionally on no-error, which could silently strand the user in a broken state [src/lib/auth/actions.ts:30-35]
- [x] [Review][Patch] Non-null assertions (`!`) on `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in all three Supabase touchpoints mean a missing env var fails with an opaque runtime error deep inside the Supabase client instead of a clear config error [src/lib/auth/supabase-browser.ts, src/lib/auth/supabase-server.ts, src/proxy.ts]
- [x] [Review][Patch] `setAll`'s catch-all in the server client silently swallows every error, not just the expected "called from a Server Component" case — a real cookie-write failure would be invisible [src/lib/auth/supabase-server.ts]
- [x] [Review][Patch] `formData.get("email")`/`("password")` are coerced with `String()` without checking they're actually strings (a `File` value coerces to `"[object File]"` and gets sent to Supabase as-is) [src/lib/auth/actions.ts:17-18]
- [x] [Review][Patch] Email is never trimmed — leading/trailing whitespace becomes part of the stored account email, which can cause sign-in mismatches later [src/lib/auth/actions.ts:17]
- [x] [Review][Patch] `proxy.ts`'s `supabase.auth.getUser()` call is unguarded — a Supabase outage or network error throws unhandled and fails every matched request site-wide, not just auth-related ones [src/proxy.ts:38]
- [x] [Review][Defer] No rate limiting or bot protection on the sign-up Server Action [src/lib/auth/actions.ts] — deferred, out of this story's scope; Supabase Auth has its own baseline rate limits server-side; a dedicated hardening pass can revisit if abuse becomes a real problem
- [x] [Review][Defer] `proxy.ts`'s matcher doesn't specifically exclude API/route-handler paths from the session-refresh call [src/proxy.ts] — deferred, no API routes exist yet in this project (Server Actions are the write-path per Architecture AD-2), so there's nothing to exclude today; revisit if/when a Route Handler with different auth needs is added

## Dev Notes

- **AD-2 exception, confirmed applicable here:** Architecture AD-2 forbids client writes to *domain* tables (`Room`, `Piece`, etc.) — it does not forbid using the Supabase Auth client. Dev Notes on Consistency Conventions explicitly say "Auth via Supabase Auth (JWT)." This story's use of `supabase.auth.signUp()` (via the server client, from a Server Action) is compliant. Do not read AD-2 as blocking all Supabase SDK usage — only `.from(table).insert/update/delete()` on domain tables is forbidden.
- **Key naming (carried from Story 1.1, verified again 2026-08-10):** use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — this is also what Supabase's own current Next.js SSR docs use verbatim, so no naming mismatch to reconcile. Do **not** introduce `anon`/`service_role`-named variables; they don't exist in `.env.example` and shouldn't reappear.
- **Two Supabase clients, not one (Next.js App Router requirement):** a browser client (Client Components) and a server client (Server Components/Actions/Route Handlers) are both required — they are not interchangeable, per Supabase's current SSR guidance. `src/proxy.ts` is mandatory alongside them; without it, session cookies never refresh and users get silently signed out.
- **Versions (verified 2026-08-10):** `@supabase/ssr@0.12.4`, `@supabase/supabase-js@2.112.2`. Pin exact or caret consistent with how Story 1.1 pinned `pg`/`konva` (caret is fine here — these are both post-1.0, stable, unlike the pre-1.0 TanStack family which required exact pins).
- **`lib/auth/` already exists** (created empty in Story 1.1, currently only a `.gitkeep`) — this is the designated home per the Architecture source tree. Remove the `.gitkeep` once real files land there. Every future Server Action's authorization check must also live under `lib/auth/` per Architecture ("Toute Server Action mutante... importe son autorisation depuis `lib/auth/`... jamais de réimplémentation inline") — this story is the first tenant of that directory, keep it structured for that future use (e.g. don't dump unrelated logic there).
- **`/sign-in` as a single combined route, not `/sign-up` + `/sign-in` as two pages:** EXPERIENCE.md's Information Architecture lists exactly one surface, "Connexion / Inscription," reached from Accueil or from the exit-prompt (FR-10). AC #1 reflects this — build the shared screen now with only the sign-up half wired, so Story 1.3 extends rather than restructures it.
- **Email confirmation is a real product decision, not just config (Task 2):** PRD's whole low-friction thesis (UJ-1, §4.3) is about removing friction from participation. A mandatory "check your email to confirm" step between sign-up and first use of the app would contradict AC #2's literal wording ("automatically signed in"). Default assumption: turn confirmation OFF for V1. This is a Supabase Dashboard toggle, not a code change — treat it the same way Story 1.1 treated Supabase project settings (guide the user through it if interactive, don't silently assume it's already correct).
- **No domain tables touched by this story.** `Participant`/`RoomParticipant` are Postgres domain tables that don't exist yet (they land when a story actually needs them — likely Epic 1 Story 1.4/Home or wherever `Participant.isGuest` first gets read). Story 1.2 only creates a Supabase Auth user (`auth.users`, managed entirely by Supabase, not something this story creates a migration for). Do not create a `Participant` table in this story — that's scope creep beyond AC #1–#5.
- **NFR4 (accessibility) applies:** the form needs associated `<label>`s, inline errors announced accessibly (e.g. `aria-describedby` linking the error to its field), and the submit button needs a visible disabled/pending state — consistent with the accessibility floor established in EXPERIENCE.md and already applied to canvas controls in Story 1.1.

### Project Structure Notes

- New files land under `src/lib/auth/` (client/server Supabase clients, Server Action) and `src/app/sign-in/` (the page) — both already anticipated by the Architecture source tree seeded in Story 1.1.
- `src/proxy.ts` is new — Architecture's Structural Seed didn't call it out explicitly, but it's a hard technical requirement of the SSR auth pattern the Consistency Conventions commit to ("Auth via Supabase Auth (JWT)"). No conflict, just an addition.
- No variance from the unified structure otherwise.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#AD-2] — Server-authoritative writes; Auth is the named exception to the "no client SDK for domain writes" rule
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md#Consistency-Conventions] — "Auth via Supabase Auth (JWT); un Guest est une session sans compte, promue en Participant authentifié sur inscription"
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#Information-Architecture] — single "Connexion / Inscription" surface
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#State-Patterns] — "Connexion/Inscription, erreur" — inline error under the relevant field, no redirect, no lost input
- [Source: _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md#4.3] — low-friction access thesis (informs the email-confirmation-off recommendation)
- [Source: _bmad-output/implementation-artifacts/1-1-project-bootstrap.md] — established conventions (pnpm-only, `src/` layout, minimal-stub pages, `lib/auth/` placeholder, exact env var names)
- Supabase Next.js SSR setup guide (verified 2026-08-10): https://supabase.com/docs/guides/auth/server-side/nextjs

## Previous Story Intelligence (from Story 1.1)

- pnpm is the only package manager — every install command in Tasks above uses `pnpm add`.
- `src/` layout is established (`src/app/`, `src/lib/`, `src/components/`) — this story's new files follow the same prefix.
- Minimal-stub convention for pages was reinforced during Story 1.1's code review (the default `create-next-app` homepage/metadata had to be corrected because it wasn't minimal) — `/sign-in`'s page should be purpose-built from the start, not scaffolded boilerplate.
- Story 1.1's review also established: any `next/dynamic` usage needs a `loading` fallback, and `package.json` version pins should be deliberate (exact for pre-1.0 packages, caret acceptable for stable post-1.0 ones like the Supabase JS packages here) — apply the same discipline.
- Env var names are final and already correct in `.env.example`/`.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `SUPABASE_STORAGE_BUCKET` — this story only needs the first two.

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- `middleware.ts`/`export function middleware` built successfully but produced a deprecation warning and codemod suggestion — Next.js 16 renamed the convention to `proxy.ts`/`export function proxy`. Confirmed via `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and corrected before Task 1 was marked complete.
- Verified Supabase Auth behavior against the real project via a throwaway Node script (publishable key only, deleted after use, no secrets ever printed) rather than trusting the dashboard toggle alone — confirmed empirically that disabling "Confirm email" actually produces an immediate session on sign-up, and that a duplicate-email error message contains "registered" (so `classifySignUpError`'s substring match correctly buckets it under `email`).
- Code review (2026-08-11): `classifySignUpError` could not be exported directly from `actions.ts` for testing — Next.js requires every top-level export of a `"use server"` file to be an async function. Extracted it to `src/lib/auth/classify-sign-up-error.ts` (plain module, no directive) rather than working around the constraint.

### Completion Notes List

- Two Supabase clients created (`src/lib/auth/supabase-browser.ts`, `src/lib/auth/supabase-server.ts`) plus `src/proxy.ts` for session-cookie refresh, per Supabase's current Next.js SSR guidance (verified against Supabase's docs 2026-08-10, not assumed from training data — the package versions and the cookie `getAll`/`setAll` API shape were both confirmed against the installed package's own type definitions).
- Sign-up Server Action (`src/lib/auth/actions.ts`) and form (`src/app/sign-in/sign-up-form.tsx` + `src/app/sign-in/page.tsx`) implemented with React 19's `useActionState` — no separate client-side validation library added; relies on native `required`/`type="email"` HTML validation plus Supabase's own server-side checks, consistent with not over-building beyond this story's AC.
- Confirmed empirically (not just by code review) against the live Supabase project: fresh sign-up returns an immediate session (AC #2), duplicate sign-up returns a classifiable "already registered" error (AC #4).
- `/sign-in` is intentionally a single shared route for both sign-up and sign-in, per EXPERIENCE.md's IA (one "Connexion / Inscription" surface) — Story 1.3 adds the sign-in form to the same page rather than creating a second route.
- No domain tables created — this story only touches Supabase's own `auth.users`, managed entirely by Supabase.
- **Code review round (2026-08-11):** all 8 patch findings applied plus the test-coverage decision (Vitest added). Details: stale `proxy.ts` comment fixed; server-side email-format validation added (`EMAIL_PATTERN`) so malformed emails hit the app's own inline-error mechanism instead of relying solely on native HTML5 validation; `signUp()` now checks `data.session` before redirecting, returning a `general` error instead of silently stranding the user; all three Supabase touchpoints now go through a shared `getSupabaseEnv()` helper (`src/lib/auth/env.ts`) that throws a clear config error instead of using non-null assertions; the server client's `setAll` catch now logs via `console.warn` instead of swallowing silently; `FormData` fields are now type-checked (`typeof === "string"`) before use, rejecting `File`/`Blob` values with a `general` error; email is now trimmed before validation/submission; `proxy.ts`'s `getUser()` call is now wrapped in try/catch so a Supabase outage doesn't fail every matched route. Verified via `pnpm build`, `pnpm lint`, `pnpm test` (all clean).

### File List

**New:**
- `src/lib/auth/supabase-browser.ts`
- `src/lib/auth/supabase-server.ts`
- `src/proxy.ts`
- `src/lib/auth/actions.ts`
- `src/app/sign-in/page.tsx`
- `src/app/sign-in/sign-up-form.tsx`
- `src/lib/auth/env.ts` (added during code review — shared env-var validation for all Supabase touchpoints)
- `src/lib/auth/classify-sign-up-error.ts` (added during code review — extracted from `actions.ts` so it's independently testable outside a `"use server"` file)
- `src/lib/auth/classify-sign-up-error.test.ts` (added during code review)
- `src/lib/auth/actions.test.ts` (added during code review)
- `vitest.config.mts` (added during code review)

**Modified:**
- `package.json` (added `@supabase/supabase-js`, `@supabase/ssr`; code review added `vitest`, `@vitejs/plugin-react` as devDependencies and a `test` script)
- `pnpm-lock.yaml` (re-synced)

**Removed:**
- `src/lib/auth/.gitkeep` (superseded by real files in that directory)

**External state, not files:** Supabase Auth project setting "Confirm email" turned OFF (user-guided, via dashboard) — see Task 2.

## Change Log

| Date | Change |
|------|--------|
| 2026-08-10 | Story implemented: Supabase Auth sign-up flow (AC #1–#5) |
| 2026-08-11 | Code review: 1 decision resolved (Vitest added), 8 patches applied, 2 items deferred to `deferred-work.md`. Status → done. |
