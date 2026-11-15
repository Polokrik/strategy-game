import { BALANCED } from "../engine/ai";
import { type LevelDef, blob, union } from "../engine/level";
import { type MapSpec, generateMap } from "../engine/mapgen";
import { powerOf } from "./rules";
import { REGIONS, type RegionId, type WorldState, societyName } from "./state";

/**
 * Ce que la bataille en temps réel a besoin de savoir d'une attaque de la campagne Monde. Le moteur ne connaît
 * ni la date ni les sociétés : seulement deux forces et la taille du terrain.
 */
export interface BattleContext {
  title: string;
  notion: string;
  /** rapport de forces attaquant / défenseur, puissances comprises */
  ratio: number;
  size: 1 | 2 | 3;
  seed: number;
}

const START = { owner: 1, x: 50, y: 152 };
const FOE = { owner: 2, x: 50, y: 8 };

/** Terrains par taille de région (mêmes familles de cartes que les chapitres). */
const FIELDS: Record<1 | 2 | 3, Omit<MapSpec, "seed" | "starts">> = {
  1: { cols: 3, rows: 5, land: union(blob(50, 85, 34, 70), blob(78, 55, 16, 28)) },
  2: { cols: 4, rows: 6, land: union(blob(50, 112, 44, 40), blob(30, 55, 26, 36), blob(72, 45, 22, 30)) },
  3: { cols: 4, rows: 7, land: blob(50, 82, 50, 76) },
};

const hashOf = (s: string): number => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

export function contextOf(w: WorldState, target: RegionId, sent: number): BattleContext {
  const r = REGIONS[target];
  const ratio = (sent * powerOf(w, w.player)) / (Math.max(1, w.troops[target]) * powerOf(w, w.owner[target]));
  return {
    title: `Bataille de ${r.name}`,
    notion: `${sent} des tiens contre ${w.troops[target]} défenseurs (${societyName(w.owner[target])}).`,
    ratio,
    size: r.area < 130 ? 1 : r.area < 200 ? 2 : 3,
    seed: Math.abs((w.seed ^ hashOf(target)) | 0) % 100000,
  };
}

/** Troupes de départ des deux camps sur le terrain : le rapport de forces, ramené à l'échelle d'une bataille. */
export function startingForces(ratio: number): { attacker: number; defender: number } {
  const clamp = (n: number) => Math.min(45, Math.max(8, Math.round(n)));
  return { attacker: clamp(18 * Math.sqrt(ratio)), defender: clamp(18 / Math.sqrt(ratio)) };
}

/** La bataille jouable d'une attaque : le joueur attaque depuis le bas, le défenseur tient le haut. */
export function battleFor(ctx: BattleContext): LevelDef {
  const forces = startingForces(ctx.ratio);
  return {
    title: ctx.title,
    notion: ctx.notion,
    ais: [{ owner: FOE.owner, personality: BALANCED, handicap: 0.6 }],
    auto: true,
    build: () => {
      const s = generateMap({ ...FIELDS[ctx.size], seed: ctx.seed, starts: [START, FOE] });
      for (const b of s.bases) {
        if (b.owner === START.owner) b.troops = forces.attacker;
        if (b.owner === FOE.owner) b.troops = forces.defender;
      }
      return s;
    },
  };
}
