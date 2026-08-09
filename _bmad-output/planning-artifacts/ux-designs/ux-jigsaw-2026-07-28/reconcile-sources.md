---
title: Reconciliation — DESIGN.md / EXPERIENCE.md vs. PRD & Brief
created: 2026-07-28
sources:
  - _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-jigsaw-2026-07-16/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-jigsaw-2026-07-16/addendum.md
reviewed:
  - _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md
---

# Input Reconciliation Findings

## 1. FR-13 (historique des contributeurs) has no behavioral home

**What's missing:** PRD FR-13 — "Le Salon conserve et affiche l'historique des personnes ayant contribué" — is a standalone functional requirement, distinct from FR-12 (live presence). EXPERIENCE.md's Key Flow UJ-1 (step 2) mentions "l'historique des contributeurs" in passing narrative text, but there is no Component Pattern, State Pattern, or IA surface for it — contrast with "Présence en direct," which gets its own row in Component Patterns with explicit behavioral rules (list/avatars, 30s disappearance timer). The history feature has no defined form (list? timeline? avatar row?), no access point, no state (empty case, long-history case).

**Where the source says it:** PRD §4.4, FR-13 (p. "Le Salon conserve et affiche l'historique...").

**Where it should land:** Add a Component Pattern row (and possibly an IA surface, e.g. folded into "Salon" or a dedicated "Contributeurs" view) specifying what the history looks like and how it's surfaced, parallel to how Présence en direct is specified.

## 2. FR-7 (Îlots multiples en parallèle) — no pattern for concurrent multi-user editing

**What's missing:** FR-7 explicitly requires that multiple Îlots coexist and be worked on *simultaneously by different Participants*. EXPERIENCE.md's Component Patterns describe a single Îlot's behavior (move as a block, auto-integrate) but nothing addresses the multi-user-concurrency dimension: what happens if two Participants grab pieces near each other at the same time, whether Îlots show whose in-progress work they are, or any conflict/ownership signal. This is the one FR whose defining word ("parallèle," concurrent use) is exactly the part left unaddressed.

**Where the source says it:** PRD §4.2, FR-7 ("Plusieurs Îlots peuvent coexister simultanément, travaillés en parallèle par différents Participants").

**Where it should land:** Either an explicit State Pattern ("Îlot en cours de manipulation par un autre Participant") or a note that no visual ownership/locking is needed (piece-level optimistic concurrency is enough) — currently silent either way, so it reads as an oversight rather than a decision.

## 3. IA closure gap: "Connexion / Inscription" (and "Statistiques du Salon") are named but never dramatized

**What's missing:** The IA table lists "Connexion / Inscription" as a surface reached from "Accueil, ou proposition à la sortie d'un Salon (FR-10)." Neither Key Flow (UJ-1, UJ-2) actually walks through it: UJ-1 jumps straight from "proposition de connexion/inscription" to the outcome ("si elle accepte, ses contributions sont rattachées") without ever showing the surface itself; UJ-2 starts with Noé already authenticated, so his original signup/login is never traced either. The same gap applies to "Statistiques du Salon" — it has an IA row and a Component Pattern (Sélecteur de tri) but appears in no Key Flow at all. Per the IA's own closure goal (every surface reached by some journey), both are named-but-undramatized.

**Where the source says it:** EXPERIENCE.md IA table (rows "Connexion / Inscription" and "Statistiques du Salon"); PRD FR-10, FR-15/16/21 define the underlying behavior but the PRD's own Key User Journeys (§2.2) also never walk the login form itself, so this may be intentional under-specification — but it should be a stated decision, not a silent gap.

**Where it should land:** Either add a third Key Flow (or a flow variant) that walks a return visit through Connexion/Inscription and/or a Statistiques-viewing moment, or add an explicit note that these surfaces are considered self-evident/out of narrative scope and only need IA + Component Pattern coverage.

## 4. DESIGN.md's warm-neutral palette as full chrome, not just accent, sits in tension with PRD §6's explicit V1 stance

