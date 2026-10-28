import { AGGRESSIVE, DEFENSIVE, OPPORTUNIST, type Personality } from "./ai";
import { autoEdges, createState } from "./sim";
import { type Base, type GameState, type OwnerId, NEUTRAL, PLAYER } from "./types";

export const WORLD_W = 100;
export const WORLD_H = 160;

export interface LevelDef {
  title: string;
  /** la seule notion introduite par ce chapitre */
  notion: string;
  ais: { owner: OwnerId; personality: Personality }[];
  build: () => GameState;
}

type NodeSpec = Omit<Base, "id">;

const player = (x: number, y: number): NodeSpec => ({ x, y, owner: PLAYER, troops: 20, capacity: 60 });
const enemy = (owner: OwnerId, x: number, y: number): NodeSpec => ({ x, y, owner, troops: 20, capacity: 60 });
const neutral = (x: number, y: number, troops = 8, capacity = 30): NodeSpec => ({
  x,
  y,
  owner: NEUTRAL,
  troops,
  capacity,
});
const junction = (x: number, y: number): NodeSpec => ({
  x,
  y,
  owner: NEUTRAL,
  troops: 0,
  capacity: 0,
  junction: true,
});

/** Routes : toute paire de nœuds à moins de `reach` est reliée. */
function map(nodes: NodeSpec[], reach: number): GameState {
  return createState(nodes, autoEdges(nodes, reach));
}

export const LEVELS: LevelDef[] = [
  {
    title: "Premiers pas",
    notion:
      "Glisse ton doigt d'une de tes bases bleues vers une autre base : la moitié de ses troupes part. Capture les bases grises, puis celle de l'adversaire.",
    ais: [{ owner: 2, personality: DEFENSIVE }],
    build: () =>
      map(
        [
          player(50, 138),
          enemy(2, 50, 22),
          neutral(25, 105),
          neutral(75, 105),
          neutral(50, 80, 12, 40),
          neutral(25, 55),
          neutral(75, 55),
        ],
        50,
      ),
  },
  {
    title: "Les routes",
    notion:
      "Les troupes suivent les routes et traversent les carrefours. En glissant, le chemin s'affiche : une base ennemie ou neutre te bloque, tes propres bases se traversent.",
    ais: [{ owner: 2, personality: DEFENSIVE }],
    build: () =>
      map(
        [
          player(50, 140),
          enemy(2, 50, 20),
          neutral(20, 110),
          neutral(80, 110),
          neutral(15, 80, 10, 35),
          neutral(85, 80, 10, 35),
          neutral(50, 80, 15, 45),
          neutral(20, 50),
          neutral(80, 50),
          junction(50, 112),
          junction(50, 48),
        ],
        40,
      ),
  },
  {
    title: "Interception",
    notion:
      "Deux troupes ennemies qui se croisent s'annulent : la plus grosse survit diminuée. Coupe la route d'un assaut avec un envoi plus gros, un flash marque le choc.",
    ais: [{ owner: 2, personality: AGGRESSIVE }],
    build: () =>
      map(
        [
          player(50, 140),
          enemy(2, 50, 20),
          neutral(20, 110),
          neutral(80, 110),
          neutral(15, 80, 10, 35),
          neutral(85, 80, 10, 35),
          neutral(50, 80, 15, 45),
          neutral(20, 50),
          neutral(80, 50),
          junction(50, 112),
          junction(50, 48),
        ],
        40,
      ),
  },
  {
    title: "Deux adversaires",
    notion: "Deux IA aux styles différents s'affrontent aussi entre elles : laisse-les s'user.",
    ais: [
      { owner: 2, personality: OPPORTUNIST },
      { owner: 3, personality: DEFENSIVE },
    ],
    build: () =>
      map(
        [
          player(50, 142),
          enemy(2, 20, 22),
          enemy(3, 80, 22),
          neutral(22, 112),
          neutral(78, 112),
          neutral(50, 88, 15, 45),
          neutral(18, 75),
          neutral(82, 75),
          neutral(50, 52, 12, 40),
          junction(50, 118),
          junction(20, 48),
          junction(80, 48),
        ],
        42,
      ),
  },
  {
    title: "Trois adversaires",
    notion: "Trois IA, trois styles : agressive, opportuniste, défensive. Choisis qui affaiblir en premier.",
    ais: [
      { owner: 2, personality: AGGRESSIVE },
      { owner: 3, personality: OPPORTUNIST },
      { owner: 4, personality: DEFENSIVE },
    ],
    build: () =>
      map(
        [
          player(50, 142),
          enemy(2, 15, 65),
          enemy(3, 85, 65),
          enemy(4, 50, 20),
          neutral(22, 115),
          neutral(78, 115),
          neutral(50, 95, 15, 45),
          neutral(50, 58, 15, 45),
          neutral(25, 35),
          neutral(75, 35),
          junction(50, 120),
          junction(32, 82),
          junction(68, 82),
        ],
        42,
      ),
  },
];
