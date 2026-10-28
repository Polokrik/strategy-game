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
**Spécification** : un territoire de l'arrière (aucun voisin qui ne soit pas au joueur) qui atteint le seuil choisi (**10, 20 ou 30**, ou désactivé) envoie toutes ses troupes sauf une vers le front le plus proche, en passant par les territoires du joueur. Passage toutes les secondes. Le passif ne choisit jamais d'attaquer. Réservé au joueur, comme les jokers. Introduit par un chapitre dédié (« Renforts »), puis disponible aux chapitres suivants.

**Écart avec ce document** : la phase 5 prévoyait l'automatisation débloquée par la technologie, avec un plafond, et la décrivait comme « mécanique de stratégie, pas confort qui joue à la place du joueur ». Elle est ici avancée avant la campagne, sans plafond autre que le seuil.

**Prémisse faible mesurée** : sur 20 parties par case avec un joueur qui décide toutes les 6 s, les renforts font passer la victoire de 25-35 % à **95 % au seuil 10** (70-80 % à 30). Le seuil n'est donc pas une vraie décision (10 domine), et la fonction rend les chapitres 4 à 6 faciles. Un coût fixe de 2 ou 3 troupes par convoi ne change pas ce constat (écart dans le bruit). À trancher : assistant de confort assumé (alors on durcit les IA quand il est actif) ou mécanique de stratégie bornée (alors plafond de convois simultanés, ou seuil lié à un choix de coût réel).

### Jokers (phase 3), rappel
Le patron de fiche de commandant des références (compétence, % de garnison, cibles, temps de recharge, niveau) convient à l'écran des jokers. Le design actuel les fait gagner à la jauge et non par recharge ; à choisir à la phase 3.
