import { CROWN, type FactionId, PROVINCES, type ProvinceId, SCENARIOS, type Scenario, type Tier, tierOf } from "./france";

/* ---------- économie : une seule monnaie, l'or, gagnée en jouant ---------- */

export const START_GOLD = 40;
/** Revenu par tour d'une province, selon sa taille. */
export const INCOME: Record<Tier, number> = { 1: 2, 2: 3, 3: 4 };
/** Butin d'une bataille d'attaque gagnée, selon la taille de la province prise. */
export const LOOT: Record<Tier, number> = { 1: 10, 2: 16, 3: 24 };
/** Butin d'une défense gagnée. */
export const DEFENSE_LOOT = 8;
/** Forteresses : coût de chaque niveau (0 → 1, 1 → 2, 2 → 3) et troupes de défense ajoutées par niveau. */
export const FORT_COST = [40, 70, 110] as const;
export const MAX_FORT = FORT_COST.length;
export const FORT_TROOPS = 6;
/** Chaque niveau de forteresse accélère aussi la production de troupes du défenseur en bataille (+15 %) : c'est ce qui pèse vraiment. */
export const FORT_PRODUCTION = 0.15;
/** Les camps adverses se fortifient d'eux-mêmes, au front contre la Couronne, jusqu'à ce niveau. */
export const AI_MAX_FORT = 2;

/* ---------- types ---------- */

export type MissionKind = "take" | "hold" | "defend" | "fast" | "fortress";

/** Une mission : un objectif secondaire qui rapporte de l'or. */
export interface Mission {
  id: number;
  kind: MissionKind;
  text: string;
  reward: number;
  /** province visée (take) */
  target?: ProvinceId;
  /** seuil à atteindre (hold, defend, fortress) */
  n?: number;
  progress: number;
  /** tour où la mission a été donnée */
  since: number;
  /** tour à partir duquel la mission expire */
  expires: number;
}

/** Une attaque annoncée : elle se produira à la fin du tour, sauf si le joueur la joue (défense). */
export interface Threat {
  attacker: FactionId;
  /** province d'où part l'attaque */
  from: ProvinceId;
  target: ProvinceId;
}

/** Ce qui s'est passé pendant un tour, pour l'animation de la carte. */
export interface TurnEvent {
  attacker: FactionId;
  from: ProvinceId;
  target: ProvinceId;
  defender: FactionId;
  /** l'attaquant a pris la province */
  won: boolean;
  /** le joueur a livré cette bataille lui-même */
  played: boolean;
}

export interface TurnReport {
  lines: string[];
  events: TurnEvent[];
  /** revenu des provinces ce tour */
  income: number;
  /** butin de la bataille jouée et récompenses de missions */
  reward: number;
  completed: Mission[];
}

/** Campagne par tours : le temps se mesure en tours, jamais en temps réel, donc on peut s'arrêter et reprendre. */
export interface CampaignState {
  scenario: string;
  turn: number;
  owner: Record<ProvinceId, FactionId>;
  /** graine du hasard de la campagne, avancée à chaque tirage (la partie est reproductible) */
  seed: number;
  /** multiplicateur de la résistance adverse : 0,8 facile, 1 normal, 1,2 difficile */
  difficulty?: number;
  status: "playing" | "won" | "lost";
  /** chronique : les derniers événements, du plus ancien au plus récent */
  log: string[];
  /** attaques annoncées pour la fin de ce tour */
  threats: Threat[];
  /** niveau de forteresse de chaque province (0 à MAX_FORT) */
  fort: Record<ProvinceId, number>;
  gold: number;
  missions: Mission[];
  nextMissionId: number;
}

/* ---------- requêtes ---------- */

export const scenarioOf = (c: CampaignState): Scenario => SCENARIOS.find((s) => s.id === c.scenario)!;
export const yearOf = (c: CampaignState): number => {
  const s = scenarioOf(c);
  return s.startYear + c.turn * s.yearsPerTurn;
};
export const provincesOf = (c: CampaignState, f: FactionId): ProvinceId[] =>
  Object.keys(c.owner).filter((id) => c.owner[id] === f);
export const goalOf = (c: CampaignState): ProvinceId[] => {
  const g = scenarioOf(c).goal;
  return g === "all" ? Object.keys(PROVINCES) : g;
};
export const goalReached = (c: CampaignState): boolean => goalOf(c).every((id) => c.owner[id] === CROWN);

/** Hasard reproductible : chaque tirage fait avancer la graine de la campagne. */
export function draw(c: CampaignState): number {
  c.seed = (c.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(c.seed ^ (c.seed >>> 15), 1 | c.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Provinces que la Couronne peut attaquer : celles d'autres camps qui touchent l'une de ses provinces. */
export function targets(c: CampaignState): ProvinceId[] {
  const out = new Set<ProvinceId>();
  for (const id of provincesOf(c, CROWN)) for (const n of PROVINCES[id].neighbors) if (c.owner[n] !== CROWN) out.add(n);
  return [...out];
}
export const canAttack = (c: CampaignState, id: ProvinceId): boolean => c.status === "playing" && targets(c).includes(id);

/** L'attaque annoncée contre cette province, s'il y en a une. */
export const threatOn = (c: CampaignState, id: ProvinceId): Threat | undefined => c.threats.find((t) => t.target === id);
/** Les attaques annoncées contre les provinces de la Couronne. */
export const threatsOnCrown = (c: CampaignState): Threat[] => c.threats.filter((t) => c.owner[t.target] === CROWN);

export const incomeOf = (c: CampaignState): number => provincesOf(c, CROWN).reduce((n, id) => n + INCOME[tierOf(id)], 0);
export const fortOf = (c: CampaignState, id: ProvinceId): number => c.fort[id] ?? 0;
/** Coût du prochain niveau de forteresse, ou null au maximum. */
export const fortCost = (c: CampaignState, id: ProvinceId): number | null => FORT_COST[fortOf(c, id)] ?? null;
export const canFortify = (c: CampaignState, id: ProvinceId): boolean => {
  const cost = fortCost(c, id);
  return c.status === "playing" && c.owner[id] === CROWN && cost !== null && c.gold >= cost;
};
