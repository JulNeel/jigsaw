# Validation Report — Jigsaw

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-jigsaw-2026-07-28/EXPERIENCE.md`
- **Run at:** 2026-07-28

## Overall verdict

La paire de spines est disciplinée et globalement propre : ordre canonique de DESIGN.md respecté, résolution complète des tokens, glossaire et noms d'UJ hérités mot pour mot du PRD, maquettes honnêtement reportées à Finalize. Ce n'est pas encore un contrat extractible sans relecture : deux paires de couleurs de la couche de marque échouent au contraste AA, environ la moitié des surfaces d'IA n'ont aucune couverture d'état, quelques composants sont à sens unique entre les deux fichiers, et une source citée n'est pas déclarée.

La revue accessibilité confirme indépendamment le problème de contraste et ajoute des manques concrets, peu coûteux, et hors des deux arbitrages déjà actés (pas d'alternative clavier au drag ; pas d'accommodation liée à l'âge) : noms accessibles absents sur les contrôles à icône seule, aucune sémantique de focus/lecteur d'écran sur la modale de tutoriel, aucun équivalent non-visuel pour les événements collaboratifs temps réel.

## Category verdicts
- Flow coverage — adequate
- Token completeness — thin
- Component coverage — thin
- State coverage — thin
- Visual reference coverage — strong
- Bloat & overspecification — strong
- Inheritance discipline — adequate
- Shape fit — strong

## Findings by severity

### Critical (1)

**[Token completeness / Accessibilité]** — La palette échoue au contraste AA qu'elle prétend respecter
Calculs convergents des deux revues : `primary-foreground` (#FFFFFF) sur `primary` (#C1652F) ≈ 4.06:1 ; `muted-foreground` (#8A7D6C) sur `background`/`muted` ≈ 3.76:1 / 3.25:1 — tous sous le seuil AA texte normal (4.5:1), alors qu'EXPERIENCE.md affirme la palette "vérifiée".
Fix: Assombrir `primary` et `muted-foreground` jusqu'à 4.5:1, ou documenter des ratios vérifiés et restreindre leur usage.

### High (6)

**[Component coverage]** — "Historique des contributeurs" sans spec visuelle (EXPERIENCE.md Component Patterns ; absent de DESIGN.md.Components)
Fix: Ajouter une ligne DESIGN.md.Components.

**[State coverage]** — Zéro état pour 5 des 7 surfaces d'IA : Accueil, Connexion/Inscription, Création de Salon, Partage, Statistiques (EXPERIENCE.md State Patterns)
Fix: Ajouter au minimum une ligne état-vide et une ligne erreur/chargement par surface.

**[State coverage]** — Open Question #3 du PRD (résolution image/nombre de pièces) non reportée dans la spine, même en `[ASSUMPTION]`
Fix: Ajouter une ligne d'état provisoire ou un tag `[ASSUMPTION]` pour Création de Salon.

**[Accessibilité]** — Aucun nom accessible sur les contrôles à icône seule (recentrer, mute)
Fix: Exiger un `aria-label` sur tout contrôle à icône seule.

**[Accessibilité]** — Modale de tutoriel sans piège de focus, fermeture Échap ni sémantique lecteur d'écran confirmés
Fix: Confirmer l'usage de shadcn Dialog/Radix (focus trap + Échap + aria-modal inclus), préciser focus initial et titre accessible.

**[Accessibilité]** — Aucun équivalent non-visuel (aria-live) pour les événements collaboratifs temps réel (placement de pièce, présence)
Fix: Ajouter une région `aria-live="polite"` pour les événements significatifs du Salon.

### Medium (7)

**[Flow coverage]** — Edge case de UJ-1 (sortie sans compte) non relié depuis le flow lui-même, seulement dans State Patterns.
Fix: Ajouter une ligne `Échec :` inline dans UJ-1.

**[Component coverage]** — "Ligne de classement" (DESIGN.md) sans pendant comportemental dans EXPERIENCE.md Component Patterns.
Fix: Ajouter une ligne dédiée.

**[Component coverage]** — Incohérence de nom : "Point de présence" (DESIGN.md) vs "Présence en direct" (EXPERIENCE.md).
Fix: Aligner les noms ou clarifier la relation atome/pattern.

**[Inheritance discipline]** — L'addendum du brief est cité en prose mais absent du frontmatter `sources` des deux fichiers.
Fix: Ajouter le chemin de l'addendum aux deux `sources:`.

**[Accessibilité]** — Contraste et désambiguïsation multi-utilisateur du point de présence / contour d'Îlot (or sur crème ≈ 2.1:1, sous 3:1 ; plusieurs Îlots actifs partagent le même contour sans différenciation).
Fix: Vérifier l'or contre un fond chrome opaque ; envisager un différenciateur par participant.

**[Accessibilité]** — Token `ring` shadcn hérité sans re-vérification contre la nouvelle palette chaude.
Fix: Re-vérifier ou surcharger `ring` contre `background`/`card`.

**[Accessibilité]** — Critère de taille minimale de cible WCAG 2.2 SC 2.5.8 absent du plancher pour les contrôles de chrome.
Fix: Ajouter une taille minimale (24×24px CSS) pour les contrôles hors-canvas.

### Low (6)

**[Flow coverage]** — FR-1, FR-3, FR-8, FR-11 jamais explicitement cités dans EXPERIENCE.md.
Fix: Ajouter les citations manquantes, en priorité FR-11.

**[Token completeness]** — `accent-foreground` défini mais jamais référencé.
Fix: Le référencer ou le retirer.

**[Bloat & overspecification]** — Léger chevauchement visuel/comportemental sur le timing des contours Pièce/Îlot entre les deux fichiers.
Fix: Optionnel — clarifier laquelle des deux fait autorité.

**[Inheritance discipline]** — Clé de frontmatter divergente : `name` (DESIGN.md) vs `title` (EXPERIENCE.md).
Fix: Renommer en `name` dans EXPERIENCE.md.

**[Shape fit]** — Ordre "Inspiration & Anti-patterns" avant "Responsive & Platform", inversé par rapport aux modèles de référence (non normatif).
Fix: Optionnel.

**[Accessibilité]** — Token `border` quasi invisible (~1.3:1) contre `background` ; le bouton recentrer dépend surtout de son ombre.
Fix: Confirmer que l'ombre seule suffit, ou renforcer le contraste de `border`.

## Mechanical notes
- Glossaire identique entre les deux spines et le PRD — aucune dérive.
- Toutes les références `{path.to.token}` et `{components.*}` vérifiées résolvent correctement.
- Aucun mockup/wireframe généré à ce stade — état attendu, correctement signalé.

## Reviewer files
- `review-rubric.md`
- `review-accessibility.md`
