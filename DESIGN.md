# Design doc : jeu d'invasion par nombres (nom de travail : « Conquête »)

## Vision
Un « Risk simplifié » inspiré de State.io : on glisse des troupes d'une base à l'autre, le plus grand nombre gagne. Différences voulues : pas de pub ni de monétisation agressive, ennemis avec personnalités, campagne historique, couche civilisation. Cibles : mobile (parties courtes) et PC (parties longues).

## Principe d'architecture : deux échelles
1. **Couche bataille (courte, 2 à 4 min)** : un territoire disputé = une partie temps réel sur une carte de bases numérotées. Cœur du jeu, à prototyper en premier.
2. **Couche campagne (longue, par tours)** : carte façon Risk. On choisit quel territoire attaquer, la population croît, les époques avancent. Chaque attaque se résout par une bataille.

Le temps de campagne est mesuré en tours, jamais en temps réel : on peut s'arrêter et reprendre sans rien perdre.

## Couche bataille : règles de base
- Bases (cercles) avec un nombre de troupes ; propriétaires : joueur, 1 à 3 IA, neutres (gris).
- Une base de joueur produit des troupes en continu, jusqu'à une capacité.
- Glisser d'une base vers une autre envoie une partie des troupes ; à l'arrivée sur une base ennemie ou neutre, on soustrait ; si le résultat est négatif, la base change de camp.
- Victoire : toutes les bases adverses capturées. Durée cible : 2 à 4 min.
- **À décider (un seul twist pour le prototype)** : troupes interceptables en transit, production liée au voisinage, ou bases qui montent de palier (village, ville, capitale).
- Lisibilité : pas de gros nombres bruts ; paliers d'unités (soldat, légion) quand les effectifs gonflent.

## IA ennemie
Personnalités : agressive, défensive, opportuniste. Même moteur, paramètres différents (seuil d'attaque, part de troupes envoyées, cibles préférées). Variété sans contenu supplémentaire.

## Couche campagne
- Carte découpée en territoires adjacents ; tour par tour : choisir un territoire adjacent à attaquer ou à fortifier.
- Population par territoire : fait monter les troupes de départ en bataille et débloque des paliers.
- **Époques** : l'époque avance à des jalons de campagne (nombre de tours et/ou territoires clés), pas à une taille arbitraire. Chaque époque apporte une règle (exemples : routes et distance pour l'Antiquité, forteresses pour le Moyen Âge, poudre à la Renaissance...). **Une seule règle par époque.**
- Automatisation : ordres permanents (envoi régulier sur un trajet) débloqués par la technologie, avec un plafond. Mécanique de stratégie, pas confort qui joue à la place du joueur.

## Modes de jeu
| Mode | Plateforme | Durée | Contenu |
|---|---|---|---|
| Tutoriel / chapitres | Mobile + PC | 2 à 4 min par niveau | 1 adversaire, puis 2, puis 3 ; une notion par chapitre |
| Campagne « Conquête des États-Unis » | Mobile + PC | Plusieurs sessions | Premier scénario de référence |
| Campagnes historiques (France, Bretagne, monde) | Mobile + PC | Longue | Après validation du premier scénario |
| Mode expert / long (style Civilisation) | PC d'abord | 40 min et plus | Même moteur, plus de profondeur |

## Modèle économique
**Décision actuelle : aucune monétisation.** Projet perso de test. Si le jeu plaît et qu'une publication est envisagée, on décide alors (achat unique ou cosmétiques seulement). Règle ferme dès maintenant : rien qui s'achète ne donne un avantage en partie. Pas de pub, pas de monnaie premium, pas de temps d'attente payant.

## Ton et setting
Setting **réaliste** dès le départ (cartes et nations réelles, ambiance sobre). Les thèmes de bonus et d'éventuels partenariats viennent bien plus tard.

