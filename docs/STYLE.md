# Guide de style : Conquête

**Direction** : lisibilité d'un jeu de territoires sur mobile (flat, couleurs de camp nettes) habillée d'un charme cartoon à la Civilization (contours épais, ombres dessinées, rubans, boutons 3D, polices rondes). Une couleur = un camp ; tout le reste de l'interface est neutre (lavande, encre) pour ne jamais concurrencer les camps.

Source unique des valeurs : `src/theme.ts` (le canvas lit les constantes, le CSS lit les variables `--*` posées par `applyTheme()`).

## Références et emprunts

Captures de State.io fournies par Paul comme référence d'**usages** (pas d'assets).

| Emprunté (comportement) | Pourquoi |
|---|---|
| Troupes en **flux de points** | la quantité se lit à l'œil ; deux flux qui se croisent rendent l'interception évidente |
| **Palier d'un territoire = amas de disques** (1, 2, 3) | prépare village / ville / capitale (design doc) |
| **Barre de répartition** des territoires en haut | on voit la boule de neige d'un coup d'œil |
| Accueil : **carte en haut, piste de chapitres, gros bouton vert** | un seul geste pour jouer |
| Fin de partie : **ruban, laurier, mascotte au drapeau, confettis** | récompense émotionnelle, sans monnaie |
| Fiche de commandant (compétence, niveau, recharge) | patron de l'écran des **jokers** (phase 3) |

**Volontairement non repris** : pubs, gemmes, pièces, boutique, packs, « x3 avec une vidéo » (le design doc interdit toute monétisation), et tout asset de State.io (logo, personnages, noms). Les améliorations achetées par monnaie (garnison, production, capacité) ne sont pas reprises non plus : elles décaleraient l'équilibrage chapitre par chapitre.

## Tokens

### Couleurs de camp (`OWNER`)

| Camp | Remplissage | Foncé (disques, flux) |
|---|---|---|
| Neutre | `#e0d9c6` | `#8f8672` |
| Joueur (bleu) | `#6bb6ff` | `#1d5fae` |
| IA 1 (corail) | `#ff8a73` | `#a8301f` |
| IA 2 (ambre) | `#ffcf66` | `#a86d00` |
| IA 3 (violet) | `#c99cf0` | `#6b2f9e` |

Mer : dégradé `#e8eef4` → `#cddae6`, vagues discrètes. Encre : `#2b2a3a`. Or (interception, sélection) : `#ffc83d`.

### Interface

Lavande `lav-50/100/300/500`, bleu `blue-500/700`, vert `green-400/600/800`, or `gold-300/500/700`, rouge `red-500/700`, nuit `night-900` (fond de l'écran de fin).

### Typographie

- Titres, boutons, rubans, chiffres d'état : **Lilita One** (400)
- Chiffres de la carte, texte courant : **Fredoka** (500/600/700)
- Les deux sont embarquées (`@fontsource`), donc disponibles hors ligne.

### Forme

Contours `3px` encre sur les éléments d'interface, `0,7` unité monde sur la carte. Ombre « dessinée » sous chaque élément (décalage vers le bas, sans flou) plus une ombre diffuse légère. Rayons : 18–22 px (cartes, boutons), cercle pour les pastilles.

## Carte

- **Territoire** : polygone rempli de la couleur du camp, contour encre à 55 %, ombre portée, écume blanche autour des terres. Les territoires neutres portent quelques arbres et collines (décor fixe, graine = id).
- **Marqueur** : un disque principal avec les troupes (blanc sur foncé, encre sur blanc pour le neutre) et 0, 1 ou 2 disques annexes selon la capacité (30 / 45 / 60).
- **Troupes** : flux de points (1 point pour ~2,5 troupes, 14 au plus) dans la couleur foncée du camp, effectif en pastille.
- **Interception** : étoile de bande dessinée dorée qui tourne et s'efface en 0,8 s.
- **Glisser** : territoire de départ entouré de blanc ; trajet en blanc avec contour encre et pointe de flèche ; croix rouge si la cible est inatteignable.
- **Traversées maritimes** : pointillés blancs.

## Composants

| Composant | Variantes | États |
|---|---|---|
| Bouton `.btn` | vert (action principale), bleu (secondaire) | repos, appui (s'enfonce de 4 px), focus clavier (anneau or) |
| Bouton rond `.round` | retour | repos, focus |
| Carte `.card` | texte du chapitre | — |
| Piste de chapitres `.node` | à faire, **terminé** (vert, ✓), **courant** (or, agrandi) | repos, courant (`aria-current`) |
| Ruban `.ribbon` | victoire (bleu), défaite (rouge) | — |
| Barre de répartition `#share` | un segment par camp, neutre inclus | largeur animée |
| Sélecteur de renforts `#auto` | Off / 10 / 20 / 30 | `aria-pressed` |

## Accessibilité (état des lieux)

Rapports de contraste mesurés :

| Paire | Rapport | Verdict |
|---|---|---|
| blanc sur disque joueur / corail / violet | 6,4 / 6,8 / 8,3 | AA |
| blanc sur disque ambre | 4,3 | AA texte large uniquement |
| encre sur disque neutre blanc | 14 | AAA |
| encre sur panneau lavande | 11,4 | AAA |
| blanc sur bouton vert (bas / haut du dégradé) | 4,75 / 2,7 | texte large avec contour sombre ; le haut est limite |
| encre (contours) sur la mer | ~11 | les territoires tiennent par leur contour, pas par leur remplissage |

- Cibles tactiles : boutons ≥ 44 px (retour 44, chapitres 46, seuils 44) ; zone de toucher d'un territoire = 19 unités autour du centre.
- Focus clavier visible, `prefers-reduced-motion` coupe les confettis et les transitions.
- **Limites connues** : les camps ne se distinguent que par la couleur (daltonisme) ; atténuation prévue : un emblème par camp dans le disque principal. Le plateau (canvas) n'est pas exposé aux lecteurs d'écran.

## Questions ouvertes

- Ce mélange (lisibilité State.io + charme Civilization) est-il le bon dosage ? Plus « Civilization » voudrait dire parchemin, ornements, palette plus chaude.
- Mascotte : dessin maison provisoire.
- Sons et retours haptiques : rien de prévu pour l'instant.
