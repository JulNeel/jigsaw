---
id: SPEC-jigsaw
companions:
  - glossary.md
  - ../planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/DESIGN.md
  - ../planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md
  - ../planning-artifacts/architecture/architecture-jigsaw-2026-07-30/ARCHITECTURE-SPINE.md
sources:
  - ../planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md
  - ../planning-artifacts/briefs/brief-jigsaw-2026-07-16/brief.md
  - ../planning-artifacts/briefs/brief-jigsaw-2026-07-16/addendum.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only.

# Jigsaw — Mode Salon V1

## Why

Recréer, dans un espace numérique partagé, la dynamique du puzzle physique laissé ouvert sur la table du salon familial : un objet persistant que n'importe quel membre du foyer peut rejoindre ou quitter librement, sans planification ni session synchronisée. Aucun produit du marché ne recrée ce rituel ambiant et drop-in/drop-out — les concurrents sont solo/session-based (Magic Jigsaw, Jigsaw Puzzles Epic) ou multijoueur synchrone (Puzzle Together, Jigidi). Pour un développeur solo, l'enjeu de la V1 n'est pas de monétiser mais de valider, avec de vraies familles, que cette reconstitution numérique tient réellement.

## Capabilities

- **CAP-1** — Navigation dans l'espace infini
  - **intent:** Le Participant navigue librement (pan/zoom) dans l'espace infini et recentre la vue sur le Cadre en un geste, depuis n'importe quelle position.
  - **success:** Le bouton recentrer ramène la vue sur le Cadre quels que soient le pan/zoom courants.

- **CAP-2** — Regroupement libre en Îlots
  - **intent:** Le Participant peut assembler des pièces compatibles en Îlot, ou les rapprocher librement sans les fusionner (rangement personnel), sans les positionner dans le Cadre.
  - **success:** La fusion en Îlot (pièce↔pièce, Îlot↔Îlot) ne se déclenche que si les découpes correspondent réellement — jamais par simple proximité visuelle.

- **CAP-3** — Assemblage du Cadre par validation géométrique
  - **intent:** Une pièce ou un Îlot s'intègre automatiquement au Cadre dès que sa forme élémentaire correspond à l'emplacement visé et que ses bords correspondent réellement aux pièces déjà posées — sans jamais vérifier contre l'image source. Le Cadre complet est détecté et célébré comme un événement distinct.
  - **success:** L'intégration est observable sans confirmation manuelle ; l'événement "Cadre complet" se déclenche uniquement quand le nombre de pièces posées atteint le total, sans second contrôle contre l'image.

- **CAP-4** — Accès Invité sans friction
  - **intent:** Quiconque possède le lien du Salon contribue en tant qu'Invité sans créer de compte, guidé par un tutoriel au premier accès, et peut s'inscrire avant de partir pour conserver sa progression.
  - **success:** Un Invité place une pièce sans étape d'inscription préalable ; s'inscrire avant de quitter rattache rétroactivement les contributions de la session à son compte.

- **CAP-5** — Présence en direct et historique des contributeurs
  - **intent:** Les Participants voient qui est actuellement en ligne dans le Salon et peuvent consulter l'historique des contributions.
  - **success:** La présence reflète l'activité des dernières 30 secondes ; l'historique est consultable depuis le Salon et les Statistiques.

- **CAP-6** — Statistiques valorisantes configurables
  - **intent:** Chaque Participant inscrit accumule des statistiques (pièces posées, Îlots créés, temps passé, streak) sur la durée de vie du Salon, visibles par tous et triables selon un critère choisi par celui qui regarde.
  - **success:** Changer le critère de tri réordonne l'affichage instantanément ; aucun rang ou score unique n'est imposé par défaut à tous.

- **CAP-7** — Création de Salon
  - **intent:** Un Participant inscrit crée un Salon en choisissant une image (bibliothèque fournie ou photo personnelle) et un nombre de pièces, puis obtient un lien d'invitation public généré automatiquement.
  - **success:** Le lien généré permet à un Invité de rejoindre et contribuer immédiatement, sans étape intermédiaire.

## Constraints

- V1 est strictement collaboratif : aucune propriété/restriction par créateur sur un Îlot — n'importe quel Participant peut le manipuler et l'intégrer au Cadre.
- Accès au Salon uniquement via lien public généré à la création ; pas d'invitation nominative en V1.
- Web (PWA) et mobile (wrapper) livrés simultanément dès la V1, sur un backend découplé du frontend, permettant une réécriture native future sans perdre l'état partagé — détail technique dans le companion architecture.
- Identité visuelle épurée et moderne : la chaleur passe uniquement par la couleur (neutres chauds), aucune texture ni thème décoratif en V1.

## Non-goals

- Mode Battle (compétitif, power-ups) et mode Time-out — différés à une version ultérieure.
- Monétisation sous toute forme en V1.
- Génération d'images par IA — risque IP/légal non résolu (reproduction possible de personnages sous licence).
- Scoring de difficulté assisté par IA.
- Personnalisation visuelle du Salon (thèmes, fonds d'écran) en V1.

## Success signal

De vraies familles adoptent le rituel : des Salons actifs enregistrent des jours consécutifs de contribution (streak), une part mesurable des Invités revient contribuer après leur première session, et plusieurs participants distincts par foyer contribuent au même Salon dans la durée. Contre-métrique : le temps passé par session n'est pas un signal à optimiser isolément — le produit vise une contribution ponctuelle et satisfaisante, pas une rétention captive.

## Assumptions

- Le seuil de proximité qui déclenche la vérification d'adjacence entre deux pièces (CAP-3) est délégué à l'implémentation, non fixé par le PRD ni l'architecture.
- La maturité encore jeune des dépendances de synchronisation (TanStack DB pré-1.0, ElectricSQL) est acceptée comme risque pour la vitesse d'itération solo-dev ; aucun plan de repli écrit.

## Open Questions

- Cibles quantitatives du Success signal (seuil de streak, taux de retour visé) — à définir après les premiers tests familiaux.
- Contraintes de modération sur les photos importées pour créer un Salon (CAP-7) — non traitées.
- Cohérence entre la résolution de l'image choisie et le nombre de pièces demandé (CAP-7) — que se passe-t-il si l'image est trop petite ?
- Séparation des projets Supabase dev/prod (projet séparé vs schéma isolé) — arbitrage coût/complexité non tranché.