## Décisions prises
- Twist de bataille du prototype : **troupes interceptables en transit**.
- Jokers : **joueur uniquement**, l'IA n'en a pas. Ils se gagnent en jouant (jamais achetés), avec un plafond par partie, et se chargent par une jauge qui monte aussi quand on perd des troupes (rattrapage).
- Effets de jokers prévus : ralentir un ennemi, catastrophe naturelle, sabotage de la production adverse, ralenti temporel (alerte à l'arrivée de troupes, coût ou rareté pour ne pas supprimer l'anticipation). Noms neutres, pas de thème terroriste.
- Le ralenti suppose le **solo** (il ne fonctionne pas en multijoueur en ligne).

## Roadmap
**Phase 1 : prototype de bataille (maintenant)**
- Moteur de bataille jouable, carte fixe, 1 IA, glisser pour envoyer des troupes.
- Interception des troupes en transit.
- Critère de sortie : une partie de 2 à 4 min est amusante sans rien d'autre.

**Phase 2 : IA et variété**
- 3 personnalités d'IA (agressive, défensive, opportuniste).
- 2 et 3 adversaires, tutoriel en chapitres (une notion par chapitre).

**Phase 3 : jokers**
- Un seul joker d'abord : le ralenti. Tester l'effet sur la tension.
- Puis ralentir un ennemi, catastrophe, sabotage, un par un.

**Phase 4 : mini-campagne**
- 5 territoires sur une carte réduite, couche tour par tour, bataille par territoire.

**Phase 5 : époques et civilisation**
- Époques par jalons de campagne, une règle par époque. Paliers de bases (village, ville, capitale). Automatisation plafonnée.

**Phase 6 : extensions (si le jeu plaît)**
- Campagnes historiques supplémentaires, mode expert long, version PC, décision publication/modèle économique, bonus thématiques et partenariats éventuels.

## Périmètre du premier repo (MVP)
1. Moteur de bataille jouable (carte fixe, 1 IA, drag pour envoyer des troupes).
2. Un twist de bataille, testé.
3. Trois IA de personnalités différentes.
4. Une mini-campagne de 5 territoires sur une carte réduite (Bretagne/France ou côte Est des États-Unis).
Hors MVP : époques, civilisation, automatisation, PC long, monde complet, tutoriel complet.

## Risques
- **Contenu** : campagnes historiques multiples = énorme volume de scénarios et d'équilibrage. Un seul scénario d'abord.
- **Boule de neige** : en campagne, le gagnant est connu tôt. Prévoir un mécanisme de rattrapage ou des événements.
- **Deux produits** : mobile court et PC long partagent le moteur mais pas la conception. Valider le mobile avant d'ouvrir le PC.
- **Nombres qui gonflent** : voir paliers d'unités.

## Questions ouvertes
- Quel twist de bataille pour le prototype ?
- Stack technique (web/canvas pour prototyper, puis moteur ?) à choisir au début du repo.
- Modèle économique final.


---

## Décisions de design, itération 2 (style et renforts automatiques)

### Style
Direction fixée : lisibilité type State.io sur la carte, charme cartoon type Civilization dans l'habillage. Détail, tokens et emprunts : `docs/STYLE.md`. Aucune monétisation reprise des références (pubs, gemmes, packs, vidéo contre récompense).

