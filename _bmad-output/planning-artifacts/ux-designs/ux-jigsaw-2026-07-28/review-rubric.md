# Spine Pair Review — Jigsaw

## Overall verdict

The spine pair is disciplined and mostly clean: canonical DESIGN.md section order, complete frontmatter-token resolution, verbatim glossary/UJ-name inheritance from the PRD, and an honest deferral of mockups to Finalize. But it is not yet a contract a downstream consumer can extract blindly — two brand-layer color pairs compute below WCAG AA despite EXPERIENCE.md asserting the palette is "vérifiée," roughly half the IA surfaces have zero state coverage, a few components are one-sided between the two files, and one cited source (the brief's addendum) isn't declared in either file's `sources` frontmatter. None of this is a rewrite; it's a fix-pass before architecture/story-dev consume it as ground truth.

## 1. Flow coverage — adequate

Checked: PRD §2.2 lists exactly UJ-1 (Mickaela) and UJ-2 (Noé); EXPERIENCE.md Key Flows has both, named verbatim, numbered steps, and a marked `**Climax :**` beat in each. The IA note correctly marks Connexion/Inscription and Statistiques du Salon as intentionally spine-only (not re-flagged here).

### Findings
- **medium** PRD UJ-1 has an explicit "Edge case" (Mickaela leaves without registering — contribution stays anonymous). EXPERIENCE.md's UJ-1 Key Flow (EXPERIENCE.md, "Key Flows → UJ-1", step 6) only narrates the accept path ("Si elle accepte…"); the decline/failure path is covered only in the State Patterns table ("Sortie sans compte", EXPERIENCE.md ~line 72) with no cross-reference from inside the flow itself, unlike the template convention where each Key Flow inlines its own `Failure:` line (see experience-example-mobile.md Flow 1, experience-example-shadcn.md Flow 1). A consumer reading only Key Flows would miss the edge case. *Fix:* add an inline `Failure:` line to UJ-1 pointing at (or restating) the "Sortie sans compte" behavior.
- **low** Several FRs realized by the flows/patterns are never explicitly cited: FR-1 (free pan/zoom), FR-3 (Cadre state display), FR-8 (link access), and notably FR-11 (persistence of progress for a Participant inscrit) have no `(FR-n)` tag anywhere in EXPERIENCE.md, unlike the otherwise-thorough citation discipline elsewhere (e.g. FR-2, FR-4–FR-7, FR-9, FR-10, FR-12–FR-21 are all tagged). *Fix:* add citations, particularly for FR-11 since it's structurally load-bearing (Accueil's Salon list = persisted state).

## 2. Token completeness — thin

Checked: all frontmatter tokens in DESIGN.md (colors, rounded; typography/spacing/components sections with no overrides) and every `{path.to.token}` reference in both files' prose resolve to a defined token. No missing hex values.

### Findings
- **critical** No contrast ratio is ever stated for any color pair in DESIGN.md, despite the brand layer overriding shadcn's AA-verified neutrals wholesale (DESIGN.md frontmatter `colors`, lines 14–23) — this is exactly the "load-bearing combination" case the spec calls out, since these are *not* inherited defaults. Computing the two most-used text pairs: `primary-foreground` (`#FFFFFF`) on `primary` (`#C1652F`, used for `button-primary` and all primary CTAs) ≈ **4.06:1**, and `muted-foreground` (`#8A7D6C`) on `background` (`#FBF7F1`, used for secondary/meta text) ≈ **3.76:1** — both fail WCAG AA for normal-size text (4.5:1) and only clear the large-text/UI-component floor (3:1). EXPERIENCE.md's Accessibility Floor (line ~90) asserts "la palette de neutres chauds du DESIGN.md est vérifiée à ce niveau [WCAG AA]" — an assertion the source document does not support and that appears to be incorrect for these two pairs. *Fix:* either state per-pair contrast ratios in DESIGN.md and confirm they pass, or darken `primary`/`muted-foreground` until they do, before EXPERIENCE.md's claim is left standing.
- **low** `accent-foreground` (`#2B2621`) is defined in frontmatter but never referenced via `{colors.accent-foreground}` anywhere in either file's prose or components map. Not wrong, but dead weight worth a second look (see also §6).

