---
name: Jigsaw
description: Puzzle collaboratif familial persistant ("Salon"). shadcn/ui sur Next.js + Tailwind ; ce DESIGN.md ne précise que la couche de marque (delta de couleur, aucune surcharge de typographie).
status: final
created: 2026-07-28
updated: 2026-07-30
sources:
  - _bmad-output/planning-artifacts/prds/prd-jigsaw-2026-07-21/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-jigsaw-2026-07-16/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-jigsaw-2026-07-16/addendum.md
colors:
  # Surcharges de marque par-dessus shadcn. Contrairement à un usage shadcn
  # classique, la palette de neutres elle-même est surchargée (pas seulement
  # les accents) car "neutres chauds" est la direction de base demandée.
  # Valeurs vérifiées WCAG 2.2 AA (voir Colors ci-dessous pour les ratios) —
  # ajustées suite à la revue de validation du 2026-07-28.
  background: '#FBF7F1'
  foreground: '#2B2621'
  muted: '#EFE6D8'
  muted-foreground: '#6E6153'
  border: '#E3D6C2'
  card: '#FFFDF9'
  primary: '#A8541F'
  primary-foreground: '#FFFFFF'
  accent: '#A67518'
  ring: '#A8541F'
typography:
  # Aucune surcharge — la police par défaut de shadcn (Geist Sans) est
  # conservée telle quelle. [ASSUMPTION: cohérent avec "épuré et moderne" (PRD §6) ;
  # aucune préférence typographique exprimée.]
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  # Échelle Tailwind/shadcn par défaut héritée telle quelle, aucune surcharge.
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  presence-dot:
    background: '{colors.accent}'
    radius: '{rounded.full}'
  recenter-button:
    background: '{colors.card}'
    foreground: '{colors.foreground}'
    radius: '{rounded.full}'
    border: '1px solid {colors.border}'
  ilot-outline:
    border: '2px dashed {colors.accent}'
    radius: '{rounded.md}'
  contributor-history-row:
    background: 'transparent'
    foreground: '{colors.foreground}'
    border: '1px solid {colors.border}'
  stats-leaderboard-row:
    background: '{colors.muted}'
    foreground: '{colors.foreground}'
    radius: '{rounded.sm}'
---

## Brand & Style

Jigsaw recrée la sensation du puzzle physique laissé ouvert sur la table du salon — pas en imitant le bois et le tissu à l'écran (le PRD §6 exclut explicitement ce traitement pour la V1), mais en faisant porter la chaleur par la couleur seule : une base de neutres chauds (crème, terre cuite, brun doux) plutôt que les gris froids par défaut d'un produit "outil". Le reste — typographie, densité, structure — reste épuré et moderne, sans ornementation.

`[ASSUMPTION: la chaleur du produit passe uniquement par la couleur ; aucune texture, ombre douce ou motif décoratif n'est ajouté au-dessus des composants shadcn.]`

Jigsaw hérite de shadcn/ui pour l'essentiel de la surface (détail en §Components) ; ce DESIGN.md ne spécifie que la surcharge de marque — couleurs de base et les composants bespoke propres au canvas de puzzle qui n'ont pas d'équivalent shadcn.

## Colors

