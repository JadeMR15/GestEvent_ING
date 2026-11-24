# Plav' — règles de travail (phase design)

Plateforme d'événements pour associations étudiantes. Phase de travail **design uniquement**.
À relire au début de chaque session.

## 1. Branche

- On travaille uniquement sur `design-tests`. Vérifier d'abord que c'est la branche active (`git branch`).
- Jamais de commit, merge, rebase ni push sur `main`.
- Ne rien pousser sur GitHub sans demande explicite.

## 2. Design uniquement

On ne touche qu'à l'apparence : mise en page, hiérarchie, espacements, compositions, styles, micro-animations, responsive.

On ne modifie JAMAIS :
- la logique, les fonctionnalités, les routes, la navigation ;
- les appels Supabase / API, les données, les requêtes, l'authentification ;
- la validation des formulaires, les paiements, les QR codes, les inscriptions, les exports ;
- les textes existants, ni les noms de props, d'id ou de classes utilisés par le code.

On ne supprime aucun élément ni aucune fonctionnalité.
Si une amélioration visuelle demande de toucher à la logique : ne pas la faire, la signaler et demander.

## 3. Identité visuelle intouchable

`CHARTE-PLAV.md` et `plav-tokens.css` sont la source de vérité.
- Couleurs : uniquement celles de `plav-tokens.css`, aucune nouvelle couleur.
- Typographie : Nunito pour les titres, Nunito Sans pour le reste, aucune autre police.
- Logo : les fichiers existants de `public/`, sans les modifier, avec leurs règles d'usage.
- Composants et icônes (Lucide) de la charte comme base.

Tout ce qui n'est pas couvert par la charte reste comme avant, sauf demande explicite.

## Façon de travailler

Une demande à la fois : modifications → `npm run build` doit passer → commit sur `design-tests` avec le préfixe `design:` → résumé court (quoi, quels fichiers).
