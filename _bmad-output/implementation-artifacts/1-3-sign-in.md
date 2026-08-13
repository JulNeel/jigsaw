---
baseline_commit: 816d2d5
---

# Story 1.3: Sign-in

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a registered Participant,
I want to sign in with my existing account,
so that I recover my identity and any future persisted data.

## Acceptance Criteria

1. A registered Participant on `/sign-in` sees a sign-in form on the same screen as the sign-up form (EXPERIENCE.md IA: a single "Connexion / Inscription" surface — Story 1.2 already built the sign-up half and left an explicit extension point at `src/app/sign-in/page.tsx`).
2. Submitting valid credentials (email + password matching an existing Supabase Auth account) signs the Participant in and redirects to `/` (Home — Story 1.4 builds its real content; until then the existing minimal placeholder is acceptable).
3. Submitting invalid credentials (wrong password, or an email with no matching account) shows an inline error message and does **not** redirect. The values already typed are preserved (no form reset) — same State Pattern as Story 1.2's error handling (EXPERIENCE.md: "Connexion/Inscription, erreur").
4. The error message does not reveal whether the *email* or the *password* was wrong — Supabase's own `signInWithPassword` response is a single generic "Invalid login credentials" message for both cases, and splitting it into a field-specific error would let an attacker enumerate registered emails. Render it as a general, non-field-associated error (see Dev Notes).
5. The submit action is unavailable (disabled / no-op) while a submission is in flight, so a double-click cannot fire two sign-in attempts — same pattern as Story 1.2's sign-up submit button.

## Tasks / Subtasks

