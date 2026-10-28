# Conquête

Prototype de bataille (phase 1 du design doc) : un « Risk simplifié » en temps réel. On glisse d'une base à l'autre pour envoyer la moitié des troupes ; le plus grand nombre gagne.

**Twist du prototype : les troupes sont interceptables en transit.** Deux groupes ennemis qui se croisent s'annulent, le plus gros survit diminué.

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
  - `ai.ts` IA paramétrable (une seule personnalité pour l'instant)
  - `level.ts` carte fixe
- `src/main.ts` : rendu canvas, entrée tactile (pointer events), boucle à pas fixe.

## Stack

Web (TypeScript, Canvas, Vite) pour prototyper vite et tester sur téléphone. Le moteur étant séparé du rendu, un passage ultérieur à Capacitor ou un autre moteur reste possible.

## Critère de sortie de la phase 1

Une partie de 2 à 4 min est amusante sans rien d'autre. À valider en jouant, puis ajuster les constantes de `sim.ts` (vitesse, production, rayon d'interception).
