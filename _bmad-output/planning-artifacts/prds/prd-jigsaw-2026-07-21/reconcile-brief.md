---
title: Reconciliation — PRD vs. Product Brief (Jigsaw)
created: 2026-07-26
---

# Reconciliation: prd.md vs. brief.md / addendum.md

Scope note: Battle mode, Time-out mode, AI-generated imagery, and AI difficulty scoring are correctly excluded from MVP via PRD §7/§8.2 — their absence from the FR list is expected and not flagged below.

## Gaps found

1. **Brief's Success Criteria bullet on interaction complaints was dropped, and no FR/NFR ever names the complaints it's supposed to fix.**
   Brief §Success Criteria (bullet 4): *"No repeat of the interaction complaints found against incumbents (piece snapping, edge-of-screen behavior) in user feedback."* Brief §Scope also lists as an in-scope V1 item: *"Core modern jigsaw interaction (piece manipulation, snapping, zoom/pan) engineered specifically against the documented incumbent complaints."* The PRD's §9 Success Metrics (SM-1, SM-2, SM-3, SM-C1) has no metric or qualitative check corresponding to this — it validates streaks, return rate, and participant count, but nothing about drag/snap/edge-of-screen behavior quality. Nor does any FR in §4.1 (Espace infini et Cadre, FR-1–FR-3) or §4.2 (Îlots, FR-4–FR-7) reference "pieces shoot across the board" or "stuck at screen edge" as a constraint to design against — they describe the pan/zoom/magnetic-snap mechanic in the abstract, with no acknowledgment of the specific failure modes it must avoid. This should land as either an added Success Metric (a qualitative one, mirroring the brief's own criterion) and/or an NFR under §4.1/§4.2 explicitly naming the piece-drag-physics and edge-of-canvas behaviors to avoid.

2. **New deliberate sound feedback (FR-14, §5) has no mute/volume control, risking the exact "unwanted click/snap sound" complaint the brief documents against incumbents.**
   Addendum's Research Grounding lists "unwanted click/snap sound feedback" as a specific documented UX complaint. The PRD's §5 Aesthetic & Tone and FR-14 go further than the brief and *add* two new sounds (a "wood click" on piece placement, an "electronic victory" sound on island completion, plus mobile micro-vibration) but say nothing about a way to disable or turn down this audio. A satisfying sound the first time can become exactly the same "unwanted sound" complaint on the 500th piece placement if there's no dismiss/mute path — mirroring the brief's other documented complaint pattern ("forced upsell with no visible dismiss"). Worth an explicit NFR in §4.4/§5 (or an Open Question) about a mute/volume toggle.

3. **PRD's Aesthetic & Tone pivots away from the brief's core emotional metaphor without flagging it as a decision needing confirmation.**
   Brief's Executive Summary/Solution frame the entire product around warmth: "the way a physical puzzle left out on a family table pulls people in," "feel like the puzzle box left open on the kitchen table," "family photo on the table" feeling (re: photo upload). PRD §5 explicitly chooses the opposite direction for V1: "épurée et moderne — pas de traitement 'chaleureux/cosy' (bois, tissu, lumière tamisée)." This is buried as a single inline `[ASSUMPTION]` rather than surfaced as a tension with the brief's central metaphor. It may well be the right call (modern UX is also a brief-stated differentiator), but given how load-bearing the "kitchen table" warmth framing is to the brief's problem/solution narrative, this deserves an explicit callout/confirmation with the founder rather than a buried assumption — recommend elevating it in §11 Assumptions Index with a direct pointer to the brief's framing it diverges from.

4. **Brief's own "[ASSUMPTION] ... to confirm" on custom photo upload was hardened into firm MVP scope without carrying the confirmation flag forward.**
   Brief §Scope explicitly marks photo upload as unconfirmed: *"[ASSUMPTION] Custom photo upload to create the household's puzzle — ... To confirm."* PRD §8.1 lists "Upload de photo personnelle pour créer le puzzle du Salon" as settled in-scope MVP with no `[ASSUMPTION]` marker, and §11 Assumptions Index only carries two unrelated assumptions (aesthetic style, non-competitive ranking) — this one was dropped in the handoff. PRD §10 (Open Questions) does raise a *moderation* question about uploaded photos, but that question presupposes the feature is confirmed; it doesn't flag that the feature's inclusion itself was never confirmed by the brief. Recommend adding this to §11 Assumptions Index.

## Confirmed as correctly handled (no gap)

- **AI-generated imagery IP/licensing risk**: addendum's founder-flagged risk (recognizable licensed characters, unlike incumbents who license properly) is accurately captured in PRD §7 Non-Goals ("risque IP/légal identifié ... et non résolu") and correctly excluded from MVP via §8.2. No action needed.
