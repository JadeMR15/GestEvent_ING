# Charte graphique Plav' — consignes de refonte visuelle

> Version 1 · novembre 2026
> Maquette de référence : Figma « Plav' – Charte Graphique »
> https://www.figma.com/design/kr4s1fEM8DE3ZI8uQK2XiL/Plav----Charte-Graphique (page **Charte**)
> Valeurs exactes : `plav-tokens.css` (à placer à côté de ce fichier)

---

## 0. Mission : changer la forme, pas le fond

Appliquer cette charte à **toute l'interface** du projet (site et dashboard), en ne modifiant **que l'apparence**.

**Interdit de modifier :**
- la logique, les fonctionnalités, les routes, les appels API, les données et leur structure ;
- les textes fonctionnels (libellés de champs, messages), sauf mention explicite ci-dessous ;
- le comportement des formulaires, filtres, paiements, QR codes et exports.

**Méthode attendue :**
1. Ajouter `plav-tokens.css` et importer les polices (fait en tête du fichier).
2. Remplacer chaque couleur, police, arrondi et ombre codés en dur par les variables CSS.
3. Supprimer l'ancienne typographie « ballon » partout (titres, logo texte, boutons).
4. Restyler les composants un par un (sections 4 à 9), en commençant par les boutons.
5. Vérifier après chaque étape que l'application compile et que les tests passent.
6. À la fin, lister les fichiers modifiés et tout écart à la charte qu'il n'a pas été possible d'appliquer.

---

## 1. Couleurs

Toutes les couleurs sont dans `plav-tokens.css`. **Aucune autre couleur n'est autorisée.**

| Rôle | Variable | Hex |
|---|---|---|
| Couleur de marque | `--bordeaux-600` | #6D1D30 (= écriture du logo) |
| Accent / action principale | `--jaune-300` | #E8B332 (= écriture du logo) |
| Fond de page | `--neutre-creme` | #F9F4E8 |
| Fond de carte / champ | `--neutre-blanc` | #FFFFFF |
| Bordures, séparateurs | `--neutre-sable` | #EBE4D7 |
| Texte principal | `--neutre-encre` | #2B161B |
| Texte secondaire | `--neutre-gris-chaud` | #7A6960 |

Nuances : bordeaux 100 → 900, jaune 100 → 500 (voir tokens). Bordeaux 700 = survol du bordeaux, jaune 400 = survol du jaune, bordeaux 100 = fond de survol / option sélectionnée.

**Statuts** (uniquement pour des états, jamais pour décorer) :
- Vert = confirmé, payé, présent, succès
- Orange = en attente, presque complet
- Rouge = annulé, complet, erreur
- Bleu = information (ex. « Compte non vérifié »)

Dans un badge ou une alerte : fond `-100`, pastille `-500`, texte `-700`.

**Règles de contraste (obligatoires) :**
- Texte sur bouton jaune → **bordeaux 600**, jamais blanc (blanc sur jaune = illisible).
- Jaune en texte → **uniquement sur fond bordeaux** (titres de hero). Sur fond clair : bordeaux 600 ou encre.
- Pas de texte blanc sur vert 500 ni sur orange 500 : utiliser la nuance 700.

---

## 2. Typographie

- **Nunito** (900, 800, 700) : titres et accroches **uniquement**.
- **Nunito Sans** (400, 500, 600, 700) : tout le reste (texte, boutons, formulaires, légendes, tableaux).
- Interlettrage par défaut (pas de `letter-spacing`), sauf surtitres.

| Style | Classe | Police | Taille / interligne | Usage |
|---|---|---|---|---|
| Display | `.t-display` | Nunito 900 | 48 / 110 % | Grand titre d'accueil |
| Titre 1 | `.t-titre-1` | Nunito 900 | 36 / 115 % | Titre de page |
| Titre 2 | `.t-titre-2` | Nunito 800 | 28 / 120 % | Titre de section |
| Titre 3 | `.t-titre-3` | Nunito 800 | 22 / 125 % | Nom d'événement, titre de carte |
| Sous-titre | `.t-sous-titre` | Nunito 700 | 18 / 130 % | Intertitres |
| Corps L | `.t-corps-l` | Nunito Sans 400 | 18 / 155 % | Chapô |
| Corps | `.t-corps` | Nunito Sans 400 | 16 / 155 % | Texte courant (défaut) |
| Corps fort | `.t-corps-fort` | Nunito Sans 600 | 16 / 155 % | Mise en avant, prix |
| Bouton | `.t-bouton` | Nunito Sans 600 | 16 / 100 % | Libellés de boutons |
| Légende | `.t-legende` | Nunito Sans 500 | 13 / 140 % | Date, lieu, infos secondaires |
| Surtitre | `.t-surtitre` | Nunito Sans 700 | 12, +6 %, MAJUSCULES | Étiquettes, catégories |

Règles : jamais de texte < 12 px ; texte courant ≥ 16 px ; deux niveaux de titre maximum visibles sur un écran mobile.

