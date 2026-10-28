import { type Personality, makeAi } from "../engine/ai";
import { type LevelDef, blob, union } from "../engine/level";
import { type MapSpec, generateMap } from "../engine/mapgen";
import { step } from "../engine/sim";
import type { GameState, OwnerId } from "../engine/types";
import {
  AI_FACTIONS,
  CROWN,
  FACTIONS,
  HISTORY,
  NEUTRAL_FACTION,
  PROVINCES,
  type FactionId,
  type ProvinceId,
  SCENARIOS,
  START_OWNERS,
  type Scenario,
  type Tier,
  tierOf,
} from "./france";

/** Campagne par tours : le temps se mesure en tours, jamais en temps réel, donc on peut s'arrêter et reprendre. */
export interface CampaignState {
  scenario: string;
  turn: number;
  owner: Record<ProvinceId, FactionId>;
  /** graine du hasard de la campagne, avancée à chaque tirage (la partie est reproductible) */
  seed: number;
  /** multiplicateur de la résistance adverse : 0,8 facile, 1 normal, 1,2 difficile (absent des anciennes sauvegardes) */
  difficulty?: number;
  status: "playing" | "won" | "lost";
  /** chronique : les derniers événements, du plus ancien au plus récent */
  log: string[];
}

const LOG_SIZE = 14;
const BATTLE_MAX_TIME = 300; // secondes de jeu, pour les batailles résolues sans le joueur