- [x] Task 1: Add the sign-in Server Action (AC: #2, #3, #4)
  - [x] In `src/lib/auth/actions.ts`, add `signIn(prevState, formData)` calling `supabase.auth.signInWithPassword({ email, password })` via the existing server client (`src/lib/auth/supabase-server.ts` — no new client needed)
  - [x] Reuse the same `FormData` hardening already applied to `signUp` in Story 1.2's code review: type-check `formData.get(...)` is a `string` before use (reject `File`/`Blob` with a general error), `.trim()` the email
  - [x] Do **not** reuse `classifySignUpError` for sign-in — its field-classification logic is specifically for sign-up's distinct error cases (already-registered email, weak password) and does not apply here (see AC #4). Return a single `general`-field error for any `signInWithPassword` failure.
  - [x] On success, verify `data.session` exists before redirecting (same defensive check Story 1.2 added for `signUp` — apply it here too, don't skip it just because this is "just" sign-in)
  - [x] `redirect("/")` on confirmed success
- [x] Task 2: Build the sign-in form and wire it into the existing `/sign-in` screen (AC: #1, #3, #5)
  - [x] Create `src/app/sign-in/sign-in-form.tsx` (Client Component), following the exact pattern already established by `src/app/sign-in/sign-up-form.tsx`: `useActionState`, uncontrolled inputs, `aria-describedby`/`role="alert"` on the error, `disabled={isPending}` on submit
  - [x] Update `src/app/sign-in/page.tsx` to render both `<SignInForm />` and `<SignUpForm />` on the same screen, replacing the placeholder comment left by Story 1.2 — decide and implement a simple, non-blocking way to present both (e.g. two stacked sections with headings "Sign in" / "Create an account"; no tabs/modals needed, EXPERIENCE.md doesn't call for that complexity)
  - [x] General-field error renders as a plain `role="alert"` message not tied to either input's `aria-describedby` (per AC #4 — there is no "relevant field" for this specific error case)
- [x] Task 3: Unit tests (continuing the Vitest suite added in Story 1.2's code review)
  - [x] `src/lib/auth/actions.test.ts` (existing file): add cases for `signIn`'s pre-Supabase validation branches (missing email, missing password, non-string `FormData` field) — mirror the existing `signUp` test structure in the same file
  - [x] No new classifier module needed (Task 1 explicitly avoids one) — nothing else to unit-test in isolation; the Supabase-calling branch is out of unit-test scope, same as `signUp`'s, and stays covered by the manual/scripted verification in Task 4
- [x] Task 4: Regression check
  - [x] `pnpm build` — zero TypeScript errors
  - [x] `pnpm lint` — clean
  - [x] `pnpm test` — all tests pass (16 total after code review: 10 from Story 1.2 + 4 sign-in validation tests + 2 credential-error-handling tests added during code review)
  - [x] Verified end-to-end against the real Supabase project (throwaway script using the publishable key only, deleted after use, no secrets exposed): correct credentials return a session; both a wrong password and an unknown email return the same generic "Invalid login credentials" message, confirming AC #4's anti-enumeration behavior empirically rather than assuming it
  - [x] Verified `/sign-in` renders both forms via a local `pnpm dev` + `curl` smoke test — distinct field IDs (`sign-in-email`/`sign-in-password` vs `email`/`password`) confirmed no DOM id collisions between the two forms

### Review Findings

- [x] [Review][Patch] `SignInForm` computes a `field`-shaped error (`"email"` / `"password"` / `"general"`) but never uses it — no `aria-describedby`/`aria-invalid` wiring to either input, unlike `SignUpForm`. Task 2 explicitly required reusing `SignUpForm`'s pattern (`aria-describedby`/`role="alert"`), and Dev Notes justify keeping `SignInState`'s field shape specifically so the form *could* reuse that pattern — but the form never does. Violates NFR4 for the two validation branches that do implicate a real field (missing email, missing password) [src/app/sign-in/sign-in-form.tsx]
- [x] [Review][Patch] `signIn`'s `if (error || !data.session)` collapses every Supabase failure — including non-credential cases like rate-limiting (429) or a transient network/5xx error — into "Invalid email or password.", which is misleading when the credentials were never actually wrong [src/lib/auth/actions.ts:104-111]
- [x] [Review][Patch] No automated test asserts the anti-enumeration property (a credential-related Supabase error always yields `field: "general"`) — currently verified only by a one-off manual script that was deleted after use, so a future regression here would go uncaught by the test suite [src/lib/auth/actions.test.ts]
- [x] [Review][Patch] `SignInState` is a byte-for-byte duplicate of `SignUpState` — future changes to one's shape (e.g. a new `field` variant) require manually keeping the other in sync [src/lib/auth/actions.ts:7-12,64-69]
- [x] [Review][Patch] The two `<section>`s on `/sign-in` ("Sign in" / "Create an account") aren't distinguished for assistive tech beyond their `<h2>` text — no `aria-label` on either section [src/app/sign-in/page.tsx]
- [x] [Review][Defer] `createClient()` and `supabase.auth.signInWithPassword()` are both unguarded against a thrown/rejected promise (e.g. network failure) — an unhandled exception would crash the action instead of surfacing an inline error. Pre-existing pattern shared with `signUp` (Story 1.2), not introduced by this story; a fix should cover both actions together rather than diverging between them [src/lib/auth/actions.ts]
- [x] [Review][Defer] No timeout on the Supabase network call — a stalled network leaves the pending state hanging indefinitely with no user feedback. Same pre-existing pattern as `signUp`; no story-wide timeout strategy exists yet to apply consistently [src/lib/auth/actions.ts]
- [x] [Review][Defer] Potential timing side-channel: `signInWithPassword` likely takes measurably longer for a real account (password hash comparison) than an unknown email, which could theoretically let an attacker distinguish the two despite the identical error message. Mitigating this is an architecture-level decision (e.g. constant-time padding) out of scope for a single story [src/lib/auth/actions.ts]

## Dev Notes

- **Same route, same page, two forms — not two routes.** This was already decided in Story 1.2 (EXPERIENCE.md's IA lists exactly one "Connexion / Inscription" surface) and `src/app/sign-in/page.tsx` already has a comment marking this exact extension point. Do not create `/sign-up` as a separate route.
- **No new Supabase client needed.** `src/lib/auth/supabase-server.ts` (server client) and `src/proxy.ts` (session-cookie refresh) are both already in place from Story 1.2 and are auth-flow-agnostic — sign-in reuses them as-is. `src/lib/auth/env.ts`'s `getSupabaseEnv()` helper (added in Story 1.2's code review) already centralizes env-var validation; nothing new to add there.
- **`classifySignUpError` is sign-up-specific, do not repurpose it.** It exists at `src/lib/auth/classify-sign-up-error.ts` and matches on substrings like "registered" and "email" — those are sign-up error shapes. `signInWithPassword` returns a flat "Invalid login credentials" for both a wrong password and a nonexistent email, by design (Supabase does not distinguish, specifically to prevent user enumeration). AC #4 above codifies this as an explicit product/security decision: **do not** try to guess which field was wrong from the message text — that would be inventing a distinction Supabase deliberately doesn't provide, and doing so via heuristics could produce a wrong (and worse, *misleading*) field association.
- **`SignInState` type:** mirror `SignUpState`'s shape (`{ error?: { field: "email" | "password" | "general"; message: string } }`) for consistency even though sign-in will in practice only ever populate `field: "general"` — keeping the same shape means `SignInForm` can reuse the exact same rendering pattern as `SignUpForm` (checking `state.error?.field === "..."`) without a special case.
- **Reuse Story 1.2's hardening patterns exactly, don't re-derive them:** `FormData` string type-checks and `.trim()` on email were added to `signUp` during Story 1.2's code review specifically because they're generically applicable to any form-backed Server Action, not sign-up-specific. Apply them to `signIn` from the start this time rather than waiting for a second review round to catch the same class of issue.
- **Session-before-redirect guard, same reasoning as Story 1.2:** `signInWithPassword` can theoretically resolve without a populated `session` in edge cases; Story 1.2's review added a `if (!data.session) return { error: {...} }` guard before `signUp`'s redirect for exactly this reason. Apply the same guard to `signIn` proactively.
- **NFR4 (accessibility) applies**, same as Story 1.2: labelled inputs, `aria-describedby` linking errors to fields (where a field is actually implicated — see AC #4 for the general-error exception), visible disabled/pending state on submit.
- **No domain tables touched.** Same as Story 1.2 — this story only calls Supabase Auth (`auth.users`, fully managed), no `Participant`/`RoomParticipant` migration work.
- **Rate limiting:** deferred in Story 1.2's review (`deferred-work.md`) for the sign-up path, same rationale (Supabase Auth's own baseline server-side rate limits) applies unchanged to sign-in — not in scope for this story either.

### Project Structure Notes

- One new file: `src/app/sign-in/sign-in-form.tsx` (colocated with the existing `sign-up-form.tsx`, same directory, same pattern).
- One modified file: `src/app/sign-in/page.tsx` (render both forms instead of just `SignUpForm`).
- One modified file: `src/lib/auth/actions.ts` (add `signIn` + `SignInState` alongside the existing `signUp` + `SignUpState`; both are "use server" async exports, no directive conflict).
- One modified file: `src/lib/auth/actions.test.ts` (add `signIn` validation-branch tests to the existing test file).
- No new Supabase clients, no new `proxy.ts` changes, no new env vars, no domain-table migrations.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.3-Sign-in] — story statement and AC source
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#Information-Architecture] — single "Connexion / Inscription" surface (line 23)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md#State-Patterns] — "Connexion/Inscription, erreur": inline error under the relevant field, no redirect, no lost input (line 79)
- [Source: _bmad-output/implementation-artifacts/1-2-sign-up.md] — established conventions this story must follow exactly: pnpm-only, `useActionState` pattern, uncontrolled inputs, `FormData` string type-checks, email `.trim()`, session-before-redirect guard, `getSupabaseEnv()` helper, Vitest test structure
- Supabase `signInWithPassword` reference (same SDK version already installed, `@supabase/supabase-js@2.112.2`, verified in Story 1.2): returns a generic `AuthApiError` with message "Invalid login credentials" for both wrong-password and unknown-email cases — confirmed this is intentional anti-enumeration behavior, not a gap to work around

## Previous Story Intelligence (from Story 1.2)

- pnpm is the only package manager — every command uses `pnpm add`/`pnpm test`/etc.
- `useActionState` + uncontrolled inputs + `role="alert"`/`aria-describedby` is the established form-error pattern (`src/app/sign-in/sign-up-form.tsx`) — `sign-in-form.tsx` should look almost identical, differing mainly in which action it calls and its lack of field-specific errors.
- Story 1.2's code review (2026-08-11) added several hardening patterns that are now the project's baseline, not one-off fixes: `FormData` field type-checks, email `.trim()`, a session-before-redirect guard, and a shared `getSupabaseEnv()` helper instead of non-null assertions on env vars. This story's Tasks above already bake these in from the start — do not skip them and wait for review to add them again.
- Vitest is configured (`vitest.config.mts`, `pnpm test` script) with 10 existing tests in `src/lib/auth/classify-sign-up-error.test.ts` and `src/lib/auth/actions.test.ts` — extend the latter, don't create a parallel test setup.
- A `"use server"` file may only export async functions — this is why `classifySignUpError` lives in its own plain module (`src/lib/auth/classify-sign-up-error.ts`) rather than being exported from `actions.ts` directly. `signIn` itself is async so it can live directly in `actions.ts` without this issue; just don't try to export any new non-async helper from that file.

## Dev Agent Record

### Agent Model Used

Claude (BMad dev-story session)

### Debug Log References

- Verified `signInWithPassword`'s anti-enumeration behavior empirically (not assumed) via a throwaway Node script (publishable key only, deleted after use): a wrong password and an unknown email both return the identical "Invalid login credentials" message, confirming AC #4's rationale for not attempting a field-specific error.

### Completion Notes List

- Added `signIn()` + `SignInState` to `src/lib/auth/actions.ts`, alongside the existing `signUp()` — same file, both are async `"use server"` exports.
- Reused Story 1.2's hardening patterns from the start (not added retroactively via review this time): `FormData` string type-checks, email `.trim()`, and a session-before-redirect guard.
- Deliberately did **not** create a sign-in error classifier — `signInWithPassword` failures are always mapped to `field: "general"`, per the anti-enumeration reasoning in AC #4 and Dev Notes.
- Built `src/app/sign-in/sign-in-form.tsx` mirroring `sign-up-form.tsx`'s pattern; used distinct DOM ids (`sign-in-email`/`sign-in-password`) since both forms now render on the same page and would otherwise collide with the sign-up form's `email`/`password` ids.
- Updated `src/app/sign-in/page.tsx` to render both forms under separate `<section>`s with headings ("Sign in" / "Create an account") — resolves the extension point Story 1.2 left as a comment.
- Extended `src/lib/auth/actions.test.ts` with 4 new tests for `signIn`'s validation branches (14 total tests in the suite, all passing).
- Confirmed empirically against the live Supabase project: correct credentials produce a session; both a wrong password and an unknown email produce the same generic error (AC #4).
- No domain tables touched — this story only calls Supabase Auth, same as Story 1.2.
- **Code review round (2026-08-13):** all 5 patch findings applied, 3 deferred (all pre-existing patterns shared with `signUp`, not introduced by this story — logged in `deferred-work.md`). Details: `SignInForm` now wires `aria-describedby`/`aria-invalid` to the email/password inputs for the two validation branches that implicate a real field, matching `SignUpForm`'s pattern exactly; `signIn` now distinguishes credential errors (HTTP 400 → "Invalid email or password.") from other Supabase errors (rate limiting, network/5xx → "Something went wrong. Please try again."), so non-credential failures are no longer misreported as wrong credentials; `SignUpState`/`SignInState` unified under a shared `AuthFormState` type; both `<section>`s on `/sign-in` now have an `aria-label`; added 2 new unit tests mocking `supabase.auth.signInWithPassword` to lock in the anti-enumeration property (credential error → generic message) and the new non-credential-error branch. Verified via `pnpm build`, `pnpm lint`, `pnpm test` (16 tests, all clean).

### File List

**New:**
- `src/app/sign-in/sign-in-form.tsx`

**Modified:**
- `src/lib/auth/actions.ts` (added `signIn`, `SignInState`; code review added shared `AuthFormState` type and credential-vs-other-error branching)
- `src/app/sign-in/page.tsx` (renders both `SignInForm` and `SignUpForm`; code review added `aria-label` to each section)
- `src/app/sign-in/sign-in-form.tsx` (code review added `aria-describedby`/`aria-invalid` wiring for field-specific errors)
- `src/lib/auth/actions.test.ts` (added `signIn` validation tests; code review added 2 credential-error-handling tests)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-11 | Story implemented: Sign-in Server Action + form (AC #1–#5) |
| 2026-08-13 | Code review: 5 patches applied, 3 items deferred to `deferred-work.md`. Status → done. |
