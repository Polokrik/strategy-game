# Conquête

Prototype de bataille (phase 1 du design doc) : un « Risk simplifié » en temps réel. On glisse d'une base à l'autre pour envoyer la moitié des troupes ; le plus grand nombre gagne.

Les batailles se jouent sur une **carte de territoires** façon mappemonde : des régions avec des frontières, des mers, des îles reliées par des traversées maritimes (pointillés). On attaque un territoire voisin, ou on traverse ses propres territoires pour rejoindre le front.

**Twist du prototype : les troupes sont interceptables en transit.** Deux troupes ennemies qui se croisent sur la même frontière s'annulent, la plus grosse survit diminuée (un flash marque le choc). Seule la frontière compte, pas la géométrie : deux trajets qui se croisent à l'écran sans partager de frontière ne s'interceptent pas.

## Campagne « histoire de France »

Onglet **Campagne** du menu. Une carte par tours des 26 provinces d'Ancien Régime : en 1180 la Couronne ne tient que trois provinces, à toi de reconstruire le royaume. Les attaques adverses sont **annoncées un tour à l'avance** (flèches) : à chaque tour tu choisis une bataille, **attaquer** une province ou **défendre** une province menacée ; le reste se résout sans toi. Tu gagnes de l'or (revenu, butin, missions) pour poser des **forteresses**. Deux scénarios (5 provinces, ou toute la France), cinq difficultés, sauvegarde automatique. Détail, découpage et mesures : `DESIGN.md`.

Les provinces sont construites en fusionnant des départements actuels (`tools/build-france.py`, nécessite `pip install shapely`, génère `src/data/france.json`). Le tableau départements → provinces est approximatif et les dates historiques (`src/campaign/france.ts`) sont à vérifier.

## Campagne Monde (tranche 1)

Onglet **Monde**. Europe de l'Ouest en 3000 av. J.-C. : 28 régions naturelles, sans royaumes. Tu choisis ta région, tu envoies une part de tes troupes sur une voisine, tu **joues** la bataille ou tu la **résous** avec la chance affichée (tirée du rapport de forces, plafonnée à 90 %). Le temps avance à chaque tour selon la période (50 ans au début), que tu conquières ou non. Les régions, les peuples et les chiffres sont des abstractions de jeu : aucune donnée historique n'est encore intégrée. Détail : `docs/WORLD_CAMPAIGN.md`, `docs/WORLD_ROADMAP.md`, `docs/HISTORICAL_DATA_POLICY.md`.

## Style

Lisibilité State.io sur la carte, charme cartoon type Civilization dans l'habillage. Voir `docs/STYLE.md`. Troupes en flux de points, paliers de territoire en amas de disques, barre de répartition des territoires.

## Garde-fous anti-boule de neige

- **Fatigue d'empire** : au-delà de 4 territoires, chaque territoire produit un peu moins (pour tout le monde).
- **Les IA ciblent le leader** : elles s'en prennent davantage au camp qui domine.
- **Handicap de production des IA** par chapitre (`handicap` dans `level.ts`) : c'est le réglage de difficulté.
- **Prolongation** (filet de sécurité contre les impasses) : après 5 min, le plafond de troupes rétrécit.

## Chapitres

1. Premiers pas : glisser, capturer. 1 IA défensive.
2. Traversées : îles et traversées maritimes. 1 IA défensive.
3. Interception : 1 IA agressive.
4. Renforts : renforts automatiques bornés (un territoire sur six, à cocher, seuil 10 / 20 / 30). 1 IA opportuniste.
5. Deux adversaires : opportuniste + défensive.
6. Trois adversaires : agressive + opportuniste + défensive.

Trois personnalités d'IA, même moteur, paramètres différents (`src/engine/ai.ts`). Chaque chapitre introduit une seule notion.

## Lancer

**Le plus simple : ouvrir `Conquete.html`** (double-clic). Tout le jeu est dans ce fichier : ni Node, ni installation, ni réseau. Il est régénéré par `npm run build:single` et doit l'être à chaque changement du jeu.

Sous Windows : double-clic sur `jouer.bat` (installe au premier lancement, puis ouvre le jeu dans le navigateur). `mettre-a-jour.bat` récupère la dernière version puis lance le jeu. Node.js doit être installé.

```bash
npm install
npm run dev     # http://localhost:5173, ouvrable depuis le téléphone sur le même réseau
npm test        # tests du moteur
npm run build
```

## Structure

- `src/engine/` : moteur pur (aucune dépendance au navigateur), testé avec vitest.
  - `sim.ts` règles : production, envoi, arrivée, interception, fatigue, prolongation, victoire
  - `mapgen.ts` génère les cartes de territoires (Voronoï, mers, îles)
  - `ai.ts` IA paramétrable : personnalités, attaques coordonnées sur une même cible
  - `auto.ts` renforts automatiques
  - `level.ts` chapitres, cartes, handicaps de difficulté
- `src/campaign/` : la campagne. `campaign.ts` règles (pures, testées), `france.ts` données historiques, `render.ts` dessin de la carte. `src/data/france.json` : géométrie générée.
- `tools/build-france.py` : génère la géométrie des provinces.
- `src/main.ts` : écrans, entrée tactile (pointer events), boucle à pas fixe. `src/render.ts` : dessin de la carte. `src/theme.ts` : tokens de style. `src/hero.ts` : mascotte et confettis.

## Stack

Web (TypeScript, Canvas, Vite) pour prototyper vite et tester sur téléphone. Le moteur étant séparé du rendu, un passage ultérieur à Capacitor ou un autre moteur reste possible.

## Équilibrage

Les réglages de difficulté ont été calibrés avec un bot « humain moyen » (décide toutes les 3 à 6 s). C'est un proxy : à valider en jouant. Si c'est trop dur ou trop facile, ajuster `handicap` par chapitre dans `level.ts`.

## Critère de sortie de la phase 1

Une partie de 2 à 4 min est amusante sans rien d'autre. À valider en jouant, puis ajuster les constantes de `sim.ts` (vitesse, production, rayon d'interception) et les personnalités de `ai.ts`.