export function newCampaign(
  scenarioId: string,
  seed = Math.floor(Math.random() * 2 ** 31),
  difficulty = 1,
): CampaignState {
  if (!SCENARIOS.some((s) => s.id === scenarioId)) throw new Error(`scénario inconnu : ${scenarioId}`);
  return { scenario: scenarioId, turn: 0, owner: { ...START_OWNERS }, seed, difficulty, status: "playing", log: [] };
}

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
function draw(c: CampaignState): number {
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

/* ---------- batailles ---------- */

const START = { owner: 1, x: 50, y: 152 };
const FOE = { owner: 2, x: 50, y: 8 };

/** Carte de bataille selon la taille de la province (mêmes familles que les chapitres 1, 3 et 4). */
const TIER_MAP: Record<Tier, Omit<MapSpec, "seed" | "starts">> = {
  1: { cols: 3, rows: 5, land: union(blob(50, 85, 34, 70), blob(78, 55, 16, 28)) },
  2: { cols: 4, rows: 6, land: union(blob(50, 112, 44, 40), blob(30, 55, 26, 36), blob(72, 45, 22, 30)) },
  3: { cols: 4, rows: 7, land: blob(50, 82, 50, 76) },
};

/** Troupes de départ : la population (provinces tenues) gonfle l'armée de l'attaquant, la taille de la province la défense. */
/**
 * Rattrapage : plus la Couronne est grande, plus ses adversaires résistent (production de leurs troupes en bataille).
 * Mesuré : sans cela, un joueur raisonnable conquiert la France en ~23 tours, de 3 à 13 provinces en 10 tours.
 */
export const pressure = (c: CampaignState): number =>
  (c.difficulty ?? 1) * Math.min(1.25, 1 + 0.015 * Math.max(0, provincesOf(c, CROWN).length - 3));

const attackerTroops = (c: CampaignState, f: FactionId): number => 20 + Math.min(20, 2 * provincesOf(c, f).length);
const defenderTroops = (target: ProvinceId): number => 20 + 4 * (tierOf(target) - 1);

function battleState(c: CampaignState, attacker: FactionId, target: ProvinceId, seed: number): GameState {
  const s = generateMap({ ...TIER_MAP[tierOf(target)], seed, starts: [START, FOE] });
  for (const b of s.bases) {
    if (b.owner === START.owner) b.troops = attackerTroops(c, attacker);
    if (b.owner === FOE.owner) b.troops = defenderTroops(target);
  }
  return s;
}

const hashOf = (s: string): number => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

/** La bataille que le joueur joue quand il attaque `target`, sous la forme d'un chapitre. */
export function battleLevel(c: CampaignState, target: ProvinceId): LevelDef {
  const p = PROVINCES[target];
  const foe = FACTIONS[c.owner[target]] ?? FACTIONS[NEUTRAL_FACTION];
  const seed = Math.abs((c.seed ^ hashOf(target)) | 0) % 100000;
  const histo = HISTORY[target];
  return {
    title: `Bataille de ${p.name}`,
    notion: `${foe.name} défendent ${p.name}. ${histo?.note ?? ""}`.trim(),
    ais: [{ owner: FOE.owner, personality: foe.personality, handicap: foe.handicap * pressure(c) }],
    auto: true,
    build: () => battleState(c, CROWN, target, seed),
  };
}

/* ---------- résolution sans le joueur ---------- */

/** Le joueur quand c'est l'IA qui le joue (défense de ses provinces) : décide toutes les 4 secondes. */
export const PLAYER_PROXY: Personality = {
  interval: 4,
  attackThreshold: 12,
  sendRatio: 0.5,
  margin: 3,
  maxSends: 1,
  productionMul: 1,
  neutralBias: -5,
  weakness: 0.5,
  leaderFocus: 5,
};

const personalityOf = (f: FactionId, scale = 1): Personality => {
  if (f === CROWN) return PLAYER_PROXY;
  const fac = FACTIONS[f];
  return { ...fac.personality, productionMul: fac.personality.productionMul * fac.handicap * scale };
};

/** Résout une bataille en accéléré, les deux camps étant joués par l'IA. L'attaquant doit gagner avant la fin du temps. */
export function resolveBattle(
  c: CampaignState,
  attacker: FactionId,
  defender: FactionId,
  target: ProvinceId,
  seed: number,
): "attacker" | "defender" {
  const s = battleState(c, attacker, target, seed);
  const sides = [
    makeAi({ owner: START.owner, ...personalityOf(attacker) }),
    makeAi({ owner: FOE.owner, ...personalityOf(defender, attacker === CROWN ? pressure(c) : 1) }),
  ];
  while (s.winner === null && s.time < BATTLE_MAX_TIME) {
    for (const ai of sides) ai(s, 0.1);
    step(s, 0.1);
  }
  return s.winner === (START.owner as OwnerId) ? "attacker" : "defender";
}

/* ---------- tours ---------- */

/** « Le comté de Champagne » devient « le comté de Champagne » : seule l'initiale passe en minuscule. */
const lcFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** « à » + nom du camp, avec contraction : « au comté de Champagne », « aux Plantagenêts », « à la Couronne ». */
const toFaction = (name: string): string =>
  name.startsWith("Le ") ? `au ${name.slice(3)}` : name.startsWith("Les ") ? `aux ${name.slice(4)}` : `à ${lcFirst(name)}`;

const say = (c: CampaignState, line: string): string => {
  c.log.push(line);
  if (c.log.length > LOG_SIZE) c.log.splice(0, c.log.length - LOG_SIZE);
  return line;
};

/** Le joueur a gagné sa bataille : la province change de camp. Retourne la ligne de chronique. */
export function conquer(c: CampaignState, target: ProvinceId): string {
  const was = FACTIONS[c.owner[target]].name;
  c.owner[target] = CROWN;
  if (goalReached(c)) c.status = "won";
  const h = HISTORY[target];
  return say(c, `${PROVINCES[target].name} rejoint la Couronne (prise ${toFaction(was)}).${h ? ` Dans l'histoire : ${h.joined}.` : ""}`);
}

export const repelled = (c: CampaignState, target: ProvinceId): string =>
  say(c, `${PROVINCES[target].name} : l'attaque de la Couronne est repoussée.`);

/** Poids ajouté aux provinces du camp qui domine, pour tous les autres : la coalition contre le plus fort. */
const COALITION = 3;

/** Candidates d'un camp : provinces voisines des siennes qui lui sont étrangères, pondérées. */
function pickTarget(c: CampaignState, f: FactionId): ProvinceId | null {
  const fac = FACTIONS[f];
  const sizes = new Map<FactionId, number>();
  for (const id of Object.keys(c.owner)) if (c.owner[id] !== NEUTRAL_FACTION) sizes.set(c.owner[id], (sizes.get(c.owner[id]) ?? 0) + 1);
  let leader: FactionId | null = null;
  for (const [id, n] of sizes) if (id !== f && (leader === null || n > sizes.get(leader)!)) leader = id;
  const leads = leader !== null && sizes.get(leader)! > (sizes.get(f) ?? 0);
  const cands = new Map<ProvinceId, number>();
  for (const id of provincesOf(c, f))
    for (const n of PROVINCES[id].neighbors) {
      if (c.owner[n] === f) continue;
      const w =
        1 +
        (4 - tierOf(n)) +
        (c.owner[n] === CROWN ? fac.hostility : 0) +
        (c.owner[n] === NEUTRAL_FACTION ? 1 : 0) +
        (leads && c.owner[n] === leader ? COALITION : 0);
      cands.set(n, w);
    }
  if (cands.size === 0) return null;
  let roll = draw(c) * [...cands.values()].reduce((a, b) => a + b, 0);
  for (const [id, w] of cands) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return [...cands.keys()].pop()!;
}

/**
 * Fin du tour du joueur : chaque camp adverse, dans l'ordre, attaque ou non, et la bataille est résolue en
 * accéléré par l'IA. Fait avancer l'année. Retourne les lignes de chronique du tour.
 */
export function endTurn(c: CampaignState): string[] {
  const out: string[] = [];
  for (const f of AI_FACTIONS) {
    if (c.status !== "playing") break;
    if (provincesOf(c, f).length === 0 || draw(c) > FACTIONS[f].aggression) continue;
    const target = pickTarget(c, f);
    if (!target) continue;
    const defender = c.owner[target];
    const seed = Math.floor(draw(c) * 100000);
    const attacker = FACTIONS[f].name;
    if (resolveBattle(c, f, defender, target, seed) === "attacker") {
      c.owner[target] = f;
      out.push(say(c, `${PROVINCES[target].name} : ${attacker} l'emporte contre ${lcFirst(FACTIONS[defender].name)}.`));
    } else {
      out.push(say(c, `${PROVINCES[target].name} : ${FACTIONS[defender].name} repousse ${lcFirst(attacker)}.`));
    }
  }
  c.turn++;
  if (provincesOf(c, CROWN).length === 0) c.status = "lost";
  else if (goalReached(c)) c.status = "won";
  return out;
}

/* ---------- sauvegarde ---------- */

export const serialize = (c: CampaignState): string => JSON.stringify(c);

/** Relit une sauvegarde ; retourne null si elle est absente, illisible ou ne correspond plus aux données. */
export function deserialize(raw: string | null): CampaignState | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as CampaignState;
    const ids = Object.keys(PROVINCES);
    const ok =
      SCENARIOS.some((s) => s.id === c.scenario) &&
      Number.isInteger(c.turn) &&
      ids.every((id) => c.owner?.[id] in FACTIONS) &&
      ["playing", "won", "lost"].includes(c.status) &&
      Array.isArray(c.log);
    return ok ? c : null;
  } catch {
    return null;
  }
}
