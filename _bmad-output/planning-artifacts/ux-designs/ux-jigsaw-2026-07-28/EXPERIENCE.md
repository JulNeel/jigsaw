---
name: Jigsaw
status: final
created: 2026-07-28
updated: 2026-07-30
sources:
  - _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-jigsaw-2026-07-16/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-jigsaw-2026-07-16/addendum.md
---

# Jigsaw — Experience Spine

## Foundation

Web responsive (PWA) avec wrapper mobile (ex. Capacitor) pour la présence sur les stores — un seul codebase React, shadcn/ui sur Next.js + Tailwind (cf. PRD §7). `DESIGN.md` est la référence visuelle ; cette spine couvre le comportement. Un Participant inscrit peut appartenir à plusieurs Salons ; chaque Salon est un espace autonome (progression, présence, statistiques propres à ce Salon).

## Information Architecture

| Surface | Atteinte depuis | Objectif |
|---|---|---|
| Accueil (connecté) | Ouverture de l'app, authentifié | Liste des Salons persistée du Participant inscrit (FR-11) + bouton "Créer un salon" |
| Connexion / Inscription | Accueil, ou proposition à la sortie d'un Salon (FR-10) | Authentification |
| Création de Salon | Bouton "Créer un salon" | Choix image (bibliothèque/upload), nombre de pièces, génération du lien d'invitation (FR-17 à FR-20) |
| Salon (Espace infini + Cadre) | Lien d'invitation (FR-8), ou sélection depuis Accueil | Le cœur du produit — canvas collaboratif, Cadre (FR-3), Îlots |
| Tutoriel (modale) | Premier accès d'un Invité non connecté | Explique les gestes de base (FR-9) |
| Partage du Salon | Bouton "Inviter" depuis le Salon | Affiche/copie le lien public (FR-20) |
| Statistiques du Salon | Bouton "Statistiques" depuis le Salon | Stats par Participant, tri configurable (FR-15, FR-16, FR-21) |

*Connexion/Inscription* est la seule surface encore "spine-only" : son comportement est entièrement décrit ci-dessous (Component/State Patterns) sans dramatisation dans un Key Flow dédié — usage ponctuel, sans enjeu narratif propre, contrairement à UJ-1/UJ-2.

→ Référence de composition : `mockups/key-salon.html` (Salon), `mockups/key-tutorial-modal.html` (Tutoriel), `mockups/key-creation-salon.html` (Création + Partage, deux états), `mockups/key-accueil.html` (Accueil, deux états), `mockups/key-statistiques.html` (Statistiques). Les spines gagnent en cas de conflit avec les maquettes.

## Voice and Tone

Microcopy. La voix et la posture esthétique vivent dans `DESIGN.md`.

