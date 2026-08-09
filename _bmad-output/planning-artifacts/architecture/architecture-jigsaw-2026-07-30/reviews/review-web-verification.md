---
name: 'Web Verification Review — Architecture Spine (Jigsaw)'
type: review
reviewed: architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md
date: '2026-08-02'
scope: 'Technology currency and fit claims only (Stack section + AD-1/AD-2/AD-5). Structure, completeness, and AD wording are out of scope.'
---

# Web Verification Review — Technology Currency & Fit

## 1. Next.js (App Router) — 15.x

**Verdict: confirmed-with-caveat**

Next.js App Router is real, stable, and the default routing model since v13.4 — that part of the claim holds. However, as of July 2026 the ecosystem has moved past 15.x: **Next.js 16.2.11 is the current Active LTS line, with 15.5.21 now in Maintenance LTS.** The spine's "15.x" pin is stale relative to today's actual latest major. Not a functional problem (15.x still works and is supported), but the spine should say "16.x (or latest LTS at bootstrap)" rather than fixing on 15.x, since the note "à re-vérifier au bootstrap" will need to actually bump this.

Also worth noting: Next.js shipped a coordinated **security release in May 2026** patching 13 advisories (DoS, middleware/proxy bypass, SSRF, cache poisoning, XSS) — reinforces the need to pin an actually-current patch version at bootstrap, not just "15.x."

Sources: https://nextjs.org/blog/next-15-5 · https://vercel.com/changelog/next-js-may-2026-security-release · https://releasebot.io/updates/vercel/next-js

## 2. React — 19.x

**Verdict: confirmed-current**

React 19 is the current major (no React 20 announced); latest patch as of the search was 19.2.8 (July 21, 2026). Actions, Server Components, and the React Compiler are stable. The spine's "19.x" claim is accurate and current.

Sources: https://react.dev/versions · https://github.com/react/react/releases/tag/v19.2.8

## 3. TypeScript — 5.x

**Verdict: confirmed-current** (not independently re-searched — 5.x has been the stable major for several years with no breaking major-version change reported in any of the above searches; nothing found contradicts this. Low risk, not flagged further.)

## 4. TanStack DB

**Verdict: confirmed-with-caveat**