### Renforts automatiques (demande de Paul)
**Spécification** : le joueur **coche** (d'un toucher sur le territoire) les territoires à automatiser, dans la limite d'**un sixième de ses territoires** (compteur « X/Y territoires » dans l'interface, pastille à chevrons sur la carte). Un territoire coché **de l'arrière** (aucun voisin hostile) qui atteint le seuil choisi (**10, 20 ou 30**, ou désactivé) envoie toutes ses troupes sauf une vers le front le plus proche, en passant par les territoires du joueur. Aucune perte en route. Le passif ne choisit jamais d'attaquer. Réservé au joueur, comme les jokers. Introduit par un chapitre dédié (« Renforts »).

**Écart avec ce document** : l'automatisation était hors MVP (phase 5, débloquée par la technologie, avec un plafond). Elle est avancée avant la campagne, avec un plafond.

**Pourquoi un sixième et pas un tiers (mesuré, joueur lent qui décide toutes les 6 s, 24 parties par case, marge ±10 points, victoire sans renforts ~30 %)** : un tiers donne 92 % au seuil 10, soit aucune borne en pratique ; un sixième 75-83 % ; un huitième 54-63 %. La cause : les renforts vident en continu les territoires de l'arrière qui, pleins, ne produisent plus. Plafonner le nombre de convois, les ralentir ou les taxer (25 %, 40 %) ne change presque rien ; seul le **nombre de territoires automatisés** borne l'effet. Le ratio est le réglage `AUTO_RATIO` (`src/engine/auto.ts`). Le seuil 10 domine toujours les seuils 20 et 30 : ce n'est pas encore une vraie décision.

**Déblocage futur** : le plafond est le bouton naturel d'une progression (le ratio ou le nombre de seuils) débloquée par la technologie de la phase 5, ce qui respecte la règle du document. Une **vente en boutique** d'un avantage de jeu la contredit (« rien qui s'achète ne donne un avantage en partie ») : soit le déblocage se gagne en jouant, soit la boutique reste cosmétique, soit la règle est changée explicitement. Rien n'est construit : le point d'accroche est le drapeau `auto` du chapitre et `AUTO_RATIO`.

### Jokers (phase 3), rappel
Le patron de fiche de commandant des références (compétence, % de garnison, cibles, temps de recharge, niveau) convient à l'écran des jokers. Le design actuel les fait gagner à la jauge et non par recharge ; à choisir à la phase 3.


---

## État d'avancement (après l'itération 2)

| Phase | État | Ce qui reste |
|---|---|---|
| 1. Prototype de bataille | **Fait**, critère validé par Paul (fun, rendu, gameplay) | rien ; les cartes sont générées par graine au lieu d'une carte fixe |
| 2. IA et variété | **Fait** : 3 personnalités, 1 à 3 adversaires, 6 chapitres (une notion chacun) | valider l'équilibrage en jeu réel (calibré avec un bot) |
| 3. Jokers | Non commencé | ralenti d'abord, jauge de charge, plafond par partie, écran de fiche (patron de la référence) |
| 4. Mini-campagne | **Tranche verticale jouable** (itération 3) : carte des 26 provinces, tours, une bataille par province, chronique, sauvegarde, 2 scénarios dont la mini-campagne de 5 territoires | valider l'équilibrage en jeu réel, fortifier, population, événements, vérifier les données historiques |
| 5. Époques et civilisation | Partiel : paliers **visuels** (disques) et renforts bornés | paliers de bases comme mécanique (village, ville, capitale), époques, déblocage du plafond des renforts par la technologie |
| 6. Extensions | Non commencé | campagnes historiques, mode long, PC, modèle économique |

**Chantiers non listés dans ce document** : choix et source des cartes réelles (phase 4 en dépend), installation sur téléphone (le jeu tourne dans un navigateur ; plein écran, icône, ensuite Capacitor), sons et retours haptiques, sauvegarde (aujourd'hui seulement les coches de chapitres), réglages, daltonisme (emblème par camp).

**Ce qui est hors périmètre MVP mais déjà là** : renforts automatiques (listés « hors MVP » plus haut). Les jokers (phase 3) ne sont pas dans le MVP non plus : le plus court chemin vers le MVP est la phase 4.

**Questions ouvertes** : twist (réglé : interception), stack (réglé : web/canvas, moteur à rediscuter après la phase 4), modèle économique (aucune monétisation ; la piste « déblocage en boutique » est à trancher, voir plus haut).


---

## Campagne « histoire de France » (itération 3)

### Découpage : provinces d'Ancien Régime
La carte jointe par Paul montre des **provinces historiques** (Flandre-Artois, Guyenne, Dauphiné…), pas les régions modernes. Arbitrage :
- **Régions modernes (13)** : anachroniques pour une campagne historique (créées en 1982, redécoupées en 2016), très inégales, trop peu nombreuses.
- **Départements (96)** : trop nombreux, découpage napoléonien uniforme.
- **Provinces d'Ancien Régime (26, la carte de Paul)** : l'unité naturelle des rattachements à la Couronne, avec des dates documentées, et un nombre confortable pour une carte de téléphone.

**Données** : il n'existe pas de jeu ouvert des provinces historiques (recherche faite : seuls des contours modernes et des atlas non téléchargeables). Les provinces sont donc **construites en fusionnant des départements actuels** (contours IGN, `gregoiredavid/france-geojson`, Licence Ouverte) avec `tools/build-france.py` ; le résultat, `src/data/france.json`, est versionné (44 Ko). La correspondance départements → provinces est **approximative** (Haute-Loire, Oise, Ain, Gironde… chevauchaient plusieurs provinces) ; pour la corriger, modifier le tableau `PROVINCES` du script et le relancer. **À vérifier avant publication** : ce tableau, les dates et notes de `src/campaign/france.ts` (écrites de mémoire ; seules quelques-unes recoupées : Dauphiné 1349, Franche-Comté 1678, Orléanais 987), et la licence si la carte de Paul sert de référence visuelle.

### Règles (tranche verticale jouable)
- **Départ 1180** (Philippe Auguste) : la Couronne tient Île-de-France, Orléanais, Berry ; les Plantagenêts en tiennent neuf ; cinq autres camps (Flandre, Champagne, Bourgogne, Toulouse, Saint-Empire) et deux terres indépendantes (Auvergne, Corse).
- **Tour de 3 ans.** Le joueur attaque **une province voisine** (une vraie bataille, sur une carte de taille 1, 2 ou 3 selon la surface de la province) **ou passe**. Puis chaque camp adverse, dans l'ordre, attaque ou non (probabilité propre) ; ces batailles sont résolues **en accéléré par le même moteur**. La chronique de l'année s'affiche.
- **Deux scénarios** : « Les conquêtes de Philippe Auguste » (objectif : Normandie, Anjou-Touraine, Maine, Poitou, Picardie : c'est la mini-campagne de 5 territoires du MVP) et « La France se fait » (les 26 provinces).
- **Sauvegarde/reprise** à chaque tour (le temps de campagne se mesure en tours). Abandonner une bataille ne consomme pas le tour.
- **Difficulté** Facile / Normal / Difficile (×0,8 / ×1 / ×1,2 sur la résistance adverse).

### Mesures et décisions
- **Boule de neige adverse** : si le joueur ne fait rien, les Plantagenêts passent de 9 à 17 provinces en 40 tours. Une coalition (les autres camps visent le plus fort) n'y change rien : les petits camps perdent. À traiter si la campagne doit rester ouverte longtemps.
- **Boule de neige du joueur** : sans rattrapage, un joueur raisonnable conquérait la France en 23 tours (de 3 à 13 provinces en 10 tours). Ajout de la **résistance croissante** : +1,5 % par province au-delà de 3, plafonné à +25 %.
- **Précipice de compétence** (bot orienté objectif, scénario à 5 provinces) : un joueur qui décide toutes les 4 s gagne 24 campagnes sur 24 en 4,6 tours ; à 6 s, 0 sur 24 en 40 tours (la Normandie tenue par les Plantagenêts, IA agressive, grande carte, est imbattable). Impossible de calibrer sans voir jouer Paul : d'où le **sélecteur de difficulté**, à régler avec son ressenti.
- **La population ne compte pas encore** : le bonus de troupes de départ (+2 par province, plafonné à +20) ne change presque pas les résultats (3 provinces contre 18 : mêmes taux). Le design doc voulait que la population gonfle les troupes et débloque des paliers ; à décider (bonus plus fort, ou capacité des bases).
- **Non fait** : fortifier une province (le doc le prévoit), événements aléatoires, personnalités historiques, forces des camps dépendant des provinces tenues, Corse jouable en bataille d'île, paliers de bases, époques.