---

## 3. Logo

Fichiers fournis par l'équipe (SVG) : écriture couleur, écriture unicolore, cocotte (symbole), icône d'appli. **Ne jamais redessiner, déformer ni recolorer le logo en dehors des versions ci-dessous.**

| Contexte | Version |
|---|---|
| Fond clair (crème, blanc) | Écriture **couleur** (version principale) |
| Fond bordeaux | Écriture **unicolore jaune** (#E8B332) — la version couleur est interdite sur bordeaux (l'apostrophe et la cocotte du P disparaissent) |
| Fond très foncé / photo sombre | Unicolore crème (#F9F4E8) |
| Impression une couleur | Unicolore encre (#2B161B) |
| Petit espace, favicon, avatar | Cocotte seule, ou icône d'appli (cocotte sur carré bordeaux) |

- Zone de protection : espace vide = ¼ de la hauteur du logo, de chaque côté.
- Tailles minimales : écriture **60 px** de large ; cocotte et icône d'appli **32 px**. Favicon : fournir un fichier de 48 px (le navigateur l'affiche à 16 px).
- Interdits : déformer, pivoter, changer les couleurs, ajouter ombre/contour/dégradé, poser sur un fond multicolore.

---

## 4. Boutons

Hauteur 48 px (Grand, défaut, surtout mobile) ou 36 px (Petit, tableaux/dashboard). Padding horizontal 24 / 16 px. Police `.t-bouton` (14 px en Petit). Arrondi `--radius-moyen` (Grand) / `--radius-petit` (Petit). Icône/flèche optionnelle à droite, écart 8 px.

| Type | Normal | Survol | Désactivé |
|---|---|---|---|
| **Principal** | fond jaune-300, texte bordeaux-600 | fond jaune-400, texte bordeaux-700 | fond sable, texte gris-chaud |
| **Secondaire** | fond bordeaux-600, texte crème | fond bordeaux-700 | fond sable, texte gris-chaud |
| **Contour** | transparent, bordure 2px bordeaux-600, texte bordeaux-600 | fond bordeaux-100 | bordure sable, texte gris-chaud |
| **Contour clair** (sur fond bordeaux) | transparent, bordure 2px crème, texte crème | fond bordeaux-700 | bordure bordeaux-400, texte bordeaux-300 |

Règles : **un seul bouton Principal par écran** (l'action clé : S'inscrire, Créer un événement, Payer). Secondaire = action importante (Exporter, Nouvel événement). Contour = actions annexes (Partager, Annuler). Flèche → seulement si le bouton change de page. Un bouton désactivé est toujours accompagné d'une explication. Focus clavier : `box-shadow: var(--focus-halo)`.

---

## 5. Carte d'événement

- Largeur pleine sur mobile (marges 16 px), 3 par ligne sur ordinateur.
- Fond blanc, bordure 1px sable, arrondi `--radius-carte`, ombre `--ombre-carte`, `overflow: hidden`.
- **Visuel** en haut au format **4:3** (`aspect-ratio: 4 / 3; object-fit: cover`). Sans image : dégradé bordeaux-600 → bordeaux-400.
  - En haut à gauche (12 px) : un badge (catégorie OU statut urgent, jamais les deux).
  - En haut à droite (12 px) : pastille prix, fond crème, texte `.t-corps-fort` bordeaux-600, arrondi `--radius-petit`, padding 4/10 px. « Gratuit » si pas de prix.
- **Contenu** : padding 16 / 20 / 20 px, écart 10 px.
  - Titre `.t-titre-3` encre, 2 lignes max.
  - Lignes date et lieu : icône 16 px gris-chaud + `.t-legende` gris-chaud, écart 8 px.
  - Jauge : piste 6 px sable arrondie, remplissage selon le statut, puis ligne « X inscrits · Y places restantes » (`.t-legende`, icône participants).
  - Bouton pleine largeur, taille Grand.

| Statut | Badge | Jauge | Bouton |
|---|---|---|---|
| Ouvert | catégorie (badge Marque) | bordeaux-600 | Principal « S'inscrire » |
| Presque complet (< 10 % de places) | orange « Plus que N places » | orange-500 | Principal « S'inscrire » |
| Complet | rouge « Complet » | rouge-500, 100 % | Principal désactivé « Complet » |
| Terminé | neutre « Terminé » | gris-chaud | Contour « Voir le récap », visuel à 55 % d'opacité, titre gris-chaud |

---

## 6. Badges

Pilule (`--radius-pilule`), padding 4/12 px (10 px à gauche), pastille ronde 7 px + texte Nunito Sans 600 13 px, écart 6 px. Un ou deux mots maximum.

| Type | Fond | Pastille | Texte |
|---|---|---|---|
| Confirmé | vert-100 | vert-500 | vert-700 |
| En attente | orange-100 | orange-500 | orange-700 |
| Annulé / Complet | rouge-100 | rouge-500 | rouge-700 |
| Info | bleu-100 | bleu-500 | bleu-700 |
| Neutre (terminé, brouillon) | sable | gris-chaud | encre |
| Marque (catégorie : Soirée, Gala…) | jaune-100 | **aucune** | bordeaux-600 |

---

## 7. Formulaires

Tous les contrôles : hauteur 48 px, arrondi `--radius-moyen`, bordure 1.5px, padding 16 / 14 px, police `.t-corps`.

- **Champ texte** : étiquette au-dessus (Nunito Sans 600 14 px encre, écart 6 px), aide en dessous (`.t-legende` gris-chaud).
  - Vide : fond blanc, bordure sable, placeholder gris-chaud.
  - Rempli : texte encre.
  - Actif (focus) : bordure bordeaux-600 + `--focus-halo`.
  - Erreur : bordure rouge-500, icône alerte rouge-500 à droite, message rouge-700 qui dit **quoi faire** (« Ajoute le domaine de ton adresse (ex. : @esme.fr) »), en tutoyant.
  - Désactivé : fond sable, texte gris-chaud.
- **Recherche** : icône loupe 18 px à gauche (gris-chaud ; bordeaux-600 au focus), écart 10 px.
- **Menu déroulant** : icône facultative 20 px à gauche (gris-chaud), texte, chevron à droite. **Largeur adaptée au contenu** (le libellé ne doit jamais être coupé — corriger « Toutes les date… »). Liste ouverte : fond blanc, bordure sable, arrondi 10 px, `--ombre-menu`, options padding 10/16 px, option choisie fond bordeaux-100 + texte bordeaux-600 600 + coche.
- Barre de filtres des événements : recherche « Titre, lieu, ville, école… » puis menus villes (icône lieu), écoles (école), dates (horloge), tri (trier).
- L'étiquette reste toujours visible : ne pas la remplacer par le placeholder.

---

## 8. Icônes

Style : **trait 2 px, bouts et angles arrondis, pas de remplissage, grille 24 px**. Les icônes de la charte suivent le style de **Lucide** : utiliser `lucide-react` (ou le paquet Lucide adapté au framework) avec `strokeWidth={2}`.

Tailles : 24 px par défaut, 20 px dans un bouton ou un menu, 16 px devant une légende. Couleurs : encre (défaut), gris-chaud (secondaire), bordeaux-600 (actif). Jamais jaune sur fond clair. Dans le menu latéral bordeaux : icônes crème, élément actif en jaune-300 sur fond bordeaux-700.

| Usage | Lucide |
|---|---|
| Dashboard | `layout-dashboard` |
| Événements / date | `calendar` |
| Créer un événement | `circle-plus` |
| Scanner QR | `qr-code` / `scan` |
| Messages école | `message-square` |
| Événements likés | `heart` |
| Paramètres | `settings` |
| Analyses | `chart-no-axes-column` |
| Finances / prix | `euro` |
| Exporter | `download` |
| Mes billets | `ticket` |
| Listes d'attente | `hourglass` |
| Lieu / villes | `map-pin` |
| Écoles | `graduation-cap` |
| Heure / dates | `clock` |
| Tri | `arrow-up-down` |
| Participants | `users` |
| Profil | `user` |
| Rappels | `bell` |
| Vérifier mon compte | `shield-check` |
| Déconnexion | `log-out` |
| Recherche | `search` |
| Filtres | `list-filter` / `sliders-horizontal` |
| Partager | `share-2` |
| Modifier / Supprimer | `pencil` / `trash-2` |
| Image | `image` |
| Menu mobile | `menu` |
| Accueil | `house` |
| Divers | `plus`, `x`, `check`, `arrow-right`, `chevron-down`, `chevron-right`, `info`, `circle-alert` |

---

## 9. États vides et photos

- **État vide** (liste sans contenu) : centré, padding 40 / 24 px, écart 16 px. Pastille ronde 104 px fond bordeaux-100 avec la **cocotte** (60 px) ; titre `.t-titre-3` ; message `.t-corps` gris-chaud ; bouton Principal facultatif. Exemples : « Aucun événement pour l'instant », « Aucun inscrit pour le moment », « Aucun résultat ».
- **Texte sur photo** : dégradé en bas de l'image `linear-gradient(to bottom, rgba(49,13,23,0) , rgba(49,13,23,0.85))`, titre crème, infos jaune-200.
- Photos : authentiques, lumière chaude ; 4:3 pour les cartes, 9:16 pour les visuels à partager en story.

---

## 10. Mise en page générale

- Fond de page : crème. Cartes et champs : blanc.
- Menu latéral du dashboard : fond bordeaux-600, textes et icônes crème, élément actif fond bordeaux-700 + texte et icône jaune-300, titres de groupe (« Navigation », « Outils ») en `.t-surtitre` bordeaux-300.
- Hero de la landing : fond bordeaux-600, titre `.t-display` crème avec la fin de phrase en jaune-300, bouton Principal + bouton Contour clair.
- Zones tactiles ≥ 44 px sur mobile.
