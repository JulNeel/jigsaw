---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md
---

# Jigsaw - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Jigsaw (mode Salon V1), decomposing the requirements from the PRD, UX Design spines (DESIGN.md + EXPERIENCE.md), and Architecture Spine into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Le Participant peut naviguer librement (pan/zoom) dans l'espace infini.
FR2: Le Participant peut recentrer la vue sur le Cadre en un geste, à tout moment, depuis n'importe quelle position/zoom (bouton "recentrer" toujours visible).
FR3: Le Cadre affiche l'état courant du puzzle assemblé ; toute pièce intégrée y apparaît sans délai perceptible pour tous les Participants présents.
FR4: Le Participant peut assembler plusieurs pièces ensemble pour former un Îlot, sans les positionner dans le Cadre. La fusion ne se déclenche que si les découpes correspondent réellement (jamais par simple proximité). Le Participant peut aussi rapprocher librement des pièces sans fusion (rangement personnel). Deux Îlots distincts peuvent fusionner entre eux selon la même règle.
FR5: Un Îlot peut être déplacé comme un seul bloc dans l'espace infini.
FR6: Une pièce ou un Îlot s'intègre automatiquement au Cadre dès que sa forme élémentaire (coin/bord/intérieur) correspond à un emplacement disponible et que ses bords adjacents correspondent réellement aux pièces déjà posées — sans jamais vérifier la position contre l'image source (une pièce-coin peut être posée dans le mauvais coin).
FR7: Plusieurs Îlots peuvent coexister simultanément, travaillés en parallèle par différents Participants ; plusieurs Participants peuvent agir simultanément sur le même Îlot sans verrouillage exclusif (résolution de conflit déléguée à l'architecture).
FR8: Toute personne disposant du lien du Salon peut y accéder et contribuer en tant qu'Invité, sans création de compte.
FR9: Au premier accès, un Invité non connecté voit un tutoriel rapide (modale) expliquant les gestes de base : déplacer, pivoter, positionner dans le Cadre, créer un Îlot.
FR10: Avant de quitter le Salon, le système propose à l'Invité de s'inscrire/se connecter pour conserver sa progression (déclenché sur action explicite de sortie, best-effort sur fermeture d'onglet/app).
FR11: Un Participant inscrit retrouve sa progression et ses statistiques lors d'une session ultérieure.
FR12: Le Salon affiche les Participants actuellement en ligne (actif = activité détectée dans les 30 dernières secondes).
FR13: Le Salon conserve et affiche l'historique des personnes ayant contribué.
FR14: Le placement d'une pièce ou d'un Îlot déclenche un retour visuel et sonore satisfaisant ; le son est activable/désactivable indépendamment par chaque Participant.
FR15: Le système suit, pour chaque Participant inscrit, le nombre de pièces posées, le nombre d'Îlots créés, le temps passé, et le nombre de jours consécutifs de contribution (streak), cumulés sur la durée de vie du Salon. Si un Invité s'inscrit avant de quitter (FR10), ses contributions de session sont rattachées rétroactivement à son nouveau compte.
FR16: Les statistiques de chaque Participant sont visibles par l'ensemble des Participants du Salon.
FR17: Un Participant inscrit peut créer un nouveau Salon ; un Invité ne le peut pas (nécessite compte + session active).
FR18: Lors de la création, le créateur choisit l'image du puzzle depuis une bibliothèque fournie par l'application, ou en important une photo personnelle.
FR19: Lors de la création, le créateur choisit le nombre de pièces du puzzle.
FR20: À la création du Salon, le système génère un lien d'invitation public permettant à quiconque le possède de rejoindre en tant qu'Invité (réalise FR8). L'invitation restreinte à des personnes nommées n'existe pas en V1.
FR21: Un Participant peut consulter les statistiques du Salon triées selon un critère de son choix (pièces posées, Îlots créés, temps passé, streak) ; le classement reste un outil de consultation flexible, pas un score unique imposé par défaut.
FR22: Le système détecte que le Cadre est complet lorsque le nombre de pièces posées atteint le total du puzzle, et déclenche une célébration distincte du retour de placement habituel, visible par tous les Participants présents, sans second contrôle contre l'image source.

### NonFunctional Requirements

NFR1 (Stabilité/Fiabilité): Le déplacement d'une pièce ou d'un Îlot dans l'espace infini reste stable et prévisible en toute circonstance — pas de dépassement erratique de la position pointée, pas de blocage ni de perte de pièce en bord d'espace infini (réponse directe aux défauts documentés des concurrents : pièces qui "giclent", blocages en bord d'écran).
NFR2 (Usabilité/Tonalité): Le retour de placement (son + micro-animation) doit être perçu comme fortement satisfaisant — enjeu de tonalité produit central, pas un détail cosmétique.
NFR3 (Usabilité/Éthos produit): L'affichage des statistiques/classement doit rester un outil de consultation flexible choisi par le lecteur, jamais un score/rang unique imposé par défaut à tous les Participants.
NFR4 (Accessibilité — WCAG 2.2 AA): Contraste AA vérifié sur toute la chrome UI ; nom accessible (`aria-label`) sur tout contrôle à icône seule ; taille de cible minimale 24×24px CSS hors canvas ; région `aria-live="polite"` pour les événements collaboratifs significatifs ; `prefers-reduced-motion` respecté ; tout retour sonore doublé d'un signal visuel (jamais sonore seul) ; contrôle mute toujours accessible sans sous-menu.
NFR5 (Cohérence de synchronisation): Tout état partagé (Room/Salon, Piece, Cluster/Îlot, ContributionEvent) doit rester cohérent entre tous les clients connectés sans divergence, via un canal de synchronisation unique — pas de polling ni canal parallèle.
NFR6 (Intégrité anti-triche): Aucune validation métier (correspondance des découpes FR6) ne doit pouvoir être contournée depuis un client ; le serveur reste seul autoritaire pour toute écriture.

### Additional Requirements

- Paradigme d'architecture imposé : local-first / sync optimiste — client TanStack DB (collections réactives + mutations optimistes avec rollback), synchronisation en lecture via ElectricSQL (Shapes Postgres scopées par Salon/Room), Postgres comme source de vérité unique.
- Toute écriture de domaine passe exclusivement par des Server Actions Next.js ; RLS deny-by-default sur toutes les tables de domaine (Room, Piece, PieceAdjacency, Cluster, ContributionEvent, RoomPresence, RoomParticipant) — aucun droit INSERT/UPDATE/DELETE pour les rôles `anon`/`authenticated` Supabase.
- Service de découpe des pièces (déterministe, à graine fixe) déclenché à la création du Salon : génère la silhouette de chaque pièce (algorithme à languettes de Bézier), sa `PieceShape` (Corner/Edge/Interior), et le graphe `PieceAdjacency` (vrais voisins précalculés) ; produit les tuiles image stockées dans Supabase Storage (bucket `piece-tiles`, un dossier par Room). La validation FR6 est une consultation de ce graphe, jamais un recalcul géométrique à la volée.
- Table de correspondance de vocabulaire figée entre les specs (français) et le code (anglais) : Salon→Room, Cadre→Frame, Espace infini→Canvas, Îlot→Cluster, Invité→Guest, Participant/Participant inscrit→Participant, Forme élémentaire→PieceShape.
- Contrôle de concurrence optimiste sur toute Server Action mutante (colonne version/updated_at) ; en cas de conflit, réponse `{ error: { code: 'STALE_WRITE' } }`, jamais d'écrasement silencieux ; côté client, transition visible depuis la position optimiste vers la dernière position confirmée (jamais une disparition, cf. NFR1).
- Présence (FR12) implémentée via une table `RoomPresence` + Server Action de heartbeat, synchronisée par le même canal Electric que le reste du Salon — pas de canal temps réel séparé.
- Rendu du canvas exclusivement via Konva.js + `react-konva` ; tout contenu non-canvas ancré spatialement (chips d'avatar, annonces aria-live) passe par un utilitaire de projection de coordonnées partagé.
- Stack fixée : Next.js 16.x (App Router) + React 19.x + TypeScript 5.x ; TanStack DB (pré-1.0) + ElectricSQL ≥1.5.0 (CVE-2026-40906 corrigée) ; Konva.js/react-konva ; Tailwind + shadcn/ui ; Supabase (Postgres + Auth + Storage, connexion directe hors pooler pour la réplication logique) ; Capacitor pour le wrapper mobile (charge l'origine Next.js déployée, pas d'export statique) ; hébergement web Vercel.
- Pas de starter tiers nommé : bootstrap via `create-next-app` (App Router) standard, sans template greenfield externe — l'architecture (TanStack DB + Electric + Supabase + Konva + shadcn) est assemblée manuellement, à documenter dans la Story 1 de l'Epic 1.
- IDs = UUID v4 (`gen_random_uuid()`) ; dates = `timestamptz` Postgres / ISO 8601 au transport ; enveloppe d'erreur de Server Action = `{ error: { code, message } }`, registre de codes partagé (pas de chaînes libres par site d'appel).
- Environnements dev/preview/production (Vercel preview natif par PR ; séparation Supabase dev/prod à trancher en implémentation — cf. Deferred architecture).
- Arborescence de référence : `app/` (room/[id], create/, stats/[roomId]/) ; `components/canvas/` et `components/ui/` ; `lib/piece-cutting/`, `lib/validation/`, `lib/auth/`, `lib/canvas/`, `lib/db/` ; `supabase/migrations/`. Toute Server Action mutante importe son autorisation depuis `lib/auth/` et sa validation depuis `lib/validation/` — jamais de réimplémentation inline.

### UX Design Requirements

UX-DR1: Palette de couleurs de marque vérifiée WCAG 2.2 AA — `background` #FBF7F1, `foreground` #2B2621, `muted` #EFE6D8, `muted-foreground` #6E6153, `border` #E3D6C2, `card` #FFFDF9, `primary` #A8541F (+ `primary-foreground` blanc), `accent` #A67518, `ring` surchargé #A8541F — à implémenter comme tokens shadcn/Tailwind, remplaçant les neutres froids par défaut sur toute la surface.
UX-DR2: Échelle d'arrondis dédiée (`rounded/sm` 6px, `rounded/md` 8px, `rounded/lg` 12px, `rounded/full` pour présence/bouton recentrer) — plus arrondie que les défauts shadcn.
UX-DR3: Typographie shadcn par défaut (Geist Sans) sans surcharge display/serif ; espacement Tailwind/shadcn par défaut sans surcharge.
UX-DR4: Composant bespoke "Pièce de puzzle" — asset de canvas suivant la silhouette de découpe réelle (pas la grille d'arrondis UI), halo `accent` à faible opacité + ombre portée quand sélectionnée/en déplacement.
UX-DR5: Composant bespoke "Îlot" — contour en tirets `accent` visible uniquement pendant déplacement/juste après création ; chip avatar/initiale du Participant manipulateur affiché quand plusieurs Îlots sont actifs en parallèle (désambiguïsation, pas de dépendance à la seule couleur).
UX-DR6: Composant "Bouton recentrer" — flottant, circulaire, toujours visible en superposition du canvas ; limite visuelle garantie par l'ombre portée (la bordure seule est peu contrastée, ~1.3:1).
UX-DR7: Composant "Avatar de Participant" — cercle avec initiale, couleur assignée cycliquement parmi primary/accent/muted-foreground, réutilisé dans Présence, chip de désambiguïsation d'Îlot, Ligne de classement, Historique.
UX-DR8: Composant "Point de présence" — pastille `accent` superposée sur l'Avatar (coin inférieur droit), toujours combinée à l'avatar (jamais isolée).
UX-DR9: Composant "Ligne de classement" (vue Statistiques) — une ligne par Participant, fond `muted`, se réordonne instantanément au changement de critère de tri (FR21), pas d'interaction au clic.
UX-DR10: Composant "Historique des contributeurs" — composition shadcn standard (liste/Table), accessible depuis le Salon et la vue Statistiques sans écran dédié séparé.
UX-DR11: Sept surfaces d'IA à livrer : Accueil (connecté), Connexion/Inscription, Création de Salon, Salon (Espace infini + Cadre), Tutoriel (modale), Partage du Salon, Statistiques du Salon — voir mockups `key-accueil.html`, `key-tutorial-modal.html`, `key-creation-salon.html`, `key-salon.html`, `key-statistiques.html`.
UX-DR12: Modale tutoriel construite sur shadcn `Dialog`/Radix — piège de focus, fermeture `Échap`, `role="dialog"`/`aria-modal`, focus initial sur le premier élément actionnable, titre de dialogue accessible explicite ; non bloquante après le premier passage.
UX-DR13: Accessibilité — contraste AA documenté par paire de tokens ; `aria-label` obligatoire sur tout contrôle à icône seule (recentrer, mute, inviter) ; taille de cible minimale 24×24px CSS pour la chrome hors-canvas ; région `aria-live="polite"` pour les événements collaboratifs (pièce/Îlot intégré, Participant qui rejoint/quitte) ; `prefers-reduced-motion` respecté (micro-animation de snap réduite à un changement d'état) ; alternative clavier complète au drag-and-drop explicitement hors scope V1 (médium manipulatoire par nature).
UX-DR14: Interactions du canvas — pan/zoom (glisser, pincer tactile, molette desktop) ; drag pièce/Îlot ; rotation par double-tap (mobile)/double-clic (desktop) ; rangement libre sans fusion vs fusion réelle (même règle que FR6) ; recentrage par tap sans geste clavier requis.
UX-DR15: Responsive — web desktop (`≥ lg`, canvas plein écran, overlays coin haut/bas) et web mobile/wrapper (`< md`, gestes tactiles, modale tutoriel plein écran) ; Statistiques et Création de Salon toujours en colonne unique, jamais de layout multi-colonnes forcé.
UX-DR16: Voix et ton — microcopy factuelle et chaleureuse sans grandiloquence (ex. "12 pièces posées aujourd'hui", "Le puzzle est terminé — bravo à tout le Salon") ; bannir le vocabulaire de gamification agressif (scores/niveaux/badges tape-à-l'œil, emojis de célébration excessifs).
UX-DR17: Anti-patterns explicitement rejetés à vérifier en implémentation — aucune publicité entre/pendant les puzzles ; aucun upsell d'inscription sans option de fermeture visible ; aucun son de clic/snap non désactivable ; aucune pièce qui "gicle" ou se bloque en bord d'écran (cf. NFR1).

### FR Coverage Map

FR1: Epic 3 - Infinite canvas navigation
FR2: Epic 3 - Recenter on the Frame
FR3: Epic 3 - Frame state display
FR4: Epic 3 - Cluster creation / free grouping
FR5: Epic 3 - Cluster movement
FR6: Epic 3 - Automatic Frame integration (geometric validation)
FR7: Epic 3 - Multiple/parallel Clusters, concurrent access
FR8: Epic 3 - Link-based access (Guest)
FR9: Epic 3 - First-contribution tutorial
FR10: Epic 4 - Sign-up prompt on exit
FR11: Epic 4 - Progress persistence
FR12: Epic 4 - Live presence
FR13: Epic 4 - Contributor history
FR14: Epic 3 - Placement feedback
FR15: Epic 5 - Per-Participant stat tracking
FR16: Epic 5 - Shared stat visibility
FR17: Epic 2 - Room creation restricted to registered Participants
FR18: Epic 2 - Puzzle image selection
FR19: Epic 2 - Piece count selection
FR20: Epic 2 - Public invite link generation
FR21: Epic 5 - Configurable stats sorting
FR22: Epic 3 - Frame-complete detection

NFR1 (movement stability): Epic 3
NFR2 (feedback tone): Epic 3
NFR3 (non-hierarchical stats ethos): Epic 5
NFR4 (WCAG 2.2 AA accessibility): Cross-cutting - addressed in relevant stories across all epics
NFR5 (sync consistency): Epic 4 (presence), foundation laid in Epic 3
NFR6 (anti-cheat integrity): Epic 3

### Glossary (spec FR ↔ code EN — AD-4)

| Spec term (FR) | Code term (EN) |
| --- | --- |
| Salon | Room |
| Cadre | Frame |
| Espace infini | Canvas |
| Îlot | Cluster |
| Invité | Guest |
| Participant / Participant inscrit | Participant (registered) |
| Forme élémentaire | PieceShape (Corner / Edge / Interior) |

All epics and stories below use the English (code) terms exclusively, per AD-4.

## Epic List

### Epic 1: Foundations & Account
A user can create an account, log in, and see their Home screen (list of their Rooms, even empty). Lays the technical groundwork (Next.js/Supabase/TanStack DB/Electric bootstrap, no third-party starter) and the account model required by later epics.
**FRs covered:** none numbered directly (structural prerequisite for FR10, FR11, FR17)

### Epic 2: Room Creation
A registered Participant creates a Room by choosing an image (library or personal photo) and a piece count, then gets a public invite link ready to share.
**FRs covered:** FR17, FR18, FR19, FR20

### Epic 3: Assembling the Puzzle Together
A Guest joins a Room via link with no account, follows the tutorial, navigates the infinite Canvas, places pieces that snap into the Frame through real geometric matching (never by checking position against the source image), groups pieces into Clusters (which can merge with each other), and sees the completed Frame celebrated as a shared event.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR14, FR22

### Epic 4: Presence, History & Guest Conversion
Participants see who is online and can browse the contribution history; a Guest can sign up before leaving to keep their progress, retroactively attached to their new account.
**FRs covered:** FR10, FR11, FR12, FR13

### Epic 5: Valorizing Stats
Every registered Participant sees their own stats (pieces placed, Clusters created, time spent, streak) and everyone else's, sortable by their chosen criterion, with no default imposed ranking.
**FRs covered:** FR15, FR16, FR21

## Epic 1: Foundations & Account

**FRs covered:** none numbered directly (structural prerequisite for FR10, FR11, FR17) · **Additional Requirements:** bootstrap with no third-party starter, fixed stack, reference source tree · **UX-DR11** (Home, Sign-in/Sign-up surfaces)

### Story 1.1: Project bootstrap

As a developer,
I want the project scaffolded with the chosen stack (Next.js App Router, TypeScript, Tailwind + shadcn/ui, Supabase, TanStack DB, ElectricSQL, Konva.js),
So that later stories can build user-facing features on a consistent foundation instead of reinventing configuration each epic.

**Acceptance Criteria:**

**Given** an empty repository
**When** the bootstrap is run (`create-next-app`, no external third-party starter)
**Then** the reference source tree exists (`app/`, `components/canvas/`, `components/ui/`, `lib/piece-cutting/`, `lib/validation/`, `lib/auth/`, `lib/canvas/`, `lib/db/`, `supabase/migrations/`)
**And** Supabase is connected (Postgres via direct connection, not the pooler, Auth, Storage), ElectricSQL ≥1.5.0 is configured, TanStack DB is initialized
**And** dev/preview/production environments are defined (Vercel)
**And** the DESIGN.md brand-layer tokens are wired into the Tailwind/shadcn theme (colors, `rounded` scale, default typography/spacing with no display-font override) so every later story consumes them rather than ad-hoc values (UX-DR1, UX-DR2, UX-DR3)

### Story 1.2: Sign-up

As a visitor,
I want to create an account,
So that I become a registered Participant and can access gated capabilities (creating a Room, keeping my progress).

**Acceptance Criteria:**

**Given** an unauthenticated visitor on the Sign-in/Sign-up screen
**When** they submit a valid email and password
**Then** an account is created via Supabase Auth and they are automatically signed in
**And** an already-used email or an invalid field shows an inline error message under the relevant field, without losing what was already entered (EXPERIENCE.md State Patterns)

### Story 1.3: Sign-in

As a registered Participant,
I want to sign in with my existing account,
So that I recover my identity and any future persisted data.

**Acceptance Criteria:**

**Given** a registered Participant with an existing account
**When** they submit valid credentials
**Then** they are signed in and redirected to Home
**And** invalid credentials show an inline error message with no redirect (EXPERIENCE.md State Patterns)

### Story 1.4: Home

As a signed-in registered Participant,
I want to see the list of my Rooms and a button to create a new one,
So that I have a persistent entry point into the app.

**Acceptance Criteria:**

**Given** a signed-in registered Participant with no Room yet
**When** they land on Home
**Then** an empty state is shown (short message + a prominent "Create a Room" button), with no error
**And** a skeleton is shown while the Room list is loading (EXPERIENCE.md State Patterns)
**And** if Rooms exist, each shows its name, progress (pieces placed/total), and count of online Participants (prepared for Epic 4; a static/zero display is acceptable until that data exists)

## Epic 2: Room Creation

**FRs covered:** FR17, FR18, FR19, FR20 · **Additional Requirements:** deterministic piece-cutting service, vocabulary table · **UX-DR:** Room-creation screen (`key-creation-salon.html`, two states)

### Story 2.1: Gate Room creation to registered Participants

As a Guest,
I want to be blocked from creating a Room,
So that only registered Participants (who can be held accountable and whose stats persist) originate new Rooms.

**Acceptance Criteria:**

**Given** an unauthenticated Guest
**When** they attempt to reach the Room-creation screen
**Then** they are redirected to Sign-in/Sign-up instead
**And** a signed-in registered Participant reaches the screen directly from the "Create a Room" button on Home

### Story 2.2: Choose the puzzle image

As a registered Participant creating a Room,
I want to pick an image from a provided library or upload a personal photo,
So that the Room's puzzle shows a picture I actually want to share with my household.

**Acceptance Criteria:**

**Given** the Room-creation screen
**When** the Participant selects a library thumbnail
**Then** that image is marked selected and used for the Room
**When** the Participant uploads a personal photo instead
**Then** the upload replaces the library selection as the active choice
**And** an upload failure (format, size) shows an inline error message; the Participant stays on the creation screen and nothing already entered is lost (EXPERIENCE.md State Patterns)

### Story 2.3: Choose the piece count

As a registered Participant creating a Room,
I want to choose how many pieces the puzzle will have,
So that the difficulty matches what my household wants to tackle.

**Acceptance Criteria:**

**Given** the Room-creation screen with an image already chosen
**When** the Participant selects a piece count
**Then** the choice is retained for Room creation
**And** if the chosen image's resolution is too low for the requested piece count, a blocking warning offers to reduce the piece count or pick another image `[carried from PRD Open Question #3 — provisional behavior, not fully specified]`

### Story 2.4: Create the Room and get a shareable invite link

As a registered Participant,
I want to finalize my Room and receive a public invite link,
So that I can immediately send it to my household and let them join.

**Acceptance Criteria:**

**Given** a chosen image and piece count
**When** the Participant confirms creation
**Then** the deterministic piece-cutting service runs once (seeded algorithm), producing each Piece's `PieceShape` (Corner/Edge/Interior) and the `PieceAdjacency` graph of true neighbors, with image tiles written to Supabase Storage
**And** a public invite link is generated and displayed with a "Copy" action and share shortcuts (e.g. WhatsApp, email)
**And** the invite link resolves to a fully-prepared Room record — pieces already cut, `PieceAdjacency` graph ready — with no generation delay for whoever opens it later (the joining experience itself is delivered by Epic 3)
**And** all pieces are scattered at random positions around the Frame in the infinite Canvas — never pre-arranged or pre-sorted — so the first Participant to arrive finds a genuinely unsolved puzzle

## Epic 3: Assembling the Puzzle Together

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR14, FR22 · **NFRs:** NFR1 (stability), NFR2 (feedback tone), NFR6 (anti-cheat) · **UX-DR:** `key-salon.html`, `key-tutorial-modal.html`, canvas components, Accessibility Floor

### Story 3.1: Join a Room as a Guest

As a person with a Room's invite link,
I want to open it and land directly inside the Room,
So that I can start contributing without any signup friction.

**Acceptance Criteria:**

**Given** a valid Room invite link
**When** an unauthenticated person opens it
**Then** they enter the Room as a Guest with no account creation step
**And** they see the Canvas with the Frame and any pieces already placed or scattered, reflecting the Room's current state
**And** an invalid or expired link shows a clear error instead of a broken Canvas

### Story 3.2: First-access tutorial

As a Guest entering a Room for the first time,
I want a short tutorial explaining the core gestures,
So that I know how to move, rotate, place a piece, and form a Cluster before I start.

**Acceptance Criteria:**

**Given** a Guest's first visit to a given Room
**When** the Canvas loads
**Then** a modal tutorial appears automatically, covering: move a piece, rotate it, place it in the Frame, create a Cluster
**And** the modal is built on shadcn `Dialog`/Radix: focus trap, `Escape` dismiss, `role="dialog"`/`aria-modal`, explicit accessible title, sensible initial focus
**And** on a later visit within the same session, the tutorial does not reappear automatically

### Story 3.3: Navigate the infinite Canvas

As a Participant in a Room,
I want to pan and zoom freely around the Canvas,
So that I can explore scattered pieces and work anywhere in the space.

**Acceptance Criteria:**

**Given** the Canvas is loaded
**When** the Participant drags to pan, or pinches/scrolls to zoom
**Then** the view updates smoothly with no perceptible lag, rendered via Konva.js/`react-konva`
**And** no piece ever becomes permanently unreachable or stuck outside the navigable area (NFR1)
**And** on a desktop viewport (`≥ lg`) the Canvas fills the screen with recenter/presence overlays in the corners, controlled by mouse/trackpad; on mobile/wrapper (`< md`) the same Canvas responds to touch gestures (one-finger pan, pinch-zoom) with no separate mobile-only layout (UX-DR15)

### Story 3.4: Recenter on the Frame

As a Participant who has panned or zoomed away,
I want a one-tap way to snap back to the Frame,
So that I never feel lost in the infinite Canvas.

**Acceptance Criteria:**

**Given** any pan/zoom state
**When** the Participant activates the always-visible recenter button
**Then** the view returns to the Frame regardless of current position/zoom
**And** the button carries an accessible name (e.g. "Recenter on the Frame") and a minimum 24×24px CSS target size

### Story 3.5: Place a piece into the Frame with real geometric validation

As a Participant,
I want to drag a piece toward the Frame and have it snap in only when it truly belongs there,
So that assembling the puzzle feels like a real physical puzzle, not an arbitrary click-to-place.

**Acceptance Criteria:**

**Given** a piece in the Canvas
**When** the Participant double-taps (mobile) or double-clicks (desktop) it
**Then** it rotates by a fixed increment, so it can be oriented correctly before or during placement
**Given** a piece in the Canvas and the Frame with some pieces already placed
**When** the Participant drops the piece at a Frame location whose slot category (Corner/Edge/Interior) matches the piece's `PieceShape`, and its edges genuinely match any already-placed neighboring pieces
**Then** the piece snaps into place automatically, with no manual confirmation step
**And** the system never checks the piece's position against the source image — a Corner piece can be dropped into the wrong corner and stay there until its edges are tested against neighbors
**And** dropping a piece where its shape or edges do not genuinely match leaves it exactly where released — never erratically flung or lost off-canvas (NFR1)
**And** the validation runs authoritatively on the server (Server Action, using the precomputed `PieceAdjacency` graph) — a client can optimistically predict the result but never determines it alone (NFR6)
**And** the updated Frame state is visible to every Participant present with no perceptible delay

### Story 3.6: Placement feedback

As a Participant who just placed a piece,
I want an immediately satisfying visual and sound response,
So that contributing feels rewarding in the moment.

**Acceptance Criteria:**

**Given** a successful piece placement (Story 3.5)
**When** the piece snaps into the Frame
**Then** a micro-animation and a wood-click sound play, paired with a haptic tick on mobile
**And** the sound can be muted/unmuted independently by each Participant, via a control that stays accessible at all times (not buried in a submenu) and carries an accessible name
**And** the visual feedback still occurs when sound is muted — sound is never the only signal (NFR2, accessibility floor)
**And** `prefers-reduced-motion` reduces the micro-animation to a simple state change with no motion

### Story 3.7: Celebrate a completed Frame

As a Participant in a Room,
I want the whole household to see the puzzle's completion celebrated,
So that finishing the Frame feels like a shared achievement, not just another placement.

**Acceptance Criteria:**

**Given** a Room where the number of placed pieces reaches the total piece count
**When** the last piece is placed
**Then** a distinct celebration triggers (electronic "victory" sound + dedicated animation), visibly different from ordinary placement feedback (Story 3.6)
**And** it is visible to every Participant present in the Room at that moment, not only the one who placed the last piece
**And** no additional check against the source image is performed to trigger it — reaching the total piece count is sufficient
**And** the celebration copy follows the factual-but-warm Voice and Tone (e.g. "The puzzle is finished — well done to the whole Room"), never gamification-style copy ("🏆 VICTORY! Final score: 1000/1000") (UX-DR16)

### Story 3.8: Group pieces into a Cluster

As a Participant,
I want to assemble compatible pieces together away from the Frame,
So that I can pre-build a section of the puzzle before committing it.

**Acceptance Criteria:**

**Given** two or more pieces in the Canvas
**When** the Participant brings pieces whose edges genuinely match into contact
**Then** they fuse into a single Cluster, using the same geometric-matching rule as Frame integration (Story 3.5) — never by mere visual proximity
**And** a Participant can freely bring pieces close together without fusing them (personal sorting, e.g. by color) with zero effect on game state
**And** two existing Clusters fuse into one under the same rule when their edges genuinely match

### Story 3.9: Move a Cluster as a block

As a Participant,
I want to drag an entire Cluster at once,
So that I don't have to relocate its pieces one by one.

**Acceptance Criteria:**

**Given** an existing Cluster
**When** the Participant drags any part of it
**Then** the whole Cluster moves together as a single unit
**And** releasing it at a Frame location where its shape and edges genuinely match integrates the whole Cluster automatically (same rule as Story 3.5)

### Story 3.10: Work on multiple Clusters in parallel

As a Participant among several people in the same Room,
I want to build my own Cluster while others build theirs at the same time,
So that the Room feels like a real shared table, not a turn-based tool.

**Acceptance Criteria:**

**Given** several Participants active in the same Room
**When** each starts forming or moving a different Cluster
**Then** all Clusters coexist and update independently, with no exclusive lock preventing parallel work
**And** each actively-manipulated Cluster shows the manipulating Participant's avatar chip, so concurrent Clusters stay visually distinguishable
**And** when two Participants act on the very same Cluster at once, the server resolves the conflict via optimistic concurrency: a stale write is rejected (`STALE_WRITE`), never silently overwritten, and the losing client's optimistic move visibly transitions back to the last confirmed position rather than disappearing (NFR1)

### Story 3.11: Instant client-side placement prediction

As a Participant placing or fusing a piece,
I want to know immediately and reliably whether my drop worked,
So that the Frame/Cluster feedback (Story 3.6) never has to snap into place and then bounce back once the server disagrees.

**Acceptance Criteria:**

**Given** a piece (or Cluster) dropped near a Frame slot, or brought into genuine contact with another piece/Cluster
**When** the client evaluates the drop locally, using the same pure validation logic the Server Action itself uses (`validate-placement`/`validate-fusion`/`validate-overlap`, imported verbatim by both sides — never a separately-maintained client reimplementation) against a `PieceAdjacency` graph now included in the Room's client payload
**Then** a predicted-valid drop animates directly and confidently into its final position — no optimistic snap followed by a visible bounce-back for the common case
**And** a predicted-invalid drop (shape/edges don't genuinely match, or nothing to test against yet per the corner-only bootstrap rule) visibly rests exactly at the drop point immediately, without ever snapping toward a slot it was never going to keep
**And** the server remains the sole and unconditional authority for the actual write in every case (AD-2, NFR6 unchanged) — this story only extends what the client is allowed to *know* ahead of time, never what it's allowed to *decide*
**And** on the rare occasion the client's prediction was right but a genuine concurrent write beat it to the same slot/edge server-side, the rejection is presented as an in-fiction, factual-but-warm moment (Voice and Tone, UX-DR16 — e.g. "Another Participant placed it just before you"), never a technical error message, and the piece settles at the last confirmed position rather than disappearing (NFR1)

**Note — deliberate, explicit relaxation of NFR6's data-secrecy implication:** NFR6 was written when preventing a client from ever seeing enough to reconstruct the solution was assumed to matter (anti-cheat). Revisited during this story's planning: for this product's family/collaborative context, a Participant reading the network tab to see the adjacency graph is an accepted, non-concerning outcome — a conscious product call, not an oversight. What NFR6 actually protects (the server as sole authority for every write, no client-side bypass of the real validation) is fully preserved; only the *visibility* of the previously server-only `PieceAdjacency` graph changes.

### Story 3.12: Real puzzle-piece cut shape

As a Participant,
I want each piece to actually look like a cut puzzle piece (tabs and blanks along its edges), not a plain rectangle,
So that the Room feels like a real jigsaw puzzle, not a sliding-tile grid.

**Acceptance Criteria:**

**Given** the Room's Frame is `rows × cols`
**When** any piece is rendered anywhere in the Canvas (loose, mid-drag, fused into a Cluster, or locked into the Frame)
**Then** it displays a tab/blank silhouette on each of its interior edges (a bump protruding outward or a matching notch cut inward), deterministically the same every time the Room is loaded, with every pair of orthogonally-adjacent pieces' shared edge showing complementary shapes (one's tab is the other's blank)
**And** an edge on the Frame's outer boundary (per `classifyPieceShape`'s existing Corner/Edge/Interior classification) renders flat/straight, never a tab or blank, since there is no neighbor on that side to interlock with
**And** the piece's rotation (Story 3.5) rotates its tab/blank silhouette together with its image as one rigid shape — a piece that looked correct unrotated still looks like a correctly-cut piece at 90°/180°/270°
**And** this is a purely cosmetic rendering change: FR6's placement/fusion validation (`PieceShape`, `PieceAdjacency`) is completely unchanged — a piece still locks in or fuses based on the existing grid-position/adjacency rules, never based on the new visual silhouette

**Note — scope decision (2026-09-03), confirmed with the user before this story was written:** implemented as a client-side rendering mask (Konva `clipFunc`) over the *existing* plain rectangular tiles — not a real server-side re-slice of the stored tile images. From a Participant's perspective the two approaches are visually indistinguishable; the mask approach needs no new image-manipulation library (none is installed today, e.g. no `sharp`), no Storage/schema/migration changes, and stays crisp at any zoom level since the silhouette is a vector path recomputed per render rather than a fixed-resolution bitmap. Explicitly supersedes the "future story could reslice with real tab curves" framing in Story 2.4's Dev Notes — re-slicing was the imagined approach at the time, before this trade-off was considered.

### Story 3.13: Optimistic fusion

As a Participant,
I want two pieces that genuinely touch to immediately behave as one movable Îlot,
So that fusing pieces feels as instant and confident as placing one does (Story 3.11), not a "sound now, behavior later" experience.

**Acceptance Criteria:**

**Given** a piece (or Îlot) dropped into genuine contact with another piece/Îlot, evaluated by the same client-side prediction Story 3.11 already computes (`predictFusionOutcome`)
**When** that prediction says the fusion is genuine
**Then** the involved pieces immediately render and drag together as one Îlot — no waiting for the server's confirmed `cluster_id` before they can be moved as a group
**And** if the server's own re-validation disagrees with the prediction (a genuine rare conflict), the optimistic Îlot is undone and each piece reverts to its last confirmed, independent position — never left visually merged but wrong, never disappearing
**And** once the server confirms the predicted fusion was correct, the optimistic local Îlot is replaced by the real confirmed one with no visible flicker or jump
**And** this remains purely a rendering/interaction concern — FR6/AD-2's rule that the server is the sole authority for whether a fusion is real is completely unchanged; prediction only ever anticipates, never substitutes for, server validation

**Note — scope decision (2026-09-04), confirmed with the user before this story was written:** this is the harder half of Story 3.6/3.11's own placement-feedback work, explicitly deferred at the time (`deferred-work.md`: "Fusion has no confirmed-broadcast counterpart") because it needs a genuinely different mechanism than a cosmetic pulse — the *cluster association itself* (dragging the pair as one unit) must exist locally before confirmation, not just a sound/visual acknowledgment (already shipped 2026-09-04, reusing the placement pulse). Recommended approach: a local-only "predicted fusion" override in `room-canvas.tsx` (same idiom as `pendingRestOverride`/`optimisticAnchor`), not a write to the currently-read-only `clusters` TanStack DB collection — see the story file's own Dev Notes for the full reasoning.

### Story 3.14: See the reference image while building

As a Participant,
I want to glance at the full picture the puzzle is based on,
So that I can figure out where a piece belongs, the way a physical puzzle's box lid lets me.

**Acceptance Criteria:**

**Given** any Room (library-sourced or created from an uploaded photo)
**When** a Participant presses and holds a visible button, on desktop or mobile
**Then** the puzzle's full reference image displays fullscreen for as long as the button is held, and disappears the instant it's released
**And** releasing the pointer anywhere — even after dragging off the button while still held — hides the image; there is no stuck-open state
**And** this is purely a transient, read-only view: it never blocks, delays, or otherwise interferes with the Canvas's own pan/zoom/drag state underneath

**Note — scope decision (2026-09-05), confirmed with the user before this story was written:** a Room created from an *uploaded* personal photo currently has **no accessible whole image anywhere** — only individually-sliced piece tiles exist, in the private `piece-tiles` Storage bucket (the same pre-existing gap `deferred-work.md` already flagged for Home's own thumbnail, 2026-08-17, never fixed). This story fixes it for real: a resized reference image is persisted to Storage at Room-creation time for upload-sourced Rooms (library-sourced Rooms already have a public asset via `LIBRARY_IMAGES`, nothing new needed there). A **permanent, resizable desktop drawer** was considered and explicitly deferred — press-and-hold covers the actual need on both platforms with much less UI complexity; revisit as its own story only if real usage shows the need for it.

### Story 3.15: Auto-pan the Canvas while dragging a piece near the edge

As a Participant,
I want the Canvas to keep scrolling in the direction I'm dragging a piece toward, once I get close to the edge of my screen,
So that I can move a piece anywhere on the board without ever having to drop it, re-grab it, and drag again.

**Acceptance Criteria:**

**Given** a Participant is dragging a piece or an Îlot (Cluster, Story 3.9/3.10)
**When** the pointer/finger gets within a fixed margin of any edge of the visible Canvas viewport
**Then** the Canvas pans continuously toward that edge for as long as the pointer stays within the margin, with no need to release the piece
**And** the piece/Îlot being dragged stays visually anchored under the pointer throughout — it never drifts away from or detaches from the cursor while the Canvas is auto-panning underneath it
**And** panning stops the instant the pointer moves back outside the margin, or the drag ends (drop/release), whichever happens first
**And** auto-pan never scrolls the Canvas past the same bounds manual panning already respects (`clampPosition`/`PAN_MARGIN`, Story 3.3) — it can never make part of the board permanently unreachable
**And** this works identically for a mouse drag (desktop) and a touch drag (mobile) — consistent with the rest of the Canvas's existing pointer handling

**Note — scope decision (2026-09-05), confirmed with the user before this story was written:** this only applies while an actual piece/Îlot is being dragged (`draggingKey`/`isPieceDragging`, already tracked in `room-canvas.tsx`) — dragging the empty Canvas itself to pan (Story 3.3) is already a deliberate, direct pan gesture and is explicitly out of scope here, unaffected by this story.

### Story 3.16: Highlight the frame pieces

As a Participant,
I want a way to see at a glance which pieces are frame pieces (the ones that belong on the Frame's outer border),
So that I can sort them out from the pile the way I would with a physical puzzle's edge pieces.

**Acceptance Criteria:**

**Given** a Room with any mix of loose, mid-drag, fused (Îlot), and Frame-locked pieces
**When** a Participant activates the "highlight frame pieces" toggle button
**Then** every piece that is *not* a frame piece (an "interior" piece, per the existing `PieceShapeType` grid-position classification) visually dims, while every corner/edge ("frame") piece stays at full visibility
**And** deactivating the toggle (a second press) immediately restores every piece to full visibility
**And** this is purely a client-side visual aid — it never affects placement/fusion validation, dragging, clicking, or any other interaction; a dimmed piece remains fully interactive
**And** the button's own on/off state is clearly visible at a glance (e.g., a pressed/active visual state), and a piece arriving or changing via Realtime (moved, placed, or fused by another Participant) immediately respects whatever the toggle's current state already is, with no need to re-toggle

**Note — scope decision (2026-09-05), confirmed with the user before this story was written:** interaction is a **toggle** (stays active until pressed again), not press-and-hold like Story 3.14's reference-image button — sorting out every frame piece from a pile is a task that takes real time, unlike a quick glance at the source image. The toggle's state is deliberately **not persisted** (resets to off on reload) — a transient work aid, not a durable preference like sound-mute; revisit only if real usage shows a need to persist it.

### Story 3.17: Update the first-access tutorial for the new Canvas features

As a first-time Guest,
I want the onboarding tutorial to mention the Canvas buttons that were added after it was originally written,
So that I discover the reference-image view and the frame-piece highlight the same way I discover moving, rotating, and fusing a piece.

**Acceptance Criteria:**

**Given** the first-access tutorial (Story 3.2), which already teaches moving, rotating, placing into the Frame, and fusing into an Îlot
**When** a new Guest sees it for the first time in a Room
**Then** it also includes a step introducing the reference-image button (Story 3.14, press-and-hold to see the full picture) and a step introducing the "highlight frame pieces" toggle (Story 3.16)
**And** every other existing behavior of the tutorial (first-visit-per-Room-per-session gating, every dismissal path, Guest-only visibility) is completely unchanged — this story only adds content, it never touches the mechanism

**Note — scope decision (2026-09-05), confirmed with the user before this story was written:** Story 3.15 (auto-pan while dragging near an edge) deliberately gets **no** new tutorial step — it's a passive behavior that happens automatically during the gesture the tutorial already teaches (moving a piece), not a new button or a gesture a Guest has to learn; adding a step for it would teach nothing actionable. Revisit only if real usage shows Participants aren't discovering it on their own.

### Story 3.18: Split single-finger vs two-finger navigation on mobile

As a Participant on a touch device,
I want a single finger to only ever move a piece (or do nothing, on empty space) and two fingers to be the only way to pan/zoom the Canvas,
So that a one-finger slide never ambiguously moves the Canvas *or* a piece depending on exactly where my finger happened to land.

**Acceptance Criteria:**

**Given** a Participant on a touch device
**When** a single finger touches and drags a piece
**Then** that piece moves, exactly as today — this story changes nothing about piece-dragging itself
**And** when a single finger touches and drags empty Canvas space (not a piece), nothing happens — the Canvas itself no longer pans from a one-finger touch gesture
**And** when two fingers touch the Canvas anywhere (over a piece or empty space) and pinch/pan, the Canvas pans and/or zooms exactly as today (Story 3.3's existing pinch-to-zoom, which already supports a combined pan+zoom gesture, not just pure pinching)
**And** this change is touch-only — desktop mouse/trackpad panning (a single mouse-drag on empty Canvas space) is completely unaffected

**Note — scope decision (2026-09-06), confirmed with the user before this story was written:** amends Story 3.3's own original mobile gesture spec (UX-DR15: "one-finger pan, pinch-zoom"), based on real usage — a one-finger slide being ambiguous between "move the Canvas" and "move a piece" (depending on whether the finger happened to land exactly on a piece) was reported as confusing, not a deliberate trade-off worth keeping. Adopts the touch model used by Procreate/Figma mobile/Concepts: one finger is exclusively for direct manipulation (a piece), two fingers exclusively for camera navigation (pan/zoom). The "or select" possibility for a one-finger touch on empty space (mentioned by the user) is explicitly deferred — this app has no selection concept today; revisit only if one gets added later.

## Epic 4: Presence, History & Guest Conversion

**FRs covered:** FR10, FR11, FR12, FR13 · **NFR5** (sync consistency) · **UX-DR:** Presence dot/avatar, `key-statistiques.html` (History), aria-live events

### Story 4.1: Live presence

As a Participant in a Room,
I want to see who else is currently active,
So that the Room feels like a shared, lived-in space rather than a static document.

**Acceptance Criteria:**

**Given** a Room with several Participants who have interacted recently
**When** any of them has had activity within the last 30 seconds
**Then** they appear in the live presence list/avatars overlay
**And** a Participant with no activity for more than 30 seconds disappears from the list
**And** presence updates are announced via an `aria-live="polite"` region for screen-reader users, decoupled from Canvas manipulation
**And** presence is carried by the same synchronization channel as the rest of the Room's shared state — no separate real-time channel is introduced (NFR5)

### Story 4.2: Contributor history

As a Participant,
I want to browse who has contributed to the Room and when,
So that I can see the Room's story, not just its current state.

**Acceptance Criteria:**

**Given** a Room with prior contributions
**When** the Participant opens the contributor history (from the Room or from Statistics)
**Then** a chronological list of contribution events is shown, accessible from both entry points without a dedicated separate screen
**And** the list updates as new contributions happen, without requiring a manual refresh

### Story 4.3: Sign-up prompt on exit

As a Guest about to leave a Room,
I want to be offered a way to keep my progress,
So that my contribution isn't lost the moment I close the tab.

**Acceptance Criteria:**

**Given** a Guest who has contributed during the current session
**When** they take an explicit exit action (a "leave" button)
**Then** a prompt offers to sign up or sign in before leaving, dismissible without pressure
**And** the same prompt fires on a best-effort basis on tab/app close where the platform allows it, with no reliability guarantee in that case
**And** if the Guest signs up from this prompt, every contribution made during the current session is retroactively attached to the new account — the contribution counter does not reset to zero
**And** if the Guest declines or the prompt cannot fire, their contribution remains in the shared Room but is no longer traceable to a personal account afterward

### Story 4.4: Returning Participant keeps their progress

As a registered Participant,
I want to leave a Room and come back later,
So that my progress and stats are exactly where I left them.

**Acceptance Criteria:**

**Given** a registered Participant who previously contributed to a Room
**When** they return to that Room in a later session (same day or afterward)
**Then** their prior progress and stats are intact and reflected immediately
**And** this holds whether they return via the Room's link or by selecting it from Home

## Epic 5: Valorizing Stats

**FRs covered:** FR15, FR16, FR21 · **NFR3** (non-hierarchical ethos) · **UX-DR:** Avatar de Participant, Ligne de classement, Sélecteur de tri

### Story 5.1: Track per-Participant stats

As a registered Participant,
I want my contributions to be counted over the Room's whole lifetime,
So that my involvement is recognized even across many separate sessions.

**Acceptance Criteria:**

**Given** a registered Participant contributing to a Room
**When** they place a piece, form a Cluster, or spend time in the Room
**Then** the system accumulates: pieces placed, Clusters created, time spent, and consecutive days of contribution (streak) — cumulative since the Room was created, never reset between sessions
**And** contributions retroactively attached from a Guest session (Epic 4, Story 4.3) count toward these same totals

### Story 5.2: Shared stat visibility

As a Participant in a Room,
I want to see everyone's stats, not just my own,
So that the household's collective effort is visible, not hidden.

**Acceptance Criteria:**

**Given** a Room with at least one registered Participant who has contributed
**When** any Participant opens Statistics
**Then** every registered Participant's stats are visible, not only the viewer's own
**And** a Room with no contributions yet shows a short empty-state message rather than a blank table
**And** stat labels use factual, non-gamified microcopy (e.g. "12 pieces placed today"), never aggressive gamification language (scores, levels, flashy badges) (UX-DR16)

### Story 5.3: Configurable stats sorting

As a Participant viewing Statistics,
I want to choose which criterion sorts the list,
So that I can see what matters to me — without a single imposed score defining who's "best."

**Acceptance Criteria:**

**Given** the Statistics view with stats from multiple Participants
**When** the Participant picks a sort criterion (pieces placed, Clusters created, time spent, or streak)
**Then** the list re-sorts instantly with no page reload
**And** no default ranking, badge, or single combined score is imposed on the view before a criterion is chosen — the display stays a flexible lookup tool, never a hierarchy pushed onto every viewer (NFR3)