- **Fond & neutres chauds** (`background` crème `#FBF7F1`, `muted` `#EFE6D8`, `border` `#E3D6C2`, `foreground` brun foncé `#2B2621`) remplacent les tokens shadcn par défaut sur l'ensemble de la surface — c'est la décision de marque centrale, pas un simple accent. `foreground` sur `background` ≈ 14:1 (largement AA).
- **Terre cuite (`primary`, `#A8541F`)** — actions principales (CTA, bouton "Créer un salon", validation). Réutilisée pour le retour visuel de placement d'une pièce (FR-14) — le clic de couleur qui accompagne le clic sonore. `primary-foreground` blanc sur `primary` ≈ 5.3:1 (AA texte normal).
- **Or doux (`accent`, `#A67518`)** — signalétique de vie : présence en direct (FR-12), contour d'un Îlot actif, moment de complétion. N'est jamais utilisé pour la chrome ou la décoration pure. `accent` sur `background` ≈ 3.8:1 (AA pour élément graphique/UI, seuil 3:1 — cet accent n'est jamais utilisé comme texte).
- **`muted-foreground` (`#6E6153`)** — texte secondaire (horodatage, sous-libellés des stats, historique des contributeurs). ≈ 5.6:1 sur `background`, ≈ 4.9:1 sur `muted` (AA texte normal dans les deux cas).
- **`ring` (surchargé, `#A8541F`, identique à `primary`)** — anneau de focus clavier ; le token `ring` par défaut de shadcn était calibré pour des neutres froids et n'était pas garanti lisible sur le nouveau fond crème. ≈ 5:1 sur `background` et `card` (AA élément UI).
- **Tokens shadcn hérités sans changement :** `input`, `destructive`, `popover`.

Toutes les valeurs ci-dessus ont été recalculées (formule de luminance relative WCAG) lors de la revue de validation du 2026-07-28, suite à un premier jet où `primary`/`accent`/`muted-foreground` échouaient l'un ou l'autre seuil AA. `accent-foreground` a été retiré : jamais utilisé en pratique (accent sert uniquement à des éléments graphiques, jamais de texte dessus).

Éviter : dégradés, plus de deux couleurs de marque, teintes froides (bleu/gris clinique) qui contrediraient la direction "chaude".

## Typography

Ramp shadcn par défaut (Geist Sans) héritée sans surcharge — aucun moment display/serif comme dans d'autres produits shadcn, car le PRD (§6) positionne Jigsaw comme épuré plutôt qu'éditorial. La lisibilité prime, y compris pour les statistiques et le tutoriel.

## Layout & Spacing

Échelle Tailwind/shadcn par défaut (4, 8, 12, 16, 20, 24, 32, 40, 48, 64), aucune surcharge. Le canvas (Espace infini) est plein écran par nature — pas de contrainte `max-w` sur cette surface ; les surfaces secondaires (création de Salon, statistiques, authentification) restent en colonne unique, largeur modérée, pour rester lisibles.

## Elevation & Depth

Hérité de shadcn — ombre discrète sur hover/active, aucune hiérarchie par élévation. Sur le canvas, une pièce ou un Îlot en cours de déplacement reçoit une ombre portée légèrement plus marquée que l'état posé, pour donner un repère de profondeur pendant le drag. `[ASSUMPTION: comportement d'ombre au drag non spécifié par l'utilisateur.]`

## Shapes

`rounded/sm` (6px) pour les champs et badges, `rounded/md` (8px) pour boutons et cartes, `rounded/lg` (12px) pour dialogues/modales. Légèrement plus arrondi que des produits "outil" comme shadcn par défaut — cohérent avec un ton familial plutôt que professionnel/tranchant. `rounded/full` réservé aux indicateurs de présence et au bouton recentrer (forme de bulle flottante).

Les pièces de puzzle elles-mêmes suivent leur silhouette de découpe (encoches), pas la grille d'arrondis de l'UI — traitées comme des assets de canvas, hors système de composants.

## Components

Composants shadcn utilisés tels quels : `Button`, `Dialog`, `Sheet`, `Tabs`, `Toast`, `Avatar`, `DropdownMenu`, `Select` (sélecteur de tri des stats).

Composants spécifiques à Jigsaw (bespoke ou compositions shadcn) :

- **Pièce de puzzle** — Asset de canvas suivant la silhouette de découpe de l'image source. État posée : aucun contour. État sélectionnée/en déplacement : ombre portée (cf. Elevation) + léger halo `{colors.accent}` à faible opacité.
- **Îlot** — Regroupement de pièces avec un contour `{components.ilot-outline}` visible uniquement pendant le déplacement ou juste après création (pour confirmer visuellement le regroupement) ; disparaît une fois l'Îlot stable. Quand plusieurs Îlots sont actifs en parallèle (FR-7), chaque contour porte un petit chip avatar/initiale du Participant qui le manipule, pour les distinguer sans dépendre de la couleur seule.
- **Bouton recentrer** — Bouton flottant circulaire (`{rounded.full}`), toujours visible en superposition du canvas, fond `{colors.card}` avec bordure `{colors.border}` pour rester lisible sur n'importe quelle image de puzzle en fond. La bordure seule est peu contrastée (~1.3:1) ; la limite du bouton est garantie par l'ombre portée (cf. Elevation), pas par la bordure.
- **Point de présence** — Petit indicateur `{colors.accent}` superposé sur l'Avatar de Participant (coin inférieur droit) pour signaler "en ligne" ; les deux se combinent toujours ensemble, jamais l'un sans l'autre. C'est l'atome visuel du pattern comportemental "Présence en direct" (EXPERIENCE.md.Component Patterns) — même fonctionnalité, granularité différente.
- **Avatar de Participant** — Composition applicative au-dessus du primitif shadcn `Avatar` (pas une redéfinition du composant) : cercle avec initiale, utilisé dans Présence en direct, le chip de désambiguïsation d'Îlot, la Ligne de classement et l'Historique. Couleur assignée cycliquement parmi `{colors.primary}` / `{colors.accent}` / `{colors.muted-foreground}` (extensible si plus de trois Participants simultanés). `[ASSUMPTION: schéma de couleur par assignation cyclique observé lors du rendu des maquettes clés — pas de logique d'attribution stable par Participant spécifiée ; à confirmer si une couleur fixe par personne est souhaitée.]`
- **Historique des contributeurs** (`contributor-history-row`) — Composition shadcn standard (liste/`Table` simple), une ligne par entrée d'historique, texte `{colors.foreground}` sur fond transparent, séparateur `{colors.border}`. Pas de traitement bespoke au-delà de ça.
- **Ligne de classement** — Utilisée dans la vue Statistiques (§ EXPERIENCE.md), fond `{colors.muted}`, une ligne par Participant, critère de tri actif visuellement mis en avant.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Utiliser la base de neutres chauds sur toute la surface, pas seulement en accent | Revenir aux gris froids par défaut de shadcn pour "faire plus neutre" |
| Réserver `{colors.accent}` (or) à la présence/vie en direct et aux moments de complétion | Utiliser l'accent pour la décoration ou la chrome générale |
| Garder les pièces/Îlots comme éléments de canvas suivant leur silhouette réelle | Forcer les pièces dans la grille d'arrondis de l'UI (`rounded.*`) |
| Un retour visuel discret (halo/ombre) à chaque interaction de pièce | Ajouter des textures bois/tissu ou motifs décoratifs (exclus en V1, cf. PRD §6) |
| Rester sur la ramp typographique shadcn par défaut | Introduire une police display sans besoin identifié |