TanStack DB exists, is actively developed, and does pair with ElectricSQL via the official `@tanstack/electric-db-collection` package — this is a first-party, documented integration (electric-collection docs, Electric's own blog post on TanStack DB, Neon's writeup), so the paradigm claim ("TanStack DB + ElectricSQL for optimistic-mutation sync") is accurate and current. **However, TanStack DB itself is still pre-1.0/beta as of mid-2026** (v0.6 shipped March 2026 with persistence/offline support; TanStack's own site lists DB as "beta" while Query/Router/Table/Form/Virtual are stable). The spine's own text already flags this ("écosystème jeune, évolue vite — pinner au bootstrap"), so this is a self-aware caveat rather than a new finding — but it's worth stating plainly for the record: **do not treat TanStack DB as production-hardened; expect breaking changes before 1.0.**

Sources: https://tanstack.com/db/latest/docs/collections/electric-collection · https://electric-sql.com/blog/2025/07/29/local-first-sync-with-tanstack-db · https://neon.com/blog/tanstack-db-and-electricsql · https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes

## 5. ElectricSQL

**Verdict: confirmed-with-caveat**

ElectricSQL is real, under active development (Electric Cloud self-serve pricing shipped April 2026; GitHub canary builds as recent as July 2026), and its Postgres/Supabase fit claim is directly confirmed by both parties' docs.

Two caveats worth surfacing:
- **Company size/funding risk**: ElectricSQL is a small team (~21 employees per Tracxn, March 2026), founded 2021, with only one funding round on record (amount not disclosed in available sources). Not a red flag on its own, but for a build-substrate decision on a young sync engine, the bus-factor/continuity risk is real and not addressed anywhere in the spine.
- **Security**: A critical (CVSS 9.9) SQL-injection vulnerability, **CVE-2026-40906**, was found in the `/v1/shape` API's `order_by` parameter, affecting Electric versions 1.1.12 up to (not including) 1.5.0. It was patched within 84 minutes of report (fixed in 1.5.0, released April 2, 2026). This is exactly the Shape/read-sync mechanism AD-1 depends on — the spine's "pinner au bootstrap" instruction must resolve to **≥1.5.0**, not just "latest stable" picked without checking the CVE history.

**Confirmed as true**: the "direct connection, not pooler, for logical replication" constraint is accurate — Supabase's pooler (Supavisor) does not support logical replication; Electric must connect via the direct/IPv6 connection string (with `ELECTRIC_DATABASE_USE_IPV6=true`), and a separate `ELECTRIC_POOLED_DATABASE_URL` can be used for non-replication queries. This matches Electric's own Supabase integration docs.

Sources: https://electric-sql.com/docs/integrations/supabase · https://tracxn.com/d/companies/electricsql/__1bvfUdFkJRX6-ZaPglPEEjKyYnj_7jOY2J2BG6cD2tg · https://www.thehackerwire.com/electricsql-v1-shape-critical-sql-injection-cve-2026-40906/ · https://nvd.nist.gov/vuln/detail/CVE-2026-40906 · https://electric-sql.com/blog/2026/04/02/electric-cloud-pricing

## 6. Konva.js / react-konva (vs. PixiJS, for a few hundred–~1500 draggable objects)

**Verdict: confirmed**

Konva.js is actively maintained. The fit claim holds: Konva (Canvas2D, object-oriented, layer-based) is well suited to interactive UI-style canvases with drag/click/hover — node editors and design tools built on Konva routinely scale to thousands of objects while maintaining 60fps on mobile by separating static/interactive content across layers. PixiJS (WebGL) wins specifically for high-frame-rate animation with many *moving/animated* sprites (games), which is not this app's use case (draggable-but-mostly-static puzzle pieces). For Jigsaw's ~few-hundred-to-1500 draggable-piece scale, Konva/react-konva over PixiJS is a reasonable, well-supported choice.

Sources: https://konvajs.org/docs/guides/why-konva.html · https://konvajs.org/docs/sandbox/Jumping_Bunnies.html · https://aircada.com/blog/pixijs-vs-konva

## 7. Next.js Server Actions (as write-path pattern)

**Verdict: confirmed-current**

Server Actions are a stable, first-party Next.js/React 19 feature (part of React's stable Actions model referenced above) and are a standard, documented pattern for authoritative server-side writes in the App Router. No currency or fit issues found.

## 8. Supabase (Postgres, Auth, Storage)

**Verdict: confirmed-current**

Supabase is an actively developed, managed platform in 2026 (Storage performance work, Auth log drains, PostgREST v14, ongoing Postgres version-support lifecycle — e.g., Postgres 14 support ended July 1, 2026 with auto-upgrade for lagging projects). The "managed, latest platform version" framing in the spine is appropriate — just note the Postgres-14 EOL detail as a reminder to confirm the project's Postgres version isn't stale at bootstrap.

Sources: https://supabase.com/changelog/43465-developer-update-march-2026 · https://dev.to/ottoaria/supabase-in-2026-the-complete-developer-guide-to-the-open-source-firebase-alternative-357j

## 9. Capacitor

**Verdict: confirmed-current**

Capacitor (Ionic) remains actively maintained, fully open source, and is still the standard way to wrap a web app for native app-store distribution (iOS/Android) without requiring the Ionic UI framework. No currency or fit concerns found.

Sources: https://capacitorjs.com/ · https://github.com/ionic-team/capacitor

## 10. Tailwind CSS + shadcn/ui

**Verdict: confirmed-current**

Tailwind CSS v4 is current (v4.3.1 as of June 2026, CSS-first config, Lightning CSS compiler). shadcn/ui is actively maintained with monthly updates and a July 2026 change to Base UI as the default underlying primitive library (Radix remains supported, not deprecated). Both are healthy, current choices; no action needed beyond the spine's existing "already fixed by DESIGN.md, pin at bootstrap" note.

Sources: https://tailwindcss.com/blog/tailwindcss-v4 · https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default

## 11. Vercel (hosting)

**Verdict: confirmed-current**

Vercel remains a leading, actively developed Next.js hosting platform in 2026 (2.3M+ sites hosted as of early 2026). One market-context note (not a spine defect): some 2026 commentary argues Vercel is less ideal for teams needing heavier backend/ops control, but for a project of this shape ("no ops, automatic scaling") it remains a reasonable default.

Sources: https://focusreactive.com/when-to-host-on-vercel-and-when-not/ · https://kuberns.com/blogs/vercel-nextjs-2026-what-it-is-and-why-developers-are-switching/

---

## Summary Table

| Technology | Verdict |
| --- | --- |
| Next.js (App Router) 15.x | confirmed-with-caveat — 16.x is now current LTS; 15.x is maintenance-only |
| React 19.x | confirmed-current |
| TypeScript 5.x | confirmed-current |
| TanStack DB | confirmed-with-caveat — still pre-1.0/beta, expect breaking changes |
| ElectricSQL | confirmed-with-caveat — small team/single funding round; must pin ≥1.5.0 (CVE-2026-40906 fixed there) |
| Konva.js / react-konva vs. PixiJS | confirmed |
| Next.js Server Actions | confirmed-current |
| Supabase (Postgres/Auth/Storage) | confirmed-current |
| Capacitor | confirmed-current |
| Tailwind CSS + shadcn/ui | confirmed-current |
| Vercel | confirmed-current |

**Net assessment**: no technology in the Stack is deprecated, abandoned, or wrongly characterized. The one factual staleness is the Next.js "15.x" pin (current LTS is 16.x). The two items needing explicit bootstrap-time attention beyond "pin latest stable" are: TanStack DB's pre-1.0 status (already flagged in the spine) and ElectricSQL's minimum safe version (≥1.5.0, due to CVE-2026-40906) plus its small-team continuity risk (not previously flagged anywhere in the spine).