## 3. Component coverage — thin

Checked every component name in DESIGN.md.Components and EXPERIENCE.md.Component Patterns for a matching row in the other file.

### Findings
- **high** "Historique des contributeurs" has a full behavioral row in EXPERIENCE.md (Component Patterns, ~line 61 — used in both Salon and Vue Statistiques, realizes FR-13) but **no corresponding visual spec in DESIGN.md.Components** — not even a mention that it's a shadcn-inherited composition (unlike, e.g., the tutorial modal, which is implicitly Dialog/Sheet, both explicitly listed as inherited-as-is). A consumer has no visual form to build against for this component. *Fix:* add a DESIGN.md.Components row (even a one-liner if it's a shadcn `Table`/`List` composition).
- **medium** The inverse gap: DESIGN.md's "Ligne de classement" (`stats-leaderboard-row`, Components section ~line 104) has no counterpart in EXPERIENCE.md.Component Patterns — only the sort mechanism ("Sélecteur de tri (stats)") is specified behaviorally, not the row itself (e.g., is a row interactive? does re-sort animate?). *Fix:* add a "Ligne de classement" row to EXPERIENCE.md.Component Patterns.
- **medium** Naming mismatch: DESIGN.md's bespoke component is named **"Point de présence"** (Components, ~line 103; also the frontmatter token key `presence-dot`), while EXPERIENCE.md's behavioral row for the same feature is named **"Présence en direct"** (Component Patterns, ~line 58). These plausibly describe the same feature at different granularity (the dot vs. the overall presence surface) but the names don't match, breaking the "identical component names across both files" contract a mechanical cross-reference would rely on. *Fix:* align names, or explicitly note the DESIGN component is the visual atom inside the EXPERIENCE-level pattern.

## 4. State coverage — thin

Walked every IA surface (Accueil, Connexion/Inscription, Création de Salon, Salon/Espace infini, Tutoriel, Partage du Salon, Statistiques du Salon) against the State Patterns table.

### Findings
- **high** **Salon (Espace infini + Cadre)** is well covered (8 of 8 State Patterns rows target it) — first-access, repeat-access, empty frame, drag, integration, exit-without-account, offline, and parallel Îlots are all present. By contrast, **Accueil, Connexion/Inscription, Création de Salon, Partage du Salon, and Statistiques du Salon have zero rows in the State Patterns table** (EXPERIENCE.md, "State Patterns", entire section). No cold-load/empty state for Accueil (a brand-new Participant inscrit has zero Salons — what does that screen show?), no error/loading state for auth, no upload-error/loading state for Création de Salon, no copy-confirmation state for Partage, no empty/loading state for Statistiques. *Fix:* add at minimum an empty and an error/loading row for each of these five surfaces.
- **high** PRD §11 Open Question #3 explicitly flags "que se passe-t-il si l'image est trop petite/basse résolution pour le découpage demandé ?" as unresolved. EXPERIENCE.md is completely silent on this — not even carried forward as an `[ASSUMPTION]` placeholder the way other open items are (e.g. the offline-behavior assumption at line ~73, or the rotation-gesture assumption at line ~80). Given the PRD names this as open, the spine's silence reads as a dropped thread rather than a deliberate deferral. *Fix:* add a state row (even provisional) or an explicit `[ASSUMPTION]` marker for Création de Salon.

## 5. Visual reference coverage — strong

Checked `mockups/`, `wireframes/`, `imports/` under the UX workspace: none of `mockups/` or `wireframes/` exist yet; `imports/` exists and is empty. This matches the expected workflow state (key-screen mocks are generated in Finalize, not yet reached) and is correctly signposted — EXPERIENCE.md's IA section states "maquettes clés à générer en Finalize. Les spines gagnent en cas de conflit" (line 33). DESIGN.md correctly has no mockup-reference line, consistent with both example templates (only EXPERIENCE.md's IA section carries that reference). No orphans, no unspecific references.

