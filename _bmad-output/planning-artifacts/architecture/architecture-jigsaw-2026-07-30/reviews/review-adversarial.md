---
name: 'Adversarial Review — Architecture Spine Jigsaw'
type: review
target: _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md
created: '2026-08-02'
---

# Adversarial Review — Jigsaw Architecture Spine

Method: for each AD and each Deferred item, construct two concrete builds that each obey the letter of the spine yet produce incompatible systems. 11 holes found.

---

## Hole 1 — AD-2: no conflict-resolution winner rule for racing writes on the same Piece

**Scenario.** Two Participants, Léa and Noé, drag the same Piece toward the same empty Frame slot within the same 200ms window. Both clients optimistically render the Piece as placed. Both call the Server Action `placePiece(pieceId, frameSlotId)`.

- **Builder A** implements the Server Action as: first request to reach Postgres wins (row-level `UPDATE ... WHERE piece.status = 'unplaced'` — a CAS). The second request gets 0 rows affected, returns `{ error: { code: 'CONFLICT' } }`. Builder A's client then silently rolls back Noé's optimistic placement — the piece just "snaps back" to where it was, no toast, per Deferred item 5 ("l'habillage visuel ne l'est pas [spécifié]").
- **Builder B**, reading the same AD-2 rule ("le client peut prédire optimistiquement le résultat mais ne fait jamais autorité"), implements the Server Action as last-write-wins: it doesn't gate on current status, it just re-asserts the placement (idempotent `UPDATE`). Both Léa's and Noé's actions succeed sequentially, with no error surfaced to either — the second write simply overwrites Piece.position/rotation with its own (identical) target, which is harmless for a single Piece placement, but becomes destructive the moment the two colliding actions are *different* mutations (e.g., Léa places Piece X at slot A while Noé, in the same instant, rotates and repositions the same Piece X into an Îlot instead) — now there is no CONFLICT concept at all, and whichever Server Action's DB transaction commits last "wins" invisibly, with the loser's client showing a state that was never persisted (permanent divergence until next Electric sync tick, then a silent teleport).

**Why the spine permits both.** AD-2's Rule says only "le serveur... ne fait jamais autorité côté client" — it establishes *that* the server decides, not *how* it decides (no optimistic-concurrency-control primitive, no version/CAS field named, no defined error taxonomy beyond one throwaway example in Deferred). Two builders can each claim full compliance while shipping a CAS-based rejecting server and a LWW-overwriting server — behaviorally opposite systems for concurrent users.

**Fix.** Add to AD-2 (or a new AD-2b): every mutating Server Action must perform an optimistic-concurrency check against a monotonic `version`/`updated_at` column on the target row (Piece or Cluster); on mismatch it MUST return a typed `{ error: { code: 'STALE_WRITE' } }` and MUST NOT apply the mutation. Additionally specify the client contract: on `STALE_WRITE`, the client discards its local optimistic mutation and waits for the next Electric Shape update to re-render truth (no retry-and-clobber). This turns "server is authoritative" into a testable contract instead of a slogan.

---

## Hole 2 — AD-2 + Deferred item 5: rollback UX is explicitly unspecified, which is itself the hole

