---
title: Rubric Review — Architecture Spine (Jigsaw, 2026-07-30)
reviewer: independent rubric-walker (no prior context)
reviewed: ARCHITECTURE-SPINE.md, .memlog.md, prd.md
date: 2026-08-02
---

# Overall Verdict

The spine is well-formed as a document — terse, its five ADs are concrete and enforceable, the vocabulary/naming discipline is genuinely useful, and the two Mermaid diagrams are real and convey real structure. But it is **not yet complete as a build substrate**: two of the PRD's own hardest problems — concurrent-edit resolution for shared Clusters (FR-7, which the PRD explicitly hands to "the architecture") and the live-presence mechanism (FR-12) — are absent from the document entirely, not even flagged as Deferred. A hard infra constraint already known and written down in the memlog (Electric requires Supabase's direct/non-pooled, IPv6 connection) was dropped when distilling to the spine. These are exactly the class of gap this checklist is designed to catch: silent dimensions at the initiative altitude that two independently-built pieces (or a future collaborator vs. the solo dev's memory) can diverge on in system-breaking ways.

**Findings: 2 critical, 3 high, 3 medium, 2 low.**

# Per-Checklist-Item Verdicts

| # | Item | Verdict |
|---|---|---|
| 1 | Fixes real divergence points for the level below, misses none | **Partial** — misses FR-7 concurrency resolution and FR-12 presence mechanism, both structurally load-bearing |
| 2 | Every AD's Rule is enforceable, not vague/aspirational | **Pass** — all 5 ADs are concrete, checkable by reading code (no ambiguous language) |
| 3 | Nothing in Deferred could cause system-breaking divergence | **Partial** — what's listed is fine, but the list is under-inclusive; concurrency and presence should be there (or decided) and aren't anywhere |
| 4 | Named tech verified-current | **Pass, with one caveat** — TanStack DB + `@tanstack/electric-db-collection`, Konva/react-konva, Next.js 15/React 19, and Supabase+Electric integration are all real, current, and well-fitted; Capacitor's interaction with Next.js Server Actions is unverified/unstated in the spine |
| 5 | Every initiative-level dimension decided/deferred/or open question | **Fail** — infra constraint (Electric direct-connection requirement), image/tile storage, observability/ops, and presence are silent, not merely deferred |
| 6 | Diagrams valid Mermaid, not placeholders, convey structure | **Pass, with low-severity caveat** — both diagrams are real and legible; flowchart uses literal `\n` in quoted labels, worth a render check |
| 7 | Terse/convergent, not padded with rationale that belongs in the memlog | **Pass** — lean, ~145 lines, Prevents/Rule fields are the right amount of rationale for the format |

# Findings

## Critical

**C1 — FR-7 concurrent-edit conflict resolution is unaddressed anywhere in the spine.**
The PRD is explicit that this is architecture's problem to solve: "*la résolution des conflits d'édition concurrente est déléguée à l'architecture technique*" (PRD FR-7 Consequences) and lists it again as Open Question #4. AD-2 establishes a server-authoritative write path, but never states the concurrency discipline for two Server Actions racing on the same `Cluster`/`Piece` row (optimistic version check? row lock? last-write-wins?). Without this, two independently-built merge/placement handlers can implement incompatible strategies, producing exactly the "divergent state between clients of the same Room" that AD-1 is supposed to prevent.
*Location:* absent — should live as a new AD (or a Rule addendum to AD-2/AD-3), referencing PRD FR-7 and Open Question #4.
*Fix:* add an AD stating the conflict-resolution primitive (e.g., row-version optimistic check + reject-and-resync via the existing Electric shape), or explicitly move it to Deferred with a stated interim default that is provably safe (e.g., "single global advisory lock per Room for merge operations, revisit for perf later").

**C2 — Presence (FR-12) mechanism is completely absent — not decided, not in Stack, not in Structural Seed, not in Deferred.**
FR-12 requires tracking "online within the last 30 seconds," which is inherently ephemeral state. AD-1 forbids any parallel sync channel ("*Aucun polling ni canal de sync parallèle*") and mandates all shared state go through Postgres + an Electric Shape. Taken literally, that means presence heartbeats must be written to Postgres and streamed via Electric — a plausible but non-trivial choice (write amplification on every 30s tick, from every connected client) that is never stated. Alternatively, a future implementer reaches for Supabase Realtime Presence (a genuinely different, ephemeral pub/sub mechanism) — which would directly violate AD-1 as written. This is a real fork point between two equally plausible readings of the existing ADs, and the spine doesn't pick one.
*Location:* absent from AD-1, Stack, Structural Seed, and Deferred.
*Fix:* add a Rule (either as an AD-1 addendum or its own AD) stating explicitly how presence is implemented and reconciling it with the "no parallel sync channel" rule — e.g., "presence is out of scope for the Electric/Postgres sync path; implemented via [X], is allowed as the one explicit exception to AD-1."

## High

**H1 — Electric's Supabase direct-connection/IPv6/no-pooler constraint, already captured in the memlog, was dropped when distilling to the spine.**
The memlog records this as a load-bearing constraint (`.memlog.md` line 11: "*Electric necessite la connexion directe Postgres de Supabase (pas le pooler) pour la replication logique - IPv6 ou add-on IPv4 (plan Pro/Team) requis*"), and it is independently verifiable — Electric's own Supabase integration docs confirm the pooled connection string does not support logical replication and that direct connections default to IPv6 (add-on required for IPv4). This is precisely the kind of infra/operational constraint the checklist flags as needing to be decided-or-deferred, not silent — a future collaborator standing up a new environment will hit this as a surprise outage, not a documented tradeoff.
*Location:* Stack table (`ARCHITECTURE-SPINE.md` lines 92-103) has no mention; Consistency Conventions table doesn't cover it either.
*Fix:* add one line to the Stack table or Consistency Conventions: "Electric requires the Supabase *direct* Postgres connection (not the pooler) for logical replication; requires IPv6 or the IPv4 add-on on a paid plan."

**H2 — Image/tile storage (Supabase Storage) is decided in the memlog but has no home in the spine.**
Memlog line 14 records that the piece-cutting service "*Produit: silhouettes, graphe d'adjacence..., tuiles PNG stockees Supabase Storage*." AD-3 — the AD that specifically governs piece-cutting — mentions only `PieceShape`/`PieceAdjacency` persistence, not where or how the rendered tile assets are stored or referenced. The Structural Seed's ERD has no `imageAssetRef`/tile entity, and the folder tree's `lib/piece-cutting/` note doesn't mention Storage output either. A future implementer of `piece-cutting/` has no architectural guidance on the asset storage contract (bucket layout, naming, reference field on `Piece`).
*Location:* AD-3 (`ARCHITECTURE-SPINE.md` lines 52-56); Structural Seed ERD/tree (lines 107-134).
*Fix:* extend AD-3's Rule with where tiles are written (Supabase Storage bucket convention) and how `Piece` references them, or add it as its own line in Consistency Conventions ("Data & formats").

**H3 — Capacitor's compatibility with Next.js Server Actions is unverified and unstated.**
AD-2 requires "*Aucun client (web ou futur natif) n'écrit directement dans Postgres*" — implying the Capacitor-wrapped mobile client also calls Server Actions over HTTP. That only works if Capacitor points its WebView at the live deployed Next.js origin (Vercel); it does *not* work if the mobile build uses a bundled static export (`output: 'export'`), since Server Actions/RSC require a running Node/edge server. Current Capacitor+Next.js guides commonly use both patterns depending on the app. The spine states "wrapper mobile Capacitor" in the Stack table but never states which mode, and this determines whether AD-2 is even satisfiable on mobile.
*Location:* Stack table, `ARCHITECTURE-SPINE.md` line 102; Design Paradigm section (no mention of mobile write path).
*Fix:* one line stating Capacitor loads the deployed Next.js origin remotely (not a static bundle), which is what makes AD-2's "same Server Actions for any future native client" claim true.

## Medium

**M1 — FR-6's own flagged assumption (proximity threshold for adjacency-check trigger) is not decided, not deferred, and not listed as an open question.**
The PRD marks this explicitly: "*[ASSUMPTION: le seuil de proximité qui déclenche la vérification de compatibilité entre deux pièces... est un paramètre de conception/implémentation à définir en aval de ce PRD.]*" (PRD §4.2, FR-6). AD-3 owns the adjacency-graph mechanism but never mentions this parameter, and it's missing from the Deferred list even though it's the kind of implementation-detail deferral the list already contains (cf. "Paramètres exacts de l'algorithme de découpe").
*Location:* AD-3 (lines 52-56); Deferred (lines 136-145).
*Fix:* add a line to Deferred: "Seuil de proximité déclenchant la vérification d'adjacence (PRD FR-6 assumption) — paramètre à fixer en implémentation."

**M2 — No observability/ops dimension at all — not decided, deferred, or an open question.**
Logging, error tracking/monitoring, and alerting are absent from the entire document. For a solo-dev MVP this may legitimately be minimal, but the checklist specifically calls out the operational envelope as a dimension that must not be left silent. Even "no monitoring stack for V1, rely on Vercel/Supabase built-in dashboards" would satisfy this.
*Location:* absent throughout; closest analog is the Consistency Conventions row on "Config par variables d'environnement" (line 86), which doesn't cover observability.
*Fix:* add a one-line Deferred or Consistency Conventions entry acknowledging the choice (or lack of one) for logging/error-tracking in V1.

**M3 — Mermaid flowchart uses literal `\n` inside quoted node labels rather than `<br/>`.**
`ARCHITECTURE-SPINE.md` lines 27-30 (`UI["Client Next.js\n(Konva canvas..."`) rely on `\n` rendering as a line break. Most current Mermaid versions do handle this in flowchart node labels, but it's a known source of "literal backslash-n shows up in the box" rendering bugs depending on the renderer (GitHub markdown preview, various doc-site integrations, older Mermaid CLI versions) — worth a one-time render check against whatever will actually display this file, since it's low-cost to swap to `<br/>` for universal safety.
*Location:* `ARCHITECTURE-SPINE.md` lines 27-30.
*Fix:* render-check once; if it displays correctly wherever the spine will actually be read, no change needed — otherwise switch to `<br/>`.

## Low

**L1 — Error envelope `code` field has no defined vocabulary/registry.**
Consistency Conventions states the Server Action error shape as `{ error: { code, message } }` (line 86) but doesn't say whether `code` is a closed enum, a centralized constant registry, or free-form strings per call site — a minor under-specification, low risk since it's easy to converge on later without touching structure.
*Location:* Consistency Conventions table, `ARCHITECTURE-SPINE.md` line 86.
*Fix:* optional — one clause noting whether `code` values live in a single shared constants module.

**L2 — Document purpose says "reference for the solo dev + future collaborators," but the spine is written entirely in French with no explicit note on the spec-language convention.**
This is a deliberate, PRD-driven choice already codified functionally via AD-4 (specs in French, code in English), so it is not a defect — but nothing in the spine itself tells a hypothetical non-French-reading future collaborator that this is intentional project convention rather than an oversight.
*Location:* frontmatter `purpose` field and document body throughout.
*Fix:* optional — one clause in AD-4 or the frontmatter making the spec-language convention explicit for onboarding purposes.