| Do | Don't |
|---|---|
| "12 pièces posées aujourd'hui" | "🎉 Félicitations, vous avez explosé votre score !" |
| "Mickaela vient de rejoindre le Salon" | "Un nouveau joueur est entré dans la partie" |
| "Connectez-vous pour garder votre progression" | "Créez un compte pour débloquer plus de fonctionnalités !" |
| "Le Salon de la famille Dupont" | "Votre session de jeu" |
| "Le puzzle est terminé — bravo à tout le Salon" | "🏆 VICTOIRE ! Score final : 1000/1000" |
| Ton chaleureux mais factuel — célèbre la contribution sans grandiloquence | Vocabulaire de gamification agressif (scores, niveaux, badges tape-à-l'œil) |

`[ASSUMPTION: ton inféré de l'esprit "valorisant, non hiérarchisant" du PRD (§4.5) — à ajuster si un ton plus ludique est souhaité.]`

## Component Patterns

Comportemental. Les spécifications visuelles vivent dans `DESIGN.md.Components`.

| Composant | Usage | Règles comportementales |
|---|---|---|
| Pièce de puzzle | Espace infini, Cadre | Drag pour déplacer ; rotation via un geste dédié (cf. Interaction Primitives). Peut être rapprochée librement d'une autre pièce sans jamais s'accrocher (cf. Interaction Primitives → Rangement libre). Fusion en Îlot et intégration au Cadre suivent la même règle de correspondance réelle des découpes (cf. State Patterns → Intégration au Cadre). |
| Îlot | Espace infini | Se déplace comme un seul bloc (FR-5). Formation et fusion (y compris Îlot-Îlot) suivent la même règle que l'intégration au Cadre (cf. State Patterns → Intégration au Cadre). Relâché à un emplacement du Cadre compatible avec sa forme → intégration automatique (FR-6), sans confirmation. Accès concurrent : plusieurs Participants peuvent agir simultanément sur le même Îlot, sans verrouillage ; résolution des conflits déléguée à l'architecture. |
| Bouton recentrer | Espace infini (flottant) | Toujours visible ; un tap ramène la vue sur le Cadre quel que soit le pan/zoom courant (FR-2). |
| Présence en direct | Espace infini (superposition) | Liste/avatars des Participants actuellement en ligne (FR-12) ; disparaît après 30s d'inactivité (cf. PRD FR-12). Le point individuel (`{colors.accent}`) est l'atome visuel — cf. DESIGN.md "Point de présence". |
| Modale tutoriel | Premier accès Invité | Non bloquante après le premier passage ; réapparaît seulement si l'Invité redemande de l'aide. Construite sur shadcn `Dialog`/Radix : piège de focus, fermeture `Échap`, `role="dialog"`/`aria-modal` hérités par défaut ; focus initial sur le premier élément actionnable, titre de dialogue accessible explicite. |
| Sélecteur de tri (stats) | Vue Statistiques | `Select` shadcn ; change instantanément le critère affiché (pièces posées, Îlots créés, temps passé, streak) sans recharger la vue (FR-21). |
| Ligne de classement | Vue Statistiques | Une ligne par Participant (spec visuelle : DESIGN.md `stats-leaderboard-row`) ; se réordonne quand le critère de tri change (FR-21), sans re-render de la page entière ; pas d'interaction au clic (affichage seul). |
| Historique des contributeurs | Salon, Vue Statistiques | Liste chronologique ou par Participant de qui a contribué au Salon (FR-13) ; accessible depuis le Salon et depuis la vue Statistiques, sans écran dédié séparé. Spec visuelle : DESIGN.md `contributor-history-row`. |

## State Patterns

| État | Surface | Traitement |
|---|---|---|
| Invité, premier accès | Salon | Modale tutoriel affichée automatiquement (FR-9). |
| Invité, accès suivant (même session) | Salon | Pas de re-tutoriel ; accès direct au canvas. |
| Salon vide (aucune pièce posée) | Salon | Cadre affiche l'image cible en filigrane léger, aucune pièce encore placée. `[ASSUMPTION: traitement visuel du Cadre vide non spécifié.]` |
| Pièce/Îlot en cours de déplacement | Espace infini | Halo + ombre portée (cf. DESIGN.md Elevation) ; suit le curseur/doigt sans latence perceptible. |
| Intégration au Cadre (pièce ou Îlot) | Salon | Micro-animation + son bois + vibration mobile ; son désactivable (FR-14). Validation géométrique stricte : la pièce/l'Îlot ne s'intègre que si sa forme correspond à l'emplacement visé et que ses bords adjacents correspondent réellement aux pièces déjà posées — aucune vérification contre l'image source, aucun "bon" ou "mauvais" coin signalé à l'avance. **Règle canonique** : ce même mécanisme de correspondance réelle des découpes gouverne aussi la formation d'un Îlot et la fusion Îlot-Îlot — un seul principe, appliqué partout où deux pièces/Îlots se touchent. |
| Cadre complet | Salon | Événement distinct, déclenché uniquement quand le nombre de pièces posées atteint le total du puzzle (pas de second contrôle contre l'image — l'unicité des découpes garantit la solution correcte). Célébration plus marquée que le retour de placement habituel : son électronique "victoire" (cf. DESIGN.md/PRD §6), animation dédiée, visible par tous les Participants présents. |
| Sortie sans compte | Salon → quitter | Proposition de connexion/inscription (FR-10) ; si ignorée, la contribution reste anonyme dans le Salon partagé. |
| Hors-ligne / perte de connexion | Global | Toast shadcn : "Connexion perdue. Vos pièces posées sont sauvegardées, la synchronisation reprendra automatiquement." Les actions locales ne sont pas bloquées en attendant la reconnexion. `[ASSUMPTION: comportement offline non spécifié dans le PRD — traitement minimal proposé, à valider en architecture.]` |
| Îlots multiples en parallèle | Espace infini | Plusieurs Îlots peuvent être en cours de constitution simultanément par différents Participants (FR-7) ; chaque Îlot affiche son contour (`{components.ilot-outline}`) uniquement pendant sa propre manipulation active. Le contour seul ne suffit pas à distinguer deux Îlots actifs simultanément : le chip avatar/initiale (DESIGN.md.Components, "Îlot") assure la désambiguïsation entre Participants. |
| Accueil, premier accès (aucun Salon) | Accueil | Un nouveau Participant inscrit sans Salon voit un état vide : message court + bouton "Créer un salon" mis en avant. `[ASSUMPTION: copie exacte non spécifiée.]` |
| Accueil, chargement | Accueil | shadcn `Skeleton` (lignes de Salon) pendant le chargement de la liste. |
| Connexion/Inscription, erreur | Connexion / Inscription | Message d'erreur inline sous le champ concerné (identifiants invalides, email déjà utilisé) ; pas de redirection ni de perte de la saisie déjà faite. |
| Création de Salon, erreur d'upload | Création de Salon | Message d'erreur inline si l'import de photo échoue (format, taille) ; l'utilisateur reste sur l'écran de création, rien n'est perdu. |
| Création de Salon, image trop petite pour le découpage demandé | Création de Salon | `[ASSUMPTION: comportement non spécifié — PRD §11 Q3 le liste explicitement comme non résolu. Provisoire : avertissement bloquant proposant de réduire le nombre de pièces ou choisir une autre image, à valider en architecture.]` |
| Partage du Salon, confirmation de copie | Partage du Salon | Toast shadcn bref ("Lien copié") après clic sur le bouton de copie ; pas de changement d'écran. |
| Statistiques, chargement / vide | Statistiques du Salon | shadcn `Skeleton` pendant le chargement ; si aucun Participant n'a encore contribué, message court plutôt qu'un tableau vide. |

## Interaction Primitives

- **Pan / zoom** de l'Espace infini (FR-1) — glisser pour déplacer la vue, pincer (tactile) ou molette (desktop) pour zoomer.
- **Drag** — glisser une pièce ou un Îlot ; relâcher pour poser.
- **Rotation d'une pièce** — double-tap (mobile) ou double-clic (desktop) pour pivoter par incréments fixes. `[ASSUMPTION: geste de rotation non spécifié par l'utilisateur — à confirmer, notamment sa cohérence tactile vs souris.]`
- **Rangement libre** — rapprocher des pièces dans l'espace infini sans qu'elles s'accrochent (ex. trier par couleur/motif) ; toujours possible, aucune validation.
- **Fusion en Îlot** — relâcher une pièce/Îlot à proximité d'une autre déclenche la fusion (FR-4) selon la règle de correspondance réelle des découpes (cf. State Patterns → Intégration au Cadre) ; sinon, reste un simple rangement libre.
- **Recentrage** — tap sur le bouton recentrer (pas de geste clavier requis).

**Banni :** aucune perte de position au relâchement accidentel (pas de "pièce qui gicle", cf. NFR-1 du PRD) ; aucune pièce qui reste bloquée hors-champ en bord d'Espace infini.

## Accessibility Floor

Comportemental. Le contraste visuel vit dans `DESIGN.md`.

- Contraste WCAG 2.2 AA sur toute la chrome UI (boutons, texte, badges) — ratios recalculés et documentés par paire dans DESIGN.md §Colors (revue de validation du 2026-07-28), indépendamment de l'image du puzzle affichée en fond.
- Le retour de placement (FR-14) est toujours doublé d'un signal visuel — jamais uniquement sonore ou uniquement vibratoire — pour rester perceptible en cas de son coupé ou de déficience auditive.
- `prefers-reduced-motion` respecté : la micro-animation de snap est réduite à un simple changement d'état sans mouvement pour les utilisateurs qui le demandent.
- Le contrôle mute (FR-14) est accessible en permanence depuis le Salon, pas enfoui dans un sous-menu.
- Focus visible (`ring` surchargé, cf. DESIGN.md, vérifié ≈5:1 sur `background`/`card`) sur tous les éléments interactifs hors canvas (boutons, modales, sélecteurs).
- Tout contrôle à icône seule (bouton recentrer, mute, inviter) porte un nom accessible (`aria-label` ou équivalent) — testable via une règle automatisée type axe `button-name`.
- Taille de cible minimale de 24×24px CSS pour tout contrôle de chrome hors-canvas (recentrer, mute, inviter, sélecteur de tri) — WCAG 2.2 SC 2.5.8. Les zones de prise des pièces/Îlots sur le canvas peuvent invoquer l'exception "essentiel" du critère, le média étant par nature manipulatoire.
- Les événements collaboratifs significatifs (pièce/Îlot intégré au Cadre, Participant qui rejoint/quitte) sont annoncés via une région `aria-live="polite"` (ou équivalent), découplée de la manipulation du canvas — un utilisateur de lecteur d'écran perçoit la vie du Salon sans pouvoir en manipuler le contenu.

`[ASSUMPTION: une alternative clavier complète au drag-and-drop du canvas n'est pas traitée ici — le puzzle est par nature un médium manipulatoire ; à revisiter en architecture si l'accessibilité motrice devient un objectif explicite au-delà de ce plancher.]`

## Responsive & Platform

| Surface | Comportement |
|---|---|
| Web desktop (`≥ lg`) | Espace infini plein écran ; bouton recentrer et présence en overlay coin haut/bas. Souris/trackpad pour pan-zoom-drag. |
| Web mobile / app wrapper (`< md`) | Même canvas, gestes tactiles (pan à un doigt, pincer-zoom, tap pour interagir) ; modale tutoriel adaptée plein écran. |
| Toutes tailles | Statistiques et création de Salon en colonne unique, jamais de layout multi-colonnes forcé (cf. DESIGN.md Layout & Spacing). |

## Inspiration & Anti-patterns

- **Rejeté — publicités entre ou pendant les puzzles :** reproche documenté contre les incumbents (brief, §The Problem) ; Jigsaw n'a aucune publicité en V1 (cf. PRD §8 Non-Goals).
- **Rejeté — upsell d'abonnement sans bouton de fermeture visible :** même source ; toute proposition de connexion/inscription (FR-10) reste dismissable sans pression.
- **Rejeté — interface "datée" façon incumbents :** shadcn/ui + palette de neutres chauds comme réponse directe au reproche "trapped in iOS 6".
- **Rejeté — son de clic/snap non désiré et non désactivable :** reproche documenté contre les incumbents (addendum du brief) ; le son de placement (FR-14) est toujours activable/désactivable par le Participant.
- **Rejeté — pièces qui "giclent" ou se bloquent en bord d'écran :** traité structurellement par NFR-1 (PRD) ; aucune tolérance de régression sur ce point dans les composants Pièce/Îlot.
- **Lifté de Miro :** le canvas à pan/zoom infini comme métaphore spatiale — familière, pas besoin de la ré-expliquer au-delà du tutoriel de base.

## Key Flows

### UJ-1 — Mickaela rejoint le Salon via un lien WhatsApp

1. Mickaela tape le lien reçu par WhatsApp → ouverture directe du Salon, aucune inscription requise.
2. Elle atterrit sur l'Espace infini : le Cadre du puzzle (quelques pièces déjà posées par Noé), la présence des Participants en ligne, l'historique des contributeurs.
3. Modale tutoriel (premier accès) : déplacer, pivoter, positionner dans le Cadre, créer un Îlot.
4. Elle attrape une pièce, la fait glisser près du Cadre.
5. **Climax :** la pièce s'intègre automatiquement au Cadre — micro-animation, son bois, léger halo terre cuite, vibration si mobile. Elle voit sa contribution rejoindre le puzzle collectif sous les yeux des Participants en ligne.
6. Avant de quitter, proposition de connexion/inscription pour conserver sa progression. Si elle accepte, ses contributions de la session sont rattachées à son nouveau compte (FR-15 Consequences) et elle retrouvera son état plus tard dans la journée.

**Échec :** si elle ignore la proposition et quitte sans s'inscrire, sa contribution reste dans le Salon partagé (cf. "Sortie sans compte", State Patterns) mais elle perd le lien vers ses statistiques personnelles.

### UJ-2 — Noé crée un nouveau Salon

1. Noé, connecté, arrive sur l'Accueil et tape "Créer un salon".
2. Écran de création : choix d'une image (bibliothèque fournie ou photo personnelle), choix du nombre de pièces.
3. Configuration validée → le système génère le lien d'invitation public.
4. **Climax :** le lien apparaît, prêt à copier/partager — Noé le transmet immédiatement via WhatsApp, sans étape intermédiaire.
5. Le Salon existe désormais et attend ses premiers Participants — dont Mickaela (UJ-1).
