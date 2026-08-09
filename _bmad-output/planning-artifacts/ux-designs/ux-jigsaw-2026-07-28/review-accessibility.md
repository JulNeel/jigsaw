---
title: Accessibility Review — Jigsaw UX Specs
status: draft
reviewed: 2026-07-28
reviewer: Accessibility Reviewer (BMad UX Gate)
scope-note: >
  Two scoping decisions are treated as confirmed and out of bounds for this review:
  (1) no keyboard alternative to canvas drag-and-drop in V1 (puzzle manipulation is
  inherently manual/gestural); (2) the accessibility floor targets generic WCAG 2.2 AA
  technical accessibility, not age-specific accommodations (e.g. oversized touch
  targets for children/grandparents). Neither is re-litigated below.
sources:
  - _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md
  - _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md
---

# Accessibility Review — Jigsaw UX Specs

## Overall Verdict

The Accessibility Floor in EXPERIENCE.md states good intentions — contrast, `prefers-reduced-motion`, a mute control that's never buried, and visible focus rings — but it does not hold up under scrutiny on two fronts. First, it asserts the warm-neutral palette is "vérifiée" at WCAG AA, but computing actual contrast ratios on the DESIGN.md token values shows two load-bearing combinations fail the AA text threshold outright (`muted-foreground` on `background`/`muted`, and white `primary-foreground` on `primary`). Second, the floor is silent on several concrete, cheap, and fully in-scope items that have nothing to do with the accepted no-keyboard-drag or no-age-accommodation decisions: accessible names for icon-only controls, focus management and screen-reader semantics for the first-run tutorial modal, any non-visual equivalent for real-time collaborative events (piece placed by someone else, presence changes), and WCAG 2.2's own minimum target-size criterion. None of these require revisiting the product owner's confirmed trade-offs — they are gaps within the stated generic technical floor itself, and each is testable and fixable without new scope debate.

**Findings: 1 critical, 3 high, 3 medium, 1 low.**

## Findings

### 1. [Critical] Palette does not actually meet the WCAG AA contrast the Accessibility Floor claims

**Location:** DESIGN.md `colors` front-matter (lines 14–23); EXPERIENCE.md Accessibility Floor, line 90 ("Contraste WCAG AA sur toute la chrome UI ... est vérifiée à ce niveau").

Computed contrast ratios (WCAG relative-luminance formula) on the documented hex values:

| Pair | Ratio | AA normal text (4.5:1) | AA large text/UI (3:1) |
|---|---|---|---|
| `foreground` #2B2621 on `background` #FBF7F1 | ~14.0:1 | pass | pass |
| `muted-foreground` #8A7D6C on `background` #FBF7F1 | ~3.76:1 | **fail** | pass |
| `muted-foreground` #8A7D6C on `muted` #EFE6D8 | ~3.25:1 | **fail** | pass |
| `primary-foreground` #FFFFFF on `primary` #C1652F | ~4.06:1 | **fail** (for regular-weight text below the large-text size threshold) | pass |
| `accent-foreground` #2B2621 on `accent` #D9A441 | ~6.66:1 | pass | pass |

`muted-foreground` is a shadcn-convention token typically used for secondary text, timestamps, helper copy, and disabled/placeholder states (e.g. "il y a 2 minutes" in the contributor history, sub-labels in stats). At ~3.2–3.8:1 it reads noticeably below AA for any of those normal-size text uses. The primary button (terracotta, white label) is the product's main CTA ("Créer un salon") and sits right at the edge — it fails AA for typical 14–16px button labels and only clears the bar if the label is bold-and-large enough to qualify as "large text" under WCAG's definition, which is not specified anywhere.

**Fix:** Darken `muted-foreground` toward ~#6E6153 or similar until it clears 4.5:1 on both `background` and `muted`, or explicitly restrict its use to large-text/decorative contexts only. Darken `primary` (e.g. toward #A8541F) or explicitly mandate bold/large button labels if the current terracotta must be kept as-is. Re-verify against an actual contrast checker before sign-off, don't rely on the "warm neutrals feel accessible" assumption.

### 2. [High] No accessible-name guidance for icon-only controls

**Location:** DESIGN.md Components section, `recenter-button` (lines 43–47, 102); EXPERIENCE.md Accessibility Floor (lines 86–96).

The recenter button is specified as a floating circular icon button with no visible text ("Bouton flottant circulaire ... toujours visible"). The mute toggle (FR-14) is described only behaviorally ("accessible en permanence"), with no visual spec at all — implying an icon toggle. Neither DESIGN.md nor the Accessibility Floor requires an `aria-label` or other accessible name for these. A screen-reader user landing on either control would hear nothing indicating its purpose.

**Fix:** Add an explicit Accessibility Floor line requiring an accessible name on every icon-only control (e.g. "Recentrer la vue sur le Cadre", "Couper le son" / "Activer le son"), testable with an automated audit (axe `button-name` rule).

### 3. [High] Tutorial modal (FR-9) has no stated focus-trap, keyboard-dismiss, or screen-reader semantics

**Location:** EXPERIENCE.md Component Patterns "Modale tutoriel" (line 59), State Patterns (lines 67–68), Accessibility Floor (lines 86–96).

