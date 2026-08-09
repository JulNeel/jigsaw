---
title: Jigsaw
status: final
created: 2026-07-21
updated: 2026-07-29
---

# PRD: Jigsaw
*Working title — confirm.*

## 0. Document Purpose

Ce PRD s'adresse à Julien, développeur solo, comme référence de conception pour l'implémentation du mode Salon de Jigsaw et comme base pour les travaux en aval (UX, architecture, epics/stories). Il s'appuie sur le [Product Brief — Jigsaw](../../briefs/brief-jigsaw-2026-07-16/brief.md) et son addendum, qui restent la référence pour le contexte marché et les modes différés (Battle, Time-out). Le document est structuré autour d'un glossaire de vocabulaire fixe, de parcours utilisateurs nommés, et de fonctionnalités regroupées avec exigences fonctionnelles (FR) numérotées globalement. Les hypothèses sont marquées `[ASSUMPTION]` inline et indexées en fin de document.

## 1. Vision

Jigsaw recrée, dans un espace numérique partagé, la dynamique du puzzle physique laissé ouvert sur la table du salon familial : un objet persistant que n'importe quel membre de la famille peut rejoindre ou quitter librement, sans planification ni session synchronisée.

La V1 se concentre entièrement sur le mode **Salon** : un espace de collaboration infini où le puzzle prend forme progressivement, pièce par pièce ou par regroupements successifs, porté par une mécanique fluide et un accès sans friction — n'importe qui disposant du lien peut contribuer immédiatement, sans compte.

L'ambition n'est pas de couvrir tous les modes de jeu ni de monétiser dès cette version, mais de valider, avec de vraies familles, que cette reconstitution numérique du rituel du puzzle physique tient réellement.

## 2. Target User

### 2.1 Jobs To Be Done

- En tant que membre d'une famille, je veux pouvoir contribuer à un puzzle commun quand j'ai un moment, sans devoir coordonner un horaire avec les autres.
- En tant que personne invitée par un proche, je veux pouvoir essayer immédiatement sans créer de compte, pour voir si ça me plaît avant de m'engager.
- En tant que participant régulier, je veux que ma contribution soit visible et valorisée (pièces posées, présence), sans que ce soit compétitif.
- En tant que créateur d'un Salon, je veux pouvoir inviter facilement mes proches via un canal qu'ils utilisent déjà (WhatsApp).

### 2.2 Key User Journeys

- **UJ-1. Mickaela rejoint le Salon via un lien WhatsApp.**
  - **Persona + contexte :** Mickaela reçoit un message WhatsApp de son neveu, qui vient de créer un puzzle Salon et l'invite à y participer via un lien.
  - **État d'entrée :** non authentifiée, arrive en tant qu'Invitée, depuis WhatsApp (mobile probable).
  - **Parcours :** Elle tape le lien → entre directement dans le Salon sans inscription → découvre l'espace infini avec le Cadre du puzzle (quelques pièces déjà posées par le neveu), la présence des Participants en ligne et l'historique des contributeurs → une modale de tutoriel rapide lui explique les gestes de base (déplacer, pivoter, positionner dans le Cadre, créer un Îlot) → elle place une ou plusieurs pièces / crée un Îlot.
  - **Climax :** le placement d'une pièce ou d'un Îlot déclenche un retour sonore/visuel volontairement très satisfaisant — c'est le moment où elle sent qu'elle contribue vraiment.
  - **Résolution :** avant de quitter, l'app lui propose de s'inscrire/se connecter pour conserver sa progression. Si elle le fait, elle pourra revenir plus tard dans la journée et retrouver son état.
  - **Edge case :** si elle repart sans s'inscrire, sa contribution de la session reste dans le puzzle partagé mais elle perd le lien vers "ses" stats personnelles.