## 6. Bloat & overspecification — strong

No raw pixel values where tokens apply (components consistently reference `{rounded.*}`/`{colors.*}` rather than restating dimensions). No restatement of personas, FR text, or PRD scope — citations are terse (`(FR-14)`, `PRD §6`) rather than copied prose. No prose-where-a-table-works issues; no decorative narrative untied to a decision — every `[ASSUMPTION]` and rejected pattern ties to a specific source claim (verified against brief.md and its addendum.md; see §7).

### Findings
- **low** DESIGN.md's Components entries for "Pièce de puzzle" and "Îlot" (lines ~100–101) state *when* visual treatments appear/disappear (e.g. "contour visible uniquement pendant le déplacement… disparaît une fois l'Îlot stable") — that's state-conditional behavior, which duplicates/overlaps EXPERIENCE.md's State Patterns row "Îlots multiples en parallèle" (line ~74) covering the same timing. Minor boundary blur between visual and behavioral spec, not a contradiction.

## 7. Inheritance discipline — adequate

Checked: `sources` frontmatter resolution, UJ-name verbatim match, Glossary term fidelity (Salon, Cadre, Espace infini, Îlot, Invité, Participant, Participant inscrit — all used exactly as PRD §3 defines them, in both files), and EXPERIENCE.md token references resolving to DESIGN.md.

### Findings
- **medium** Both files' `sources:` frontmatter lists only `prd.md` and `brief.md`. But EXPERIENCE.md's Inspiration & Anti-patterns section (line ~103) cites "reproche documenté contre les incumbents (**addendum du brief**)" for the click/snap-sound complaint — a claim that is real and accurate (confirmed in `briefs/brief-jigsaw-2026-07-16/addendum.md`, line 29: "unwanted click/snap sound feedback") but lives in a file, `addendum.md`, that is **not declared in either spine's `sources` frontmatter**. A consumer that source-extracts strictly from the declared `sources` list cannot resolve or verify this citation. *Fix:* add the addendum path to both files' `sources:` list.
- **low** EXPERIENCE.md frontmatter uses `title: Jigsaw` (line 2) where DESIGN.md uses `name: Jigsaw` (line 2) and both example templates (experience-example-mobile.md, experience-example-shadcn.md) use `name:` for EXPERIENCE.md. A consumer expecting a matching `name` key across the spine pair won't find one in EXPERIENCE.md. *Fix:* rename `title` → `name` in EXPERIENCE.md frontmatter.
- Component-name mismatches and one-sided components noted in §3 also count against this category's "identical component names across both files" bar — not re-detailed here to avoid double-counting.

## 8. Shape fit — strong

DESIGN.md section order matches the canonical spec exactly: Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts. EXPERIENCE.md has all required-default sections present (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows) plus both required-when-applicable sections triggered by this product (Inspiration & Anti-patterns — well-justified against brief citations; Responsive & Platform — triggered by the multi-surface web+wrapper platform).

### Findings
- **low** EXPERIENCE.md orders "Inspiration & Anti-patterns" before "Responsive & Platform"; both example templates that include both sections (experience-example-shadcn.md) order "Responsive & Platform" first. Not a documented hard rule (only DESIGN.md's order is explicitly spec-locked), so this is informational, not a violation.

## Mechanical notes

- `sources:` frontmatter resolves for both declared paths (prd.md, brief.md exist on disk) but is incomplete relative to what's actually cited in prose — see §7 addendum.md finding.
- Frontmatter key mismatch: DESIGN.md uses `name:`, EXPERIENCE.md uses `title:` — see §7.
- Glossary terms (Salon, Cadre, Espace infini, Îlot, Invité, Participant, Participant inscrit) are used identically across both spines and the PRD — no drift found.
- All `{path.to.token}` and `{components.*}` cross-references checked resolve correctly between EXPERIENCE.md and DESIGN.md.
- FR citation coverage is strong but not complete: FR-1, FR-3, FR-8, FR-11 are functionally covered but never explicitly tagged with `(FR-n)` in EXPERIENCE.md, unlike most other FRs — see §1.