This modal is the very first thing every non-authenticated guest sees (UJ-1, FR-9), yet nothing in either document states that it traps focus, is dismissible via Escape, sets initial focus sensibly, or is announced to assistive tech (`role="dialog"`, `aria-modal`, an accessible title). DESIGN.md does list shadcn `Dialog` as an inherited component generally, but never explicitly ties the tutorial modal to that primitive — so the reasonable assumption that it "just inherits Radix Dialog's built-in a11y" is never actually stated or guaranteed as a requirement.

**Fix:** Add one explicit line to the Accessibility Floor (or the Component Patterns row) confirming the tutorial modal is built on shadcn `Dialog`/Radix (which provides focus trap, Escape-to-close, and `aria-modal` by default), plus specify initial-focus target and an accessible dialog title/description.

### 4. [High] No non-visual equivalent for real-time collaborative events

**Location:** EXPERIENCE.md State Patterns, "Intégration au Cadre" (lines 70–71); Component Patterns "Présence en direct" (line 58); Accessibility Floor (lines 86–96).

Piece-placement feedback (FR-14) and live presence (FR-12) are both specified with visual + sound + haptic channels — good for sighted/hearing users, and FR-14's visual/sound pairing is explicitly required by the floor. But nothing anywhere specifies an ARIA live region or equivalent so a screen-reader user would learn "a piece was just placed by someone else" or "Mickaela just joined." This is distinct from the accepted no-keyboard-drag decision (which is about *manipulating* the canvas) — this gap is about *awareness* of a collaborative surface that a screen-reader user could otherwise perceive with zero canvas interaction at all.

**Fix:** Add a throttled `aria-live="polite"` region (or equivalent) to the Accessibility Floor announcing significant Salon events — piece/Îlot placed, participant joined/left — decoupled from the canvas drag mechanics.

### 5. [Medium] Presence dot and Îlot outline: contrast and multi-user disambiguation gaps (not a classic colorblind hue confusion, but a real gap)

**Location:** DESIGN.md `presence-dot` / `ilot-outline` component tokens (lines 40–50, 100–101); EXPERIENCE.md line 74 (parallel Îlots).

Both signals are presence/absence-based rather than two-hue state signals (the dot only exists when online; the outline only exists during active drag), so classic red/green colorblind confusion is less of a concern than the framing suggests. Two real issues remain, though:
- **Contrast:** `accent` gold #D9A441 against `background` #FBF7F1 is only ~2.1:1 — below the 3:1 WCAG 1.4.11 threshold for graphical/UI-component perceivability. A low-vision user (not just colorblind) may simply not see the dot or dashed outline, especially layered over an arbitrary puzzle photo of unknown color.
- **Multi-user disambiguation:** FR-7 and EXPERIENCE.md line 74 explicitly allow multiple Îlots to be actively manipulated in parallel by different participants, and each gets the identical gold dashed outline. There is no color, pattern, or label differentiating "your" active Îlot from someone else's simultaneously-active one.

**Fix:** Verify/adjust gold against a guaranteed opaque chrome backdrop (not directly atop the photo) to reach 3:1; consider a lightweight per-participant differentiator (e.g. a small avatar chip on the active outline) for the concurrent-Îlot case.

### 6. [Medium] Unchanged shadcn `ring` token never re-verified against the new warm palette

**Location:** DESIGN.md line 70 ("Tokens shadcn hérités sans changement : `input`, `ring`, `destructive`, `popover`"); EXPERIENCE.md Accessibility Floor line 94 ("Focus visible (`ring` shadcn hérité)").

The background/foreground/primary/accent tokens were all deliberately overridden for the warm-neutral brand direction, but `ring` was explicitly kept as shadcn's stock value. That stock ring color was calibrated against shadcn's default cool-gray theme, not against the new `#FBF7F1` cream background — nothing in either doc confirms it still clears the 3:1 non-text contrast needed for a visible focus indicator on the new surface.

**Fix:** Explicitly re-verify (or override) `ring` contrast against `background` and `card` before relying on the "focus visible" claim.

### 7. [Medium] WCAG 2.2 AA target-size criterion (SC 2.5.8) is absent from the floor

**Location:** EXPERIENCE.md Accessibility Floor (lines 86–96).

The floor is explicitly scoped to "generic technical accessibility (WCAG 2.2 AA contrast, visible focus rings, prefers-reduced-motion, sound-paired-with-visual)." WCAG 2.2 SC 2.5.8 (Target Size, Minimum — 24×24 CSS px) is itself a Level AA criterion in that same standard, and is distinct from the rejected age-specific "extra-large targets for kids/grandparents" idea — it's a universal minimum, not an accommodation. It is not mentioned anywhere for chrome controls like the recenter button, mute toggle, or invite button.

**Fix:** Add an explicit minimum-target-size line to the Accessibility Floor for all non-canvas chrome controls. Canvas piece/Îlot hit-targets can reasonably invoke SC 2.5.8's "essential" exception given the manipulatory medium; floating chrome buttons should not need to.

### 8. [Low] `border` token has negligible contrast against `background`

**Location:** DESIGN.md `colors.border` (#E3D6C2, line 18) and `recenter-button` component (lines 43–47).

`border` against `background` computes to only ~1.3:1 — essentially invisible as a boundary line. The recenter button relies on `border` + `card` (very close in lightness to `background`) to define its edge over an arbitrary photo backdrop. Low severity because the Elevation section's drop-shadow likely compensates in practice, but this is unverified.

**Fix:** Confirm the recenter button's shadow alone provides a perceptible boundary independent of `border`, or increase `border` contrast if the shadow proves too subtle in implementation.
