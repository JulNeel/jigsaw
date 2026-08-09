---
title: Product Brief — Jigsaw
status: draft
created: 2026-07-16
updated: 2026-07-16
---

# Product Brief: Jigsaw

## Executive Summary

Jigsaw is a web and mobile jigsaw-puzzle app built around one specific, underserved feeling: the way a physical puzzle left out on a family table pulls people in — anyone who walks past joins for a few pieces, over days, without being asked. Existing digital jigsaw apps (Magic Jigsaw Puzzles, Jigsaw Puzzles Epic, Easybrain) are solo, session-based, ad-heavy, and — by their own users' account — visually and interactionally dated. None of them recreate the persistent, drop-in/drop-out, multi-person household ritual that makes physical jigsaw puzzles a family habit.

V1 is deliberately narrow: a single flagship mode, "Salon," that puts one always-open, persistent puzzle at the center of a household, lets any family member join or leave freely across days, and gives each participant a rewarding, personal record of their contribution. The goal of this first version is not to monetize or to cover every mode — it is to find out, with real families, whether this digital recreation of the table-puzzle feeling actually holds.

## The Problem

Jigsaw puzzling already has a proven, spontaneous social hook in physical form: a puzzle in progress on a table invites participation from whoever passes by, across a household, over days — no invitation needed, no session to schedule. This is a real, widely felt appeal (evidenced by the popularity of physical jigsaw puzzles as a shared family activity), but nothing in the digital space captures it.

Today's leading jigsaw apps are built for solo, session-based play: Magic Jigsaw Puzzles, Jigsaw Puzzles Epic, and Easybrain's Jigsaw Puzzles all pair large stock-photo libraries with free-to-play monetization. Their own user reviews are consistent and specific: intrusive ads between and during puzzles, forced subscription upsells with no visible dismiss option, pieces that "shoot across the board" or get stuck at screen edges, and an interface reviewers describe as "antiquated" ("trapped in iOS 6"). Existing collaborative alternatives (Puzzle Together, Jigidi, jigsaw.sh) solve for real-time multiplayer sessions — good for "let's solve this together right now," not for the ambient, always-there, come-and-go-as-you-please dynamic of a puzzle sitting on a real table for a week.

The cost of this gap: families who love the physical ritual have no digital equivalent that fits how they actually live — spread across days, phones, and moments of downtime, not synchronized sessions.

## The Solution

A web and mobile jigsaw puzzle app whose first release is built around a single mode — **Salon** — designed to feel like the puzzle box left open on the kitchen table:

- The puzzle is **persistent**: it stays open across days rather than living inside a single session.
- Anyone in the household can **join or leave at any moment** — no scheduling, no invite flow, no "everyone online now" requirement.
- Each participant gets **valorizing personal stats** — a visible, positive record of their own contribution (pieces placed, sessions joined, streaks) that celebrates participation without turning it into head-to-head competition.
- The interaction model is built to directly address the piece-snapping, screen-edge, and dated-UI complaints documented against today's incumbents — modern, fluid, mobile-first UX is the baseline, not an afterthought.

Two additional modes — **Battle** (parallel puzzles with disruptive power-ups, e.g. clearing a whole row of an opponent's progress) and **Time-out** (fixed-time challenge) — are part of the product's direction but are explicitly out of scope for V1 (see Scope).

## What Makes This Different

The differentiator is not proprietary technology — it is a specific emotional/social insight that no competitor product currently targets: the persistent, ambient, drop-in household puzzle, versus the synchronous "multiplayer session" model that collaborative competitors (Puzzle Together, Jigidi, jigsaw.sh) are already built around. Modern UX is a second, necessary-but-not-sufficient differentiator: the interaction and interface complaints against incumbents are well documented, but polish alone is a fragile moat if it isn't paired with the Salon mechanic.

Honestly stated: this is an execution and product-insight bet, not a technical moat. The "AI-generated custom puzzle" trend already has several small entrants (PuzzleFree, JigsawCat, Gaxos) with no clear leader yet — that space is deliberately deferred, not claimed as differentiation here (see Known Risks and Open Questions).

## Who This Serves

Primary users: **whole families**, spanning generations, looking for a low-pressure, ambient shared activity rather than a competitive game — the same audience that already picks up a physical jigsaw puzzle together, not a niche puzzle-enthusiast segment.

Success for them looks like: a puzzle that's "just there" on everyone's phone/browser, that a parent, a kid, or a grandparent can each poke at for five minutes whenever they have a moment, with visible proof afterward that their five minutes mattered.

## Success Criteria

Phase 1 (this V1) exists to validate the experience, not the business:

- Households actually sustain multi-day Salon sessions (a single puzzle genuinely gets revisited over several days, not abandoned after one sitting).
- Multiple members of the same household participate in the same puzzle (not just one person using it solo).
- Qualitative signal from test families that it reproduces the "puzzle on the table" feeling.
- No repeat of the interaction complaints found against incumbents (piece snapping, edge-of-screen behavior) in user feedback.

Monetization and growth metrics are explicitly deferred — see Scope.

## Scope

**In for V1:**
- Web and mobile, built together from the start.
- Salon mode only: persistent, multi-day, multi-participant puzzle with join/leave-anytime.
- Per-participant valorizing stats/contribution tracking.
- [ASSUMPTION] Custom photo upload to create the household's puzzle — nearly universal among competitors and directly reinforces the "family photo on the table" feeling this mode is built around. To confirm.
- Core modern jigsaw interaction (piece manipulation, snapping, zoom/pan) engineered specifically against the documented incumbent complaints.

**Explicitly out for V1 (parked, not rejected):**
- Battle mode and its power-up mechanic.
- Time-out mode.
- AI-generated puzzle imagery.
- AI-driven automatic difficulty scoring.
- Monetization (ads, subscriptions, IAP) — deferred until the core experience is validated.

## Known Risks and Open Questions

- **IP/licensing risk on AI-generated imagery** (flagged by the founder): if a future AI image-generation feature produces a recognizable licensed character, this creates real legal exposure — unlike incumbents such as Magic Jigsaw Puzzles, which license their character content properly. Not a V1 concern given AI generation is deferred, but must be resolved (prompt filtering, legal review, or scope restriction to non-licensed/user-owned imagery) before that feature is built.
- **Solo development capacity**: one developer building web and mobile simultaneously is a real scope constraint; the tight V1 scope (one mode only) is deliberately sized to that reality.
- [ASSUMPTION] No hard external deadline — pace is set by solo-developer availability rather than a fixed launch date. To confirm.

## Vision

If Salon validates the core insight, Jigsaw grows in two directions: breadth of modes (Battle, Time-out, and beyond) for players who want more structured challenge, and depth of content (AI-generated and community imagery, once the licensing question is resolved) for players who want infinite variety. Longer term, monetization layers on top of a proven experience rather than being retrofitted onto it — the opposite path from the ad-heavy incumbents this brief responds to.