- **UJ-2. Noé crée un nouveau Salon.**
  - **Persona + contexte :** Noé veut lancer un nouveau puzzle collaboratif pour sa famille.
  - **État d'entrée :** authentifié (Participant inscrit), depuis l'app.
  - **Parcours :** Il appuie sur "Créer un salon" → choisit une image (bibliothèque fournie ou photo personnelle importée) → choisit le nombre de pièces → le système génère un lien d'invitation public.
  - **Climax :** le lien d'invitation est généré et prêt à être envoyé — Noé peut le transmettre immédiatement via WhatsApp.
  - **Résolution :** il partage le lien ; réalise l'état d'entrée d'UJ-1 pour les invités suivants (comme Mickaela).

## 3. Glossary

- **Salon** — L'espace de puzzle collaboratif persistant, unique par groupe/famille.
- **Cadre** — La zone dédiée dans l'espace infini où le puzzle final prend forme (positionnement définitif des pièces).
- **Espace infini** — Le canvas façon Miro autour du Cadre, où les pièces et Îlots peuvent être déplacés librement avant intégration.
- **Îlot** — Un regroupement de pièces assemblées entre elles mais pas encore intégrées au Cadre.
- **Invité** — Participant non authentifié, accès via lien, contribue sans compte.
- **Participant** — Toute personne ayant contribué au Salon (Invité ou Participant inscrit).
- **Participant inscrit** — Participant ayant créé un compte et étant connecté ; ses statistiques et sa progression persistent dans le temps, et il peut créer un Salon (un Invité ne le peut pas).
- **Forme élémentaire** — Catégorie géométrique d'une pièce selon ses bords droits : coin (deux bords droits perpendiculaires), bord (un bord droit), intérieur (aucun bord droit). Détermine les emplacements du Cadre où une pièce peut être posée, indépendamment de sa position "correcte" selon l'image finale.

## 4. Features

### 4.1 Espace infini et Cadre
**Description :** Le Salon se déploie dans un espace de navigation infini (façon Miro) centré sur le Cadre, la zone où le puzzle prend sa forme définitive. Réalise UJ-1.

#### FR-1: Navigation dans l'espace infini
Le Participant peut naviguer librement (pan/zoom) dans l'espace infini.

#### FR-2: Recentrage sur le Cadre
Le Participant peut recentrer la vue sur le Cadre en un geste, à tout moment.

**Consequences (testable):**
- Un bouton "recentrer" est visible en permanence dans l'espace infini.
- Activer le bouton ramène la vue sur le Cadre quelle que soit la position/zoom courante.

#### FR-3: Affichage de l'état du Cadre
Le Cadre affiche l'état courant du puzzle assemblé.

**Consequences (testable):**
- Toute pièce intégrée au Cadre (FR-6) y apparaît sans délai perceptible pour l'ensemble des Participants présents.

### 4.2 Assemblage libre en Îlots
**Description :** Avant l'intégration définitive au Cadre, les Participants peuvent regrouper des pièces entre elles dans l'espace infini. Réalise UJ-1.

#### FR-4: Création d'un Îlot
Le Participant peut assembler plusieurs pièces ensemble pour former un Îlot, sans les positionner dans le Cadre.

