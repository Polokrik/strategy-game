# Conquête

Prototype de bataille (phase 1 du design doc) : un « Risk simplifié » en temps réel. On glisse d'une base à l'autre pour envoyer la moitié des troupes ; le plus grand nombre gagne.

Les batailles se jouent sur une **carte de territoires** façon mappemonde : des régions avec des frontières, des mers, des îles reliées par des traversées maritimes (pointillés). On attaque un territoire voisin, ou on traverse ses propres territoires pour rejoindre le front.

**Twist du prototype : les troupes sont interceptables en transit.** Deux troupes ennemies qui se croisent sur la même frontière s'annulent, la plus grosse survit diminuée (un flash marque le choc). Seule la frontière compte, pas la géométrie : deux trajets qui se croisent à l'écran sans partager de frontière ne s'interceptent pas.

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
4. Renforts : renforts automatiques (seuil 10 / 20 / 30). 1 IA opportuniste.
5. Deux adversaires : opportuniste + défensive.
6. Trois adversaires : agressive + opportuniste + défensive.

Trois personnalités d'IA, même moteur, paramètres différents (`src/engine/ai.ts`). Chaque chapitre introduit une seule notion.

## Lancer

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
- `src/main.ts` : écrans, entrée tactile (pointer events), boucle à pas fixe. `src/render.ts` : dessin de la carte. `src/theme.ts` : tokens de style. `src/hero.ts` : mascotte et confettis.

## Stack

Web (TypeScript, Canvas, Vite) pour prototyper vite et tester sur téléphone. Le moteur étant séparé du rendu, un passage ultérieur à Capacitor ou un autre moteur reste possible.

## Équilibrage

Les réglages de difficulté ont été calibrés avec un bot « humain moyen » (décide toutes les 3 à 6 s). C'est un proxy : à valider en jouant. Si c'est trop dur ou trop facile, ajuster `handicap` par chapitre dans `level.ts`.

## Critère de sortie de la phase 1

Une partie de 2 à 4 min est amusante sans rien d'autre. À valider en jouant, puis ajuster les constantes de `sim.ts` (vitesse, production, rayon d'interception) et les personnalités de `ai.ts`.