**Scenario.** Deferred item 5 states the rollback is "mécanique (TanStack DB)" but "l'habillage visuel ne l'est pas [spécifié]." Builder A ships a rollback where the rejected Piece animates back to its pre-drag position over 300ms with a subtle red flash. Builder B ships a rollback where the rejected Piece simply vanishes from view (since TanStack DB's rollback removes the optimistic row) and then reappears wherever the server-truth Shape update places it — potentially a full second later, with no animation and no visual continuity, which given NFR-1's promise ("pas de blocage ni de perte de pièce") could easily read to the user as "my piece disappeared / got lost."

**Why this is a real hole and not acceptable to leave deferred.** NFR-1 is a hard product requirement ("no piece ever appears lost"), and the rollback path is exactly the scenario where a Piece can visually vanish. Leaving the rollback UX as an open deferred item risks a build that violates NFR-1 by construction, and no AD currently binds the rollback behavior to NFR-1.

**Fix.** Promote this out of Deferred into a Rule: "On mutation rejection, the client MUST render a transition (not a disappearance) from the optimistic position back to last-known-server-truth position, within N ms, with a distinguishable (non-error-toast) affordance — satisfying NFR-1's 'never lost' guarantee." Leave the *exact* easing/animation as implementation detail, but bind the invariant "never a bare disappearance" now.

---

## Hole 3 — AD-2: Cluster (Îlot) merges have no defined "owner" during a multi-Piece transaction, enabling two different partial-failure models

**Scenario.** Two Îlots (A: 3 pieces, B: 2 pieces) are dragged together by two different Participants at the same moment, each believing they are the one causing the merge (FR-4/FR-7: "Deux Îlots distincts peuvent fusionner"). The merge is a multi-row mutation: it must reassign all of B's pieces to Cluster A (or create Cluster C), update PieceAdjacency-driven validation, and delete/merge the Cluster records.

- **Builder A** implements this as a single Server Action wrapped in one Postgres transaction: `mergeClusters(a, b)`, atomic, all-or-nothing. A concurrent second `mergeClusters` call referencing an already-merged (now-deleted) Cluster id fails outright with a foreign-key/not-found error.
- **Builder B** implements cluster merge piecemeal — one Server Action per Piece reassignment (looping client-side, calling `attachPieceToCluster` N times), because AD-2 only says "toute mutation passe par une Server Action," not "one merge = one transaction." Under concurrent merge attempts, this can leave a Cluster in a half-merged state (3 of 5 pieces reassigned) if the second merge interleaves mid-loop — something Builder A's design structurally cannot produce.

**Why the spine permits both.** AD-2 binds "formation/fusion de Cluster" to "passe par une Server Action" — singular action name, not singular transaction. AD-3 defines the adjacency graph but says nothing about what unit of atomicity a merge operation must respect at the data layer. Two builders get genuinely different failure/partial-state characteristics for the same PRD behavior (FR-4, FR-7).

**Fix.** Add to AD-3 (or a new Rule under AD-2): "A Cluster merge (Piece→Cluster, Cluster→Cluster) is a single atomic Server Action / single DB transaction — never a client-driven sequence of per-Piece calls. A Cluster's membership set is only ever observed by other clients in a fully-merged or fully-unmerged state (no partial membership visible via the Electric Shape)."

---

## Hole 4 — AD-3: ambiguous ownership of "which Cluster does a Piece belong to" when a Piece is not yet in any Cluster

**Scenario.** The ER diagram shows `CLUSTER ||--o{ PIECE : groups`. Nothing states whether a Piece that is loose in the espace infini (not part of any Îlot) has a `cluster_id` of `NULL`, or whether every Piece is created inside an implicit "singleton Cluster of one."

- **Builder A** models every Piece as always belonging to exactly one Cluster (a Piece by itself is a Cluster of size 1). "Cluster complete/formed" (FR-4's "correspondance réelle des découpes") is then just "two Clusters merge, sizes add." Frame-integration is "a Cluster of any size snaps into the Frame."
- **Builder B** models Piece.cluster_id as nullable — Clusters only exist once ≥2 pieces are actually merged; a lone Piece has no Cluster row at all. Frame integration is coded as two separate paths: `placePiece` (no Cluster) and `placeCluster` (Cluster exists), because "a Piece is not a Cluster."

**Why this matters concretely.** These two data models produce genuinely different validation code paths, different counts for statistics (FR-21 "nombre d'Îlots créés" — Builder A's model would, absent care, count every lone piece as an Îlot-of-one and inflate the stat; Builder B's wouldn't), and different Electric Shape payload shapes (a client built against Builder A's API that always expects a `cluster_id` will break against Builder B's nullable field, or vice versa) — exactly the "web client vs. future native client" incompatibility this review is asked to hunt for.

**Fix.** Add an explicit Rule under AD-3: "A Cluster row exists in Postgres if and only if ≥2 Pieces are merged together (FR-4's real-adjacency rule). An unmerged Piece has `cluster_id = NULL` and is never counted as an Îlot in FR-21 statistics. `Cluster.size = 1` never occurs as a persisted state." This closes both the data-shape ambiguity and the stats-counting ambiguity in one move.

---

## Hole 5 — AD-3: "Cluster can merge with another Cluster" doesn't define whether adjacency is checked pairwise-exhaustively or via a boundary index

**Scenario.** Two Îlots are dragged near each other with 3 potential touching-edge pairs available (multiple pieces along the touching boundary). FR-4 says fusion triggers "si leurs bords correspondent réellement" (plural "bords").

- **Builder A** interprets this as: fusion triggers if *any single* true-adjacency pair exists along the touching boundary (an OR across candidate edges) — generous, "any real match anywhere along the seam is enough."
- **Builder B** interprets it as: fusion requires *all* currently-touching edge-pairs along the boundary to be true adjacencies (an AND) — strict, "every piece you're bringing into contact must actually belong there."

These produce different in-game behavior: Builder A permits merges that Builder B would reject as "false positive contact" (e.g., 2 correct edges + 1 incorrect edge touching simultaneously). Since PieceAdjacency (AD-3) only stores the *true neighbor set per Piece*, nothing in the spine states the merge predicate's quantifier over multiple simultaneous contacts.

**Fix.** Add to AD-3's Rule: "A Cluster-Cluster or Piece-Cluster merge validates ALL currently-touching Piece-pairs along the shared boundary against PieceAdjacency; the merge succeeds only if every touching pair is a true neighbor (logical AND, zero tolerance for partial false contact)."

---

## Hole 6 — AD-4: naming table omits "Cadre complet", "Historique des contributeurs", and "ContributionEvent"-adjacent terms actually used in PRD/EXPERIENCE

**Scenario.** AD-4's table maps 7 terms (Salon, Cadre, Espace infini, Îlot, Invité, Participant, Forme élémentaire). But the PRD/EXPERIENCE.md use several more domain terms that two builders would each have to invent a code-name for, independently:

- **"Cadre complet"** (FR-22, EXPERIENCE.md State Patterns) — the celebratory completion event. Builder A names the event/type `FrameCompleted`; Builder B, working from the Structural Seed's `CONTRIBUTION_EVENT` entity, names it `RoomCompletedEvent` or folds it into a generic `ContributionEvent.type = 'frame_complete'` vs. a dedicated `frame_completed_at` timestamp column on Room. Both are "compliant" with AD-4 since the term was never tabled.
- **"Historique des contributeurs"** (FR-13) — is this a *view* computed from `ContributionEvent` rows, or a distinct persisted entity/table? Builder A treats it as a derived query (`SELECT DISTINCT participant FROM contribution_event ORDER BY...`); Builder B, seeing "conserve et affiche" (PRD: "conserve" implying persistence) builds a dedicated `contributor_history` materialized table. Two backends, two schemas, same feature.
- **"Participant inscrit"** vs. plain **"Participant"** vs. **"Guest"** — AD-4 collapses "Participant / Participant inscrit" into one code term `Participant`, distinguished only by `Guest`/`isGuest`. But PRD FR-17 gates Room *creation* specifically to "Participant inscrit" (not just non-guest) — is there a case where `Participant.isGuest = false` but the account is otherwise incomplete/unverified? The table doesn't clarify whether `isGuest: false` is the sole and sufficient gate for "peut créer un Salon," or whether a separate registered/verified flag is needed. Two builders could implement the FR-17 authorization check differently (`!isGuest` vs. a hypothetical `emailVerified` check that only one of them adds).
- **`ContributionEvent`** itself appears in the Structural Seed ER diagram but has zero entry in the AD-4 table and zero definition of its `type` enum — Builder A and Builder B will each invent their own set of event type strings (`'piece_placed' | 'cluster_formed' | 'frame_completed'` vs. `'PLACE' | 'MERGE' | 'COMPLETE'`), guaranteed to diverge since nothing pins the vocabulary.

**Fix.** Extend the AD-4 table with explicit rows for: `Cadre complet` → `FrameCompleted` (event name), `Historique des contributeurs` → derived-view vs. persisted-table decision (pick one; recommend derived, since it's fully reconstructable from `ContributionEvent` and avoids dual-write drift), and a fully enumerated `ContributionEvent.type` union pinned in the spine (not left to each builder). Also add one line clarifying FR-17's gate is exactly `Participant.isGuest === false`, no additional verification flag, unless the PRD is amended.

---

## Hole 7 — AD-2: nothing in the spine actually *prevents* a direct Supabase client write — it's a stated intention, not an enforced mechanism

**Scenario.** Both builds ship `@supabase/supabase-js` in the client bundle (needed for Supabase Auth per the Consistency Conventions table, and commonly reused for Storage uploads per FR "choix de photo personnelle").

- **Builder A**, in a hurry to ship a small feature (e.g., toggling a personal "favorite piece color" preference, or the mute-sound toggle, or reading Room metadata for the Accueil list), writes `supabase.from('room_participant').update(...)` directly from a client component — reasoning "this isn't one of the three mutations AD-2 explicitly binds (Room creation, Piece placement, Cluster formation/merge), so a direct client write is fine here." This is a textbook literal-compliance-but-spirit-violation: AD-2's Rule says "Aucun client... n'écrit directement dans Postgres" (unqualified — should cover everything) but its **Binds** line only lists three specific mutation types, giving Builder A a plausible reading that anything *outside* those three binds is unconstrained.
- **Builder B** reads the Rule sentence literally (universal — "aucun client... jamais") and correctly never writes client-side, but has no RLS policies to fall back on if a future contributor (or a compromised client, or a native app builder years later) does try — because the spine never mandates Postgres RLS as a defense-in-depth backstop. The system's only enforcement is "well-meaning engineers reading a markdown rule."

**Why this is dangerous specifically for Supabase.** The Supabase client SDK trivially supports authenticated writes with just an anon/JWT key already present in the browser bundle for Auth purposes. There is no technical barrier — no missing credential, no separate network boundary — stopping a client write; only social convention. The spine states the intended architecture but never specifies the enforcement mechanism (RLS deny-by-default, no grants to `authenticated`/`anon` roles on mutating tables, or a linter rule banning `supabase.from(...).insert/update/delete` outside `app/**/actions.ts`).

**Fix.** Add a Rule (new AD or extend AD-2): "Postgres RLS policies on `piece`, `cluster`, `room`, `contribution_event`, `room_participant` MUST deny INSERT/UPDATE/DELETE to the `authenticated` and `anon` roles entirely; all mutation grants exist only for the `service_role` used by Server Actions. Supabase client SDK usage from browser code is permitted only for Auth and read-oriented Storage upload URLs, never for `.from(table).insert/update/delete()` on domain tables." This converts "shouldn't happen" into "cannot happen even if someone tries," and closes the Binds-list loophole by making the Rule apply to literally every table, not just the three named mutation types.

---

## Hole 8 — AD-1 vs. AD-2 boundary: is a Server Action's *response payload* also required to flow only through Electric, or can it directly update the TanStack DB collection?

**Scenario.** After `placePiece` succeeds server-side, the client needs to reconcile its optimistic state with truth.

- **Builder A** treats AD-1 ("Tout état partagé... synchronisé... exclusivement via une Shape ElectricSQL") as absolute: the Server Action returns only `{ ok: true }`; the client's TanStack DB collection is updated *solely* when the Electric Shape stream delivers the Postgres change — meaning there's an inherent lag (replication latency) between "action succeeded" and "UI shows confirmed state," during which the UI still shows the optimistic (unconfirmed) value.
- **Builder B** treats AD-1 as being about *cross-client* shared state sync only, and has the Server Action return the full updated Piece row, which the *calling* client applies directly to its local TanStack DB collection immediately (bypassing Electric for its own optimistic-confirmation loop) — while other clients still get it via Electric. This is a reasonable, arguably better-UX reading, but it means the calling client's collection can now be updated via two different code paths (direct action-response write vs. Electric Shape apply) with two different race/ordering conditions, e.g., what happens if the Electric-sourced update for the *same* row arrives with an equal or different value shortly after the direct write.

**Why the spine doesn't resolve it.** AD-1 says "Aucun polling ni canal de sync parallèle" but doesn't clarify whether the Server Action's own return value, applied to the *initiating* client's local collection, counts as a second "channel." Reasonable builders land on opposite answers, and only Builder A is unambiguously AD-1-compliant by the strictest reading — meaning Builder B's arguably-better UX pattern may actually be a spine violation nobody flagged before shipping.

**Fix.** Add one clarifying sentence to AD-1: "The initiating client's own optimistic Piece/Cluster mutation is reconciled exclusively by the next Electric Shape update for that row — a Server Action's return value MUST NOT be applied directly to the TanStack DB collection, even by the client that issued the mutation, to keep exactly one confirmation path." (Or, if the intended design is the opposite, state that explicitly — either answer is fine, but the spine currently gives none.)

---

## Hole 9 — Structural Seed: `lib/validation/` described as "seul point d'appel depuis les Server Actions" but nothing enforces that Server Actions themselves aren't scattered across the tree

**Scenario.** The Structural Seed shows `app/room/[id]/`, `app/create/`, `app/stats/[roomId]/` as page routes, and says Server Actions are "colocalisées" (co-located) with pages under `app/`.

- **Builder A** puts all Piece/Cluster mutation Server Actions in a single `app/room/[id]/actions.ts` co-located with the Room page, per Next.js convention, and imports `lib/validation` from there.
- **Builder B**, building the "create Room" epic independently, puts *its* Server Actions in `app/create/actions.ts` — fine, no clash there — but also, because FR-13 (contributor history) and FR-21 (stats) need to log/query `ContributionEvent`, Builder B adds a *second* mutating Server Action inside `app/stats/[roomId]/actions.ts` that writes directly to `contribution_event` without routing through `lib/validation` (reasoning: "this isn't a Piece/Cluster placement, FR-6 validation doesn't apply to logging a view event, so `lib/validation` isn't relevant here").

**Why this is a real drift risk.** The seed's comment ties `lib/validation` to "Server Actions" generically but the only named consumer example is FR-6 (Piece/Cluster geometry). Nothing states that *every* mutating Server Action (including ContributionEvent writes, Cluster stat increments, streak updates) must funnel through a single reviewed module, or that Server Actions themselves must live in a small enumerable set of files rather than proliferating per-feature with duplicated ad-hoc validation/authorization logic (e.g., re-checking `!isGuest` inline in three different files instead of a shared helper). Two epics built independently can each be "seed-compliant" while one has centralized authZ/validation and the other has copy-pasted, silently-diverging checks.

**Fix.** Add a line to the Structural Seed: "Every Server Action, regardless of feature area, imports its authorization check (`Participant.isGuest` gating) and any domain-rule validation from `lib/validation/` and `lib/auth/` — no inline re-implementation of FR-6 correspondence checks or FR-17 registration gating outside these modules." Consider also naming the exhaustive list of Server Action files expected (or a convention like "one `actions.ts` per route segment, no bare Server Actions in component files").

---

## Hole 10 — Deferred item on offline behavior collides with AD-1/AD-2 in a way that isn't actually deferred-safe

**Scenario.** Deferred says detailed offline behavior is "au-delà du rollback optimiste générique de TanStack DB" — i.e., out of scope for this spine, presumably to be handled at epic/story level.

- **Builder A** (Piece-placement epic) assumes TanStack DB's default behavior: an offline optimistic mutation queues locally and replays the Server Action call when connectivity returns, in original order, one at a time.
- **Builder B** (Cluster-merge epic, built independently, possibly by a different engineer or even a future native-client team per the "future native client" framing in this task) assumes offline mutations are *coalesced* — e.g., if a user offline drags a Cluster through 5 intermediate positions, only the final position is replayed, not all 5 — because replaying 5 stale merge attempts against a possibly-already-merged Cluster would throw 4 spurious conflict errors (tying back to Hole 1/3's undefined CAS semantics).

**Why deferring this is risky, not neutral.** Since AD-1/AD-2 don't define the server's conflict semantics precisely (Hole 1), the offline-replay strategy is *not* actually independent from those ADs — the "right" offline strategy depends entirely on what the server does with stale/conflicting replayed writes, which is exactly the thing left unspecified. Marking offline behavior "deferred" while also leaving the conflict-resolution primitive undefined means whichever epic builds first will silently set the de facto contract for the other.

**Fix.** This doesn't need to be un-deferred in scope, but the spine should note the dependency explicitly: "Offline-replay strategy (deferred) depends on the optimistic-concurrency contract defined in [new AD-2b, see Hole 1] — do not design offline queuing before that contract is pinned, to avoid two epics assuming different server semantics."

---

## Hole 11 — AD-5 ("Konva only") doesn't cover non-canvas UI that renders Piece/Cluster state (e.g., stats view, contributor history), inviting a second rendering paradigm by omission

**Scenario.** AD-5 binds "UI du Room (Canvas, Frame, Piece, Cluster)" to Konva. The Stats view (`app/stats/[roomId]/`) and the "Historique des contributeurs" list (EXPERIENCE.md) are explicitly *not* canvas — they're ordinary DOM/shadcn list views, which is clearly the right call and not itself a hole. But:

- **Builder A**, building the Room page, renders the small "Îlot outline" indicator and avatar chip (EXPERIENCE.md: "chip avatar/initiale... assure la désambiguïsation") as Konva shapes layered on the canvas, per AD-5's literal binding ("UI du Room" includes Cluster).
- **Builder B**, building presence indicators (who's online) for the *same* Room page, renders the avatar/presence chips as an HTML/shadcn overlay positioned absolutely on top of the Konva `<Stage>` (a common and often *better* pattern for text-heavy, accessibility-sensitive UI, and arguably required anyway by EXPERIENCE.md's `aria-live` requirement for screen readers, since Konva canvas content is not naturally screen-reader-accessible).

Both are locally reasonable, but now the codebase has two different patterns for "how do we show a small UI chip anchored to canvas-space coordinates" — one in Konva-shape coordinate space, one in DOM/CSS-transform coordinate space synced to canvas pan/zoom — with no shared utility, and they will drift in how they handle pan/zoom transforms, z-index stacking, and hit-testing.

**Fix.** Add a clarifying note under AD-5: "Non-canvas UI that must be spatially anchored to Piece/Cluster/Room canvas coordinates (avatar chips, aria-live announcements, any DOM overlay) is out of AD-5's Konva binding by design (for accessibility), but MUST go through a single shared coordinate-projection utility (e.g., `lib/canvas/project-to-screen.ts`) rather than each feature reimplementing the Konva-viewport-to-DOM transform independently."

---

## Summary Table

| # | AD/Deferred | Two incompatible builds | Suggested fix |
|---|---|---|---|
| 1 | AD-2 | CAS-reject server vs. LWW-overwrite server for racing Piece writes | Mandate optimistic-concurrency check + `STALE_WRITE` error contract |
| 2 | AD-2 / Deferred #5 | Animated-rollback vs. disappear-then-reappear rollback | Bind rollback visual continuity to NFR-1 as a Rule |
| 3 | AD-2/AD-3 | Atomic single-transaction merge vs. per-Piece looped merge | Mandate merge = single atomic Server Action/transaction |
| 4 | AD-3 | Every Piece is a Cluster-of-1 vs. Cluster only exists at ≥2 pieces | Pin `Cluster` existence rule + stats-counting rule |
| 5 | AD-3 | OR-across-edges vs. AND-across-edges merge validation | Pin ALL-edges-must-match quantifier |
| 6 | AD-4 | Untabled terms (`Cadre complet`, contributor history, `ContributionEvent.type`) invented twice | Extend AD-4 table with missing rows + enum |
| 7 | AD-2 | "Just this once" direct Supabase client write outside the 3 named Binds | Mandate RLS deny-by-default as enforcement, not just a stated rule |
| 8 | AD-1/AD-2 | Server Action response applied directly to local collection vs. Electric-only reconciliation | Pin single confirmation path explicitly |
| 9 | Structural Seed | Centralized vs. duplicated inline validation/authZ across epics | Mandate all Server Actions import from `lib/validation`/`lib/auth` |
| 10 | Deferred (offline) | Sequential replay vs. coalesced replay of offline mutations | Flag dependency on conflict-resolution contract before designing |
| 11 | AD-5 | Konva-shape chip vs. DOM-overlay chip for canvas-anchored UI | Mandate shared coordinate-projection utility for DOM overlays |