**What's missing/contradicted:** PRD §6 is explicit: V1 identity is "épurée et moderne," deliberately **without** "traitement chaleureux/cosy," with any warmth ("esprit table de cuisine") deferred to a post-V1 personalization feature (§8 Non-Goals: "Pas de personnalisation visuelle du Salon... en V1"). DESIGN.md's Brand & Style section makes warm neutrals (cream `#FBF7F1`, terracotta `#C1652F`, soft brown `#2B2621`) the base **background/foreground/muted/border tokens across the entire surface**, explicitly calling this "la décision de marque centrale, pas un simple accent." DESIGN.md does correctly avoid textures/materials (no wood/fabric/dim lighting — it says so explicitly), which is the letter of the PRD's exclusion. But the PRD's intent reads broader than materials: it frames *any* deliberate warmth as a post-V1 differentiator, to be earned later via personalization, not baked into the V1 default chrome. A full warm-cream reskin of every surface risks reintroducing the "cozy" feeling the PRD chose to defer, even without literal wood/fabric textures.

**Where the source says it:** PRD §6 Aesthetic & Tone ("pas de traitement 'chaleureux/cosy'... à ce stade... une personnalisation visuelle plus chaleureuse... est envisagée comme piste post-V1"); PRD §8 Non-Goals (no visual personalization in V1).

**Where it should land:** Either (a) flag this explicitly as a judgment call in DESIGN.md's assumptions (it partially is, via the `[ASSUMPTION]` on primary/accent hues, but the base-neutral choice itself isn't flagged as a PRD-tension point) so the PRD author can confirm color-only warmth is acceptable, or (b) pull the base neutrals closer to shadcn's default cooler gray and reserve terracotta/gold strictly as narrow functional accents (CTA, presence, completion) — closer to a literal reading of "pas de traitement chaleureux à ce stade."

## 5. Anti-patterns section omits the brief's "unwanted click/snap sound" complaint

**What's missing:** The addendum's Research Grounding explicitly lists "unwanted click/snap sound feedback" as one of the documented incumbent UX complaints, alongside ads, edge-snapping, dated UI, and forced upsells. EXPERIENCE.md's Inspiration & Anti-patterns section has a "Rejeté" bullet for each of the other four complaints (ads, upsell-no-dismiss, dated UI, piece-snapping/edges) but has no corresponding bullet for unwanted sound. This matters because Jigsaw's own FR-14 doubles down on sound as a deliberate feature (satisfying placement sound), so the distinction between "good, chosen sound feedback" and "the incumbents' unwanted/intrusive sound" needs to be drawn explicitly, not left implicit in the mute toggle (FR-14 Consequences / Accessibility Floor).

**Where the source says it:** Addendum, "Documented UX complaints" ("unwanted click/snap sound feedback"); brief §The Problem (general "dated" interaction complaints).

**Where it should land:** Add a "Rejeté" bullet in EXPERIENCE.md's Inspiration & Anti-patterns: e.g. "Rejeté — son de clic/snap imposé et non désactivable : Jigsaw investit dans un son de placement délibérément satisfaisant (FR-14) mais le rend toujours désactivable individuellement, contrairement aux incumbents." This closes the traceability loop the other four bullets already have.

## 6. Multi-generational usability (parent / kid / grandparent) not reflected in either spine

**What's missing:** The brief is explicit that the primary audience is "whole families, spanning generations" and that success looks like "a parent, a kid, or a grandparent" each poking at the puzzle for five minutes. Neither DESIGN.md nor EXPERIENCE.md operationalizes this generational range: DESIGN.md's only nod is a generic "ton familial plutôt que professionnel" in the Shapes section (rounding choice), and EXPERIENCE.md's Accessibility Floor covers WCAG AA contrast, reduced-motion, and focus states — all age-neutral technical accessibility, not usability-for-a-grandparent-or-a-child considerations (e.g., minimum touch-target size for less dexterous or younger users, avoiding reliance on tiny gestures like double-tap-to-rotate for first-time older users, simplified/large-print stats view). Given the brief frames this multi-generational span as central to who the product serves — not a nice-to-have — its absence from both spines' concrete design decisions is a genuine loss of qualitative intent, even though nothing here contradicts PRD scope.

**Where the source says it:** Brief, "Who This Serves" ("whole families, spanning generations... a parent, a kid, or a grandparent can each poke at for five minutes").

**Where it should land:** Either add a line to EXPERIENCE.md's Accessibility Floor or Foundation section naming multi-generational usability as a design constraint (larger default touch targets on canvas pieces, no gesture that only power users would discover), or explicitly note it's deferred to visual/interaction QA with real families per the PRD's own validation-first framing (§1 Vision, §10 Success Metrics) — but currently it is addressed nowhere, not even as a deferred/acknowledged risk.
