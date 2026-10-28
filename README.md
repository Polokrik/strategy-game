# Conquête

Prototype de bataille (phase 1 du design doc) : un « Risk simplifié » en temps réel. On glisse d'une base à l'autre pour envoyer la moitié des troupes ; le plus grand nombre gagne.

**Twist du prototype : les troupes sont interceptables en transit.** Deux groupes ennemis qui se croisent s'annulent, le plus gros survit diminué. Les troupes suivent des **routes** et passent par des **carrefours** (là où on peut se couper la route) ; le chemin s'affiche pendant le glisser et un flash marque chaque interception.

## Chapitres (phase 2)

1. Premiers pas : glisser, capturer. 1 IA défensive.
2. Les routes : chemins et carrefours. 1 IA défensive.
3. Interception : 1 IA agressive.
4. Deux adversaires : opportuniste + défensive.
5. Trois adversaires : agressive + opportuniste + défensive.

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
  - `sim.ts` règles : production, envoi, arrivée, interception, victoire
  - `ai.ts` IA paramétrable : personnalités, attaques coordonnées sur une même cible
  - `level.ts` chapitres et cartes
- `src/main.ts` : menu, rendu canvas, entrée tactile (pointer events), boucle à pas fixe.

## Stack

Web (TypeScript, Canvas, Vite) pour prototyper vite et tester sur téléphone. Le moteur étant séparé du rendu, un passage ultérieur à Capacitor ou un autre moteur reste possible.

## Critère de sortie de la phase 1

Une partie de 2 à 4 min est amusante sans rien d'autre. À valider en jouant, puis ajuster les constantes de `sim.ts` (vitesse, production, rayon d'interception) et les personnalités de `ai.ts`.
