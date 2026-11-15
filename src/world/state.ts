import europe from "../data/world/europe-ouest.json";
import { START_YEAR } from "./calendar";

export type RegionId = string;
/** Une société porte l'identifiant de sa région d'origine ; `null` = communautés locales, sans pouvoir commun. */
export type SocietyId = string;

export interface Region {
  id: RegionId;
  name: string;
  /** point d'ancrage (étiquette, bâtiment) */
  x: number;
  y: number;
  area: number;
  shape: [number, number][];
  neighbors: RegionId[];
}

export interface Theatre {
  id: string;
  name: string;
  width: number;
  height: number;
  regions: Region[];
  seaLinks: [RegionId, RegionId][];
}

export const THEATRE = europe as unknown as Theatre;
export const REGIONS: Record<RegionId, Region> = Object.fromEntries(THEATRE.regions.map((r) => [r.id, r]));

export const SAVE_VERSION = 1;

/** Ce qui s'est passé pendant un tour, pour la chronique. */
export interface WorldEvent {
  attacker: SocietyId;
  target: RegionId;
  /** ancien détenteur de la région */
  defender: SocietyId | null;
  sent: number;
  chance: number;
  won: boolean;
}

export interface WorldState {
  version: typeof SAVE_VERSION;
  theatre: string;
  /** année astronomique (voir calendar.ts) */
  year: number;
  turn: number;
  /** graine du hasard : chaque tirage la fait avancer, donc une sauvegarde rejoue les mêmes tours */
  seed: number;
  player: SocietyId;
  /** les autres sociétés présentes au départ, dans l'ordre (sert à leur donner une couleur stable) */
  rivals: SocietyId[];
  owner: Record<RegionId, SocietyId | null>;
  troops: Record<RegionId, number>;
  status: "playing" | "won" | "lost";
  log: string[];
}

export const NEW_GAME_YEAR = START_YEAR;

/** Hasard reproductible, porté par l'état. */
export function draw(w: WorldState): number {
  w.seed = (w.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(w.seed ^ (w.seed >>> 15), 1 | w.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const regionsOf = (w: WorldState, s: SocietyId): RegionId[] => Object.keys(w.owner).filter((id) => w.owner[id] === s);
export const societies = (w: WorldState): SocietyId[] => [...new Set(Object.values(w.owner).filter((s): s is SocietyId => s !== null))];
export const troopsOf = (w: WorldState, s: SocietyId): number => regionsOf(w, s).reduce((n, id) => n + w.troops[id], 0);
/** Nom d'une société : abstrait, tiré de sa région d'origine. Aucune société historique n'est représentée en Phase 1. */
export const societyName = (s: SocietyId | null): string => (s === null ? "Communautés locales" : `Peuple · ${REGIONS[s].name}`);
