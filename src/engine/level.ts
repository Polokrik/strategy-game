import { AGGRESSIVE, DEFENSIVE, OPPORTUNIST, type Personality, makeAi } from "./ai";
import { WORLD_H, WORLD_W, generateMap } from "./mapgen";
import { type GameState, type OwnerId, PLAYER } from "./types";

export { WORLD_H, WORLD_W };

export interface LevelDef {
  title: string;
  /** la seule notion introduite par ce chapitre */
  notion: string;
  /** `handicap` multiplie la production de l'IA : le réglage de difficulté de chaque chapitre (réglages de départ, à valider en jouant) */
  ais: { owner: OwnerId; personality: Personality; handicap?: number }[];
  /** propose les renforts automatiques (introduits par le chapitre « Renforts ») */
  auto?: boolean;
  /** carte par défaut ; une autre graine donne une autre carte du même style (utile aux tests) */
  build: (seed?: number) => GameState;
}

type Mask = (x: number, y: number) => boolean;
const blob =
  (cx: number, cy: number, rx: number, ry: number): Mask =>
  (x, y) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

const union =
  (...masks: Mask[]): Mask =>
  (x, y) =>
    masks.some((m) => m(x, y));
const without =
  (mask: Mask, hole: Mask): Mask =>
  (x, y) =>
    mask(x, y) && !hole(x, y);

const START = { owner: PLAYER, x: 50, y: 152 };

export const LEVELS: LevelDef[] = [
  {
    title: "Premiers pas",
    notion:
      "Glisse ton doigt de l'un de tes territoires bleus vers un territoire voisin : la moitié de ses troupes part. Capture les territoires gris, puis celui de l'adversaire.",
    ais: [{ owner: 2, personality: DEFENSIVE, handicap: 0.7 }],
    build: (seed = 11) =>
      generateMap({
        seed,
        cols: 3,
        rows: 5,
        land: union(blob(50, 85, 34, 70), blob(78, 55, 16, 28)),
        starts: [START, { owner: 2, x: 50, y: 8 }],
      }),
  },
  {
    title: "Traversées",
    notion:
      "Les îles sont reliées par des traversées maritimes (pointillés), plus longues. Tes troupes passent par tes propres territoires pour rejoindre le front ; un territoire ennemi les arrête.",
    ais: [{ owner: 2, personality: DEFENSIVE, handicap: 0.7 }],
    build: (seed = 5) =>
      generateMap({
        seed,
        cols: 4,
        rows: 6,
        land: union(
          blob(50, 122, 48, 36),
          blob(38, 16, 34, 24),
          blob(92, 70, 10, 14),
        ),
        starts: [START, { owner: 2, x: 50, y: 12 }],
      }),
  },
  {
    title: "Interception",
    notion:
      "Deux troupes ennemies qui se croisent sur la même frontière s'annulent : la plus grosse survit diminuée. Un flash marque le choc. Coupe la route d'une attaque avec un envoi plus gros.",
    ais: [{ owner: 2, personality: AGGRESSIVE, handicap: 0.55 }],
    build: (seed = 7) =>
      generateMap({
        seed,
        cols: 4,
        rows: 6,
        land: union(blob(50, 112, 44, 40), blob(30, 55, 26, 36), blob(72, 45, 22, 30)),
        starts: [START, { owner: 2, x: 50, y: 8 }],
      }),
  },
  {
    title: "Renforts",
    notion:
      "Les territoires de l'arrière s'ennuient. Choisis un seuil (10, 20 ou 30) : dès qu'un territoire sans voisin hostile l'atteint, il envoie ses troupes vers le front le plus proche. Tu gardes la main sur chaque attaque.",
    ais: [{ owner: 2, personality: OPPORTUNIST, handicap: 0.55 }],
    auto: true,
    build: (seed = 21) =>
      generateMap({
        seed,
        cols: 4,
        rows: 7,
        land: blob(50, 82, 50, 76),
        starts: [START, { owner: 2, x: 50, y: 8 }],
      }),
  },
  {
    title: "Deux adversaires",
    notion: "Deux IA aux styles différents s'affrontent aussi entre elles : laisse-les s'user.",
    auto: true,
    ais: [
      { owner: 2, personality: OPPORTUNIST, handicap: 0.55 },
      { owner: 3, personality: DEFENSIVE, handicap: 0.55 },
    ],
    build: (seed = 3) =>
      generateMap({
        seed,
        cols: 4,
        rows: 7,
        land: union(blob(28, 55, 26, 60), blob(75, 55, 26, 60), blob(50, 125, 40, 30)),
        starts: [START, { owner: 2, x: 15, y: 20 }, { owner: 3, x: 85, y: 20 }],
      }),
  },
  {
    title: "Trois adversaires",
    notion: "Trois IA, trois styles : agressive, opportuniste, défensive. Choisis qui affaiblir en premier.",
    auto: true,
    ais: [
      { owner: 2, personality: AGGRESSIVE, handicap: 0.55 },
      { owner: 3, personality: OPPORTUNIST, handicap: 0.55 },
      { owner: 4, personality: DEFENSIVE, handicap: 0.55 },
    ],
    build: (seed = 9) =>
      generateMap({
        seed,
        cols: 4,
        rows: 8,
        land: without(blob(50, 82, 52, 78), blob(50, 78, 14, 18)),
        starts: [
          START,
          { owner: 2, x: 12, y: 75 },
          { owner: 3, x: 88, y: 75 },
          { owner: 4, x: 50, y: 10 },
        ],
      }),
  },
];

/** Les IA d'un chapitre, handicap de production compris. */
export function makeLevelAis(def: LevelDef): ((s: GameState, dt: number) => void)[] {
  return def.ais.map((a) =>
    makeAi({
      owner: a.owner,
      ...a.personality,
      productionMul: a.personality.productionMul * (a.handicap ?? 1),
    }),
  );
}