**Consequences (testable):**
- La fusion en Îlot ne se déclenche que si les découpes des pièces concernées correspondent réellement (même règle de compatibilité géométrique que l'intégration au Cadre, cf. FR-6) — un simple rapprochement visuel ne suffit pas.
- Le Participant peut librement rapprocher des pièces dans l'espace infini sans déclencher de fusion (rangement/tri personnel, par exemple par couleur) ; cette action n'a aucune conséquence sur la logique de jeu.
- Deux Îlots distincts peuvent fusionner entre eux selon la même règle, si leurs bords correspondent réellement.

#### FR-5: Déplacement d'un Îlot
Un Îlot peut être déplacé comme un seul bloc dans l'espace infini.

#### FR-6: Intégration automatique au Cadre
Une pièce ou un Îlot s'intègre automatiquement au Cadre par un effet d'aimantation dès que sa forme élémentaire correspond à un emplacement disponible de cette catégorie, et que ses bords adjacents à des pièces déjà posées correspondent réellement.

**Consequences (testable):**
- Aucune action de validation manuelle n'est requise pour l'intégration.
- Le système ne vérifie jamais la position d'une pièce contre l'image source — seule la compatibilité géométrique avec l'emplacement (forme élémentaire) et les pièces voisines déjà posées est vérifiée. Une pièce-coin peut donc être posée dans un coin qui n'est pas le sien, et la correction ne se révèle qu'à l'assemblage des bords.
- `[ASSUMPTION: le seuil de proximité qui déclenche la vérification de compatibilité entre deux pièces (à quelle distance elles sont considérées "adjacentes") est un paramètre de conception/implémentation à définir en aval de ce PRD.]`

#### FR-7: Îlots multiples et parallèles
Plusieurs Îlots peuvent coexister simultanément, travaillés en parallèle par différents Participants.

**Consequences (testable):**
- Plusieurs Participants peuvent agir simultanément sur le même Îlot, sans verrouillage exclusif ; la résolution des conflits d'édition concurrente est déléguée à l'architecture technique.

#### FR-22: Détection du Cadre complet
Le système détecte que le Cadre est complet lorsque le nombre de pièces posées atteint le nombre total de pièces du puzzle, et déclenche une célébration distincte du retour de placement habituel (FR-14).

**Consequences (testable):**
- Aucune vérification supplémentaire contre l'image source n'est effectuée pour déclencher cet événement — l'unicité des découpes garantit qu'un Cadre complet est nécessairement correctement assemblé.
- L'événement est visible par l'ensemble des Participants présents dans le Salon, pas seulement celui qui pose la dernière pièce.

### 4.3 Accès invité et authentification différée
**Description :** L'entrée dans un Salon existant se fait sans friction via un lien partagé ; l'inscription n'est requise que pour conserver sa progression. Réalise UJ-1.

#### FR-8: Accès par lien
Toute personne disposant du lien du Salon peut y accéder et contribuer en tant qu'Invité, sans création de compte.

#### FR-9: Tutoriel de première contribution
Au premier accès, un Invité non connecté voit un tutoriel rapide (modale) expliquant les gestes de base : déplacer une pièce, la pivoter, la positionner dans le Cadre, créer un Îlot.

#### FR-10: Proposition de connexion à la sortie
Avant de quitter le Salon, le système propose à l'Invité de s'inscrire/se connecter pour conserver sa progression.

**Consequences (testable):**
- La proposition se déclenche sur une action explicite de sortie (bouton "quitter"/retour). Elle se déclenche aussi en best-effort sur fermeture d'onglet/app quand la plateforme le permet, sans garantie de fiabilité dans ce cas.

#### FR-11: Persistance de la progression
Un Participant inscrit retrouve sa progression et ses statistiques lors d'une session ultérieure (même jour ou plus tard).

### 4.4 Présence et feedback de contribution
**Description :** Le Salon donne une impression de vie collective et de contribution valorisée. Réalise UJ-1.

#### FR-12: Présence en direct
Le Salon affiche les Participants actuellement en ligne.

**Consequences (testable):**
- Un Participant est considéré "en ligne" tant qu'une activité a été détectée dans les 30 dernières secondes ; passé ce délai, il disparaît de la liste des présents.

#### FR-13: Historique des contributeurs
Le Salon conserve et affiche l'historique des personnes ayant contribué.

#### FR-14: Feedback de placement
Le placement d'une pièce ou d'un Îlot déclenche un retour visuel et sonore conçu pour être fortement satisfaisant.

**Consequences (testable):**
- Le son du feedback de placement est activable/désactivable par chaque Participant, indépendamment des autres réglages.

**Feature-specific NFRs:**
- Le "feel" du placement (son + micro-animation) est un enjeu de tonalité produit central, détaillé en §6 Aesthetic & Tone.

### 4.5 Statistiques valorisantes partagées
**Description :** Chaque Participant inscrit accumule des statistiques sur toute la durée de vie du Salon, visibles par l'ensemble des Participants, pour valoriser la contribution individuelle sans instaurer de compétition frontale entre membres du foyer.

#### FR-15: Suivi des statistiques par Participant
Le système suit, pour chaque Participant inscrit, le nombre de pièces posées, le nombre d'Îlots créés, le temps passé, et le nombre de jours consécutifs de contribution (streak), cumulés sur toute la durée de vie du Salon.

**Consequences (testable):**
- Si un Invité s'inscrit avant de quitter sa session (FR-10), les contributions effectuées pendant cette session en tant qu'Invité sont rattachées rétroactivement à son nouveau compte — le compteur ne repart pas à zéro.

#### FR-16: Visibilité partagée des statistiques
Les statistiques de chaque Participant sont visibles par l'ensemble des Participants du Salon.

#### FR-21: Classement configurable des statistiques
Un Participant peut consulter les statistiques du Salon triées selon un critère de son choix, parmi : pièces posées, Îlots créés, temps passé, jours consécutifs (streak).

**Feature-specific NFRs:**
- Le classement reste un outil de consultation flexible, choisi par celui qui regarde, plutôt qu'un score unique imposé par défaut à tous — cohérent avec l'esprit valorisant plutôt que hiérarchisant du produit.

### 4.6 Création du Salon
**Description :** Point d'entrée du produit — un Salon doit être créé par un Participant inscrit avant que le parcours d'UJ-1 (rejoindre via lien) puisse exister. Réalise UJ-2.

#### FR-17: Création réservée aux Participants inscrits
Un Participant inscrit peut créer un nouveau Salon. Un Invité ne peut pas créer de Salon.

**Consequences (testable):**
- La création d'un Salon nécessite un compte et une session active — aucun accès Invité à la fonction de création.

#### FR-18: Choix de l'image du puzzle
Lors de la création, le créateur choisit l'image du puzzle soit depuis une bibliothèque fournie par l'application, soit en important une photo personnelle.

#### FR-19: Choix du nombre de pièces
Lors de la création, le créateur choisit le nombre de pièces du puzzle.

#### FR-20: Génération du lien d'invitation public
À la création du Salon, le système génère un lien d'invitation public permettant à quiconque le possède de rejoindre le Salon en tant qu'Invité (réalise FR-8).

**Out of Scope:**
- L'invitation restreinte à des personnes explicitement nommées n'est pas disponible en V1 — seul le lien public existe (cf. §8 Non-Goals).

## 5. Cross-Cutting NFRs

- **NFR-1 (stabilité du déplacement)** : Le déplacement d'une pièce ou d'un Îlot dans l'espace infini reste stable et prévisible en toute circonstance — pas de dépassement erratique de la position pointée, pas de blocage ni de perte de pièce en bord d'espace infini. Réponse directe aux défauts documentés des applications concurrentes (pièces qui "giclent" à travers l'écran, blocages en bord d'écran — cf. brief, §The Problem).

## 6. Aesthetic & Tone

**Identité visuelle du Salon (V1) :** épurée et moderne, choisie délibérément pour sa simplicité de mise en œuvre en V1 — pas de traitement "chaleureux/cosy" (bois, tissu, lumière tamisée) à ce stade. Une personnalisation visuelle plus chaleureuse (fonds d'écran, thèmes) est envisagée comme piste post-V1 pour se rapprocher de l'esprit "table de cuisine" du brief sans complexifier la V1 (cf. §8).

**Feedback de placement (réalise FR-14) :**
- Placement d'une pièce standard : son évoquant le bois (clic organique).
- Complétion d'un Îlot ou moment de contribution marquant : son plus électronique, à connotation "victoire".
- Sur mobile : micro-vibration synchronisée avec le placement.

## 7. Platform

**V1 : PWA web, avec wrapper mobile (ex. Capacitor) pour une présence sur les stores.** Choix délibéré pour un développeur solo : un seul codebase, itération la plus rapide pour valider vite avec de vraies familles, au prix d'un ressenti natif légèrement en retrait sur mobile par rapport à une app 100% native.

Ce choix n'enferme pas le produit : l'état partagé du Salon (progression, présence, comptes, liens d'invitation) vit côté backend, découplé du client. Une réécriture native ultérieure (ex. Flutter) pourrait se brancher sur le même backend sans perdre l'état partagé — seule la couche d'affichage/interaction serait à refaire.

## 8. Non-Goals (Explicit)

- Jigsaw V1 n'inclut pas le mode Battle (puzzles parallèles compétitifs avec power-ups) — post-V1.
- Jigsaw V1 n'inclut pas le mode Time-out (contre la montre) — post-V1.
- Pas de monétisation (publicité, abonnement, achat) en V1 — priorité à la validation de l'expérience avant tout modèle économique.
- Pas de génération d'images par IA en V1 — risque IP/légal identifié (reproduction possible de personnages sous licence) et non résolu.
- Pas de scoring de difficulté assisté par IA en V1.
- Pas de personnalisation visuelle du Salon (fonds d'écran chaleureux, thèmes) en V1 — envisagée comme piste post-V1 (cf. §6).
- Pas d'invitation restreinte à des personnes explicitement nommées en V1 — seul le lien public existe (cf. §4.6).
- Pas de bonus lié à l'intégration d'un Îlot en V1 — envisagé comme mécanique du mode Battle (V2, compétitif) déjà différé ; noté ici pour cohérence future, non construit maintenant.

## 9. MVP Scope

### 9.1 In Scope
- Création d'un Salon par un Participant inscrit : choix d'image (bibliothèque ou photo personnelle), choix du nombre de pièces, génération d'un lien d'invitation public.
- Mode Salon persistant, multi-participants, accès Invité via lien partagé.
- Espace infini + Cadre + mécanique des Îlots.
- Tutoriel de premier accès pour les Invités.
- Authentification différée (inscription optionnelle proposée en sortie de session).
- Présence en direct + historique des contributeurs.
- Statistiques valorisantes partagées, cumulées sur la durée de vie du Salon.

### 9.2 Out of Scope for MVP
Voir §8 Non-Goals pour la liste complète des exclusions et leurs raisons — toutes s'appliquent à la MVP.

## 10. Success Metrics

**Primary**
- **SM-1**: Jours consécutifs avec au moins une contribution par Salon actif (streak du Salon). Valide FR-8 à FR-16.
- **SM-2**: Taux de retour des Invités après leur première session (% qui reviennent contribuer une seconde fois). Valide FR-8, FR-9, FR-10, FR-11.

**Secondary**
- **SM-3**: Nombre moyen de Participants distincts par Salon sur sa durée de vie. Valide FR-8, FR-12, FR-13.

**Counter-metrics (do not optimize)**
- **SM-C1**: Le temps passé par session ne doit pas être optimisé isolément comme signe de succès — le produit vise une contribution ponctuelle et satisfaisante, pas une rétention captive. Contrebalance SM-1/SM-3.

## 11. Open Questions

1. Les cibles quantitatives de SM-1/SM-2/SM-3 (seuil de streak visé, taux de retour cible, etc.) restent à définir une fois les premiers tests familiaux réalisés.
2. Upload de photo personnelle (§4.6, FR-18) : quelles contraintes de modération/contenu prévoir (photos impliquant des tiers, des mineurs) ? Non traité dans ce PRD.
3. Cohérence entre la résolution de l'image choisie et le nombre de pièces demandé (§4.6, FR-18/FR-19) : que se passe-t-il si l'image est trop petite/basse résolution pour le découpage demandé ? Non traité dans ce PRD.
4. Mécanisme de résolution de conflit pour l'édition concurrente d'un même Îlot par plusieurs Participants (§4.2, FR-7) : délégué à l'architecture technique, non spécifié dans ce PRD.

## 12. Assumptions Index

- Inline assumption de §4.2 FR-6 — le seuil de proximité qui déclenche la vérification de compatibilité entre deux pièces est délégué à la conception UX/technique en aval de ce PRD.

