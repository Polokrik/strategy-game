# Campagne Monde : décisions et interfaces

Mode distinct de la campagne France : code dans `src/world/`, données dans `src/data/world/`, sauvegarde séparée.
Rien n'est partagé avec `src/campaign/`. Le moteur de bataille (`src/engine/`) est commun.

Statuts : **VALIDÉ** (choix du créateur), **PROPOSÉ** (valeur par défaut, à réviser), **ABSTRACTION** (convention de jeu, sans valeur historique).

## Décisions

| Sujet | Décision | Statut |
|---|---|---|
| Style des batailles | pixel art actuel (`cb8c5d7`) conservé | VALIDÉ (15 nov. 2026) |
| Premier théâtre | Europe de l'Ouest, 3000 av. J.-C., 28 régions | VALIDÉ |
| Bataille dès la tranche 1 | oui, avec les troupes actuelles du moteur | VALIDÉ |
| Calendrier | 50 / 25 / 10 / 5 / 2 / 1 ans par tour selon la période ; jamais lié à la conquête | VALIDÉ pour le principe, PROPOSÉ pour les valeurs |
| Chance de victoire | un pourcentage tiré du rapport de forces (voir plus bas) | VALIDÉ (remplace la proposition « trois classes sans pourcentage ») |
| Troupes d'une attaque | prélevées sur tout le territoire, le joueur choisit combien | VALIDÉ |
| Noms des régions | toponymes géographiques actuels, simples repères | ABSTRACTION |
| Sociétés | « Peuple · région d'origine » et « Communautés locales » ; aucune société historique | ABSTRACTION |
| Troupes, capacité, croissance | chiffres d'équilibrage ; ni effectifs réels ni types d'unités | ABSTRACTION |

## Chance de victoire

`ratio = (troupes envoyées × puissance de l'attaquant) / (défenseurs × puissance du défenseur)`
`chance = ratio^1,6 / (1 + ratio^1,6)`, bornée entre 5 % et 90 %.

À forces égales 50 %, à 2 contre 1 environ 75 %, à 10 contre 1 le plafond de 90 % (exemple du créateur : 250 contre 25).
C'est la probabilité réellement tirée par la résolution automatique : le pourcentage affiché n'est donc pas une estimation.
Une bataille **jouée** ne suit pas ce pourcentage : son issue dépend du joueur. Les deux camps y démarrent avec des
forces tirées du même ratio (`startingForces`).

La puissance vaut 1 pour tous en tranche 1 (`powerOf`). C'est par elle que l'« avancée » (savoirs, équipement) pèsera en tranche 2.

## Règles de la tranche 1

- Une région entretient `30 + 0,4 × surface` troupes. Une société démarre à pleine capacité, une communauté locale à 20 % et plafonne à 35 %.
- Chaque tour, une région regagne 35 % de l'écart à sa capacité (10 % pour une communauté locale). PROPOSÉ : la croissance est par tour, pas par année, alors que les tours n'ont pas tous la même durée.
- On n'attaque que les régions voisines de son territoire. Une seule traversée maritime existe (Plaine du Nord ↔ sud de la Grande-Bretagne).
- Victoire : l'attaquant perd 50 à 100 % de l'effectif des défenseurs ; le reste occupe la région. Échec : il perd 50 à 90 % des troupes envoyées, les survivants rentrent.
- Les autres sociétés suivent **les mêmes règles** : au plus une attaque par tour, avec 60 % de leurs troupes disponibles, si la chance atteint 60 %.
- Fin : victoire quand tout le théâtre est tenu, défaite sans région.

## Interfaces

- `calendar.ts` : années astronomiques en interne (pas d'année zéro à l'affichage), `nextYear`, `stepAt`, `formatYear`.
- `state.ts` : `WorldState` (versionné, graine du hasard incluse), `THEATRE`, `REGIONS`.
- `rules.ts` : `newWorld`, `winChance`, `playerAttack`, `endTurn`, `serialize` / `deserialize`.
- `battle.ts` : `BattleContext` (deux forces, une taille de terrain) → `LevelDef` du moteur. Le moteur ne connaît ni date ni société.
- `screen.ts` : l'écran, branché au jeu par `WorldHost` (`playBattle`, `show`, `layout`).
- Sauvegarde : clé `conquete.monde`, `version: 1`. Une sauvegarde d'une autre version est refusée, jamais migrée en silence.

## Mesures (tranche 1)

- Un bot naïf (attaque avec 60 % de ses troupes dès 70 % de chance, 8 graines, 120 tours) : selon le départ, de l'élimination au tour 6 à la victoire au tour 33. Les départs à une seule voisine (Armorique) sont nettement plus durs.
- 300 tours simulés sans effectif négatif, fractionnaire ou hors capacité (test). Avancer avec ou sans sauvegarde à chaque tour donne la même histoire (test).

## Limites connues

- Aucune donnée historique n'est encore dans le jeu : ni sociétés, ni unités, ni techniques. Les rapports R1 et R2 n'ont pas de références utilisables (jetons internes sans URL).
- Les attaques des autres sociétés contre le joueur sont résolues automatiquement, sans annonce ni défense jouée.
- Pas d'économie, de techniques, d'exploration, de diplomatie, ni d'avance automatique de plusieurs tours.
- La carte est une coupe rectangulaire : la péninsule italienne et l'Afrique du Nord sont hors théâtre.
