import { type Personality, makeAi } from "../engine/ai";
import { type LevelDef, blob, union } from "../engine/level";
import { type MapSpec, generateMap } from "../engine/mapgen";
import { step } from "../engine/sim";
import type { GameState } from "../engine/types";
import {
  AI_FACTIONS,
  CROWN,
  agree,
  FACTIONS,
  HISTORY,
  NEUTRAL_FACTION,
  PROVINCES,
  type FactionId,
  type ProvinceId,
  SCENARIOS,
  START_OWNERS,
  type Tier,
  tierOf,
} from "./france";
import { fillMissions, evaluateMissions } from "./missions";
import {
  AI_MAX_FORT,
  type CampaignState,
  DEFENSE_LOOT,
  FORT_PRODUCTION,
  FORT_TROOPS,
  LOOT,
  START_GOLD,
  type Threat,
  type TurnReport,
  autoSlotCost,
  canBuyAutoSlot,
  CAVALRY_SPEED,
  canFortify,
  draw,
  eraIndex,
  eraOf,
  fortCost,
  fortOf,
  goalReached,
  incomeOf,
  provincesOf,
} from "./state";

export * from "./state";
export { ACTIVE_MISSIONS } from "./missions";

const LOG_SIZE = 16;
const BATTLE_MAX_TIME = 300; // secondes de jeu, pour les batailles résolues sans le joueur

export function newCampaign(
  scenarioId: string,
  seed = Math.floor(Math.random() * 2 ** 31),
  difficulty = 1,
  /** scénario « Fais ton histoire » : la province où commence la Couronne */
  start?: ProvinceId,
): CampaignState {
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  if (!sc) throw new Error(`scénario inconnu : ${scenarioId}`);
  const owner = { ...START_OWNERS };
  if (sc.custom) {
    if (!start || !PROVINCES[start]) throw new Error("ce scénario demande une province de départ");
    // la Couronne d'origine devient indépendante : le joueur commence seul, avec la province choisie
    for (const id of Object.keys(owner)) if (owner[id] === CROWN) owner[id] = NEUTRAL_FACTION;
    owner[start] = CROWN;
  }
  const c: CampaignState = {
    scenario: scenarioId,
    turn: 0,
    owner,
    seed,
    difficulty,
    status: "playing",
    log: [],
    threats: [],
    fort: {},
    autoSlots: 0,
    reach: 0,
    reach0: 0,
    gold: START_GOLD,
    missions: [],
    nextMissionId: 1,
  };
  c.reach = c.reach0 = provincesOf(c, CROWN).length;
  c.threats = planThreats(c);
  fillMissions(c);
  return c;
}

/* ---------- batailles ---------- */

const START = { owner: 1, x: 50, y: 152 };
const FOE = { owner: 2, x: 50, y: 8 };

/** Carte de bataille selon la taille de la province (mêmes familles que les chapitres 1, 3 et 4). */
const TIER_MAP: Record<Tier, Omit<MapSpec, "seed" | "starts">> = {
  1: { cols: 3, rows: 5, land: union(blob(50, 85, 34, 70), blob(78, 55, 16, 28)) },
  2: { cols: 4, rows: 6, land: union(blob(50, 112, 44, 40), blob(30, 55, 26, 36), blob(72, 45, 22, 30)) },
  3: { cols: 4, rows: 7, land: blob(50, 82, 50, 76) },
};

/**
 * Rattrapage : plus la Couronne est grande, plus ses adversaires résistent (production de leurs troupes en bataille).
 * Mesuré : sans cela, un joueur raisonnable conquiert la France en ~23 tours, de 3 à 13 provinces en 10 tours.
 */
export const pressure = (c: CampaignState): number =>
  (c.difficulty ?? 1) * Math.min(1.25, 1 + 0.015 * Math.max(0, provincesOf(c, CROWN).length - 3));

/** Troupes de départ d'un camp qui attaque : la population (provinces tenues) gonfle son armée. */
export const attackerTroops = (c: CampaignState, f: FactionId): number => 20 + Math.min(20, 2 * provincesOf(c, f).length);
/** Troupes de départ du défenseur : la taille de la province et ses forteresses. */
export const defenseOf = (c: CampaignState, target: ProvinceId): number =>
  20 + 4 * (tierOf(target) - 1) + FORT_TROOPS * fortOf(c, target);

/** Multiplicateur de production du défenseur d'une province, selon ses forteresses. */
export const fortMul = (c: CampaignState, target: ProvinceId): number => 1 + FORT_PRODUCTION * fortOf(c, target);

/** `bottom` est le camp du joueur (en bas, bleu), `top` son adversaire. */
function battleState(tier: Tier, bottom: number, top: number, seed: number): GameState {
  const s = generateMap({ ...TIER_MAP[tier], seed, starts: [START, FOE] });
  for (const b of s.bases) {
    if (b.owner === START.owner) b.troops = bottom;
    if (b.owner === FOE.owner) b.troops = top;
  }
  return s;
}

/** Les avantages de l'époque du joueur : la cavalerie, dès le Royaume. */
function withEra(c: CampaignState, s: GameState): GameState {
  if (eraIndex(c.reach) >= 1) s.speedMul[START.owner] = CAVALRY_SPEED;
  return s;
}

const hashOf = (s: string): number => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);
const battleSeed = (c: CampaignState, target: ProvinceId): number => Math.abs((c.seed ^ hashOf(target)) | 0) % 100000;

/** La bataille que le joueur joue quand il attaque `target`, sous la forme d'un chapitre. */
export function battleLevel(c: CampaignState, target: ProvinceId): LevelDef {
  const p = PROVINCES[target];
  const foe = FACTIONS[c.owner[target]] ?? FACTIONS[NEUTRAL_FACTION];
  const seed = battleSeed(c, target);
  return {
    title: `Bataille de ${p.name}`,
    notion: `${foe.name} ${agree(foe.name, "défend", "défendent")} ${p.name}. ${HISTORY[target]?.note ?? ""}`.trim(),
    ais: [{ owner: FOE.owner, personality: foe.personality, handicap: foe.handicap * pressure(c) * fortMul(c, target) }],
    auto: true,
    autoBonus: c.autoSlots,
    build: () => withEra(c, battleState(tierOf(target), attackerTroops(c, CROWN), defenseOf(c, target), seed)),
  };
}

/** La bataille que le joueur joue pour défendre une province menacée : il tient la province, l'IA attaque. */
export function defenseLevel(c: CampaignState, t: Threat): LevelDef {
  const atk = FACTIONS[t.attacker];
  const seed = battleSeed(c, t.target);
  return {
    title: `Défense de ${PROVINCES[t.target].name}`,
    notion: `${atk.name} ${agree(atk.name, "attaque", "attaquent")} ${PROVINCES[t.target].name} depuis ${PROVINCES[t.from].name}. Tiens bon !`,
    ais: [{ owner: FOE.owner, personality: atk.personality, handicap: atk.handicap * pressure(c) }],
    auto: true,
    autoBonus: c.autoSlots,
    build: () => {
      const s = battleState(tierOf(t.target), defenseOf(c, t.target), attackerTroops(c, t.attacker), seed);
      s.productionMul[START.owner] = fortMul(c, t.target); // le joueur défend derrière ses murs
      return withEra(c, s);
    },
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
/** Pour estimer la difficulté : un joueur moyen, plus lent que le proxy de défense. */
const PROXY_ESTIMATE: Personality = { ...PLAYER_PROXY, interval: 5 };
/**
 * La défense d'une province de la Couronne quand le joueur ne la joue pas : lente (décision toutes les 8 s). Mesuré : à
 * 4-6 s elle tient presque tout et aucune menace n'a d'enjeu ; à 8 s une petite province tient (80-100 %) mais une
 * grande, attaquée par un camp agressif, tombe.
 */
export const AUTO_DEFENSE: Personality = { ...PLAYER_PROXY, interval: 8 };

const personalityOf = (f: FactionId, scale: number, proxy: Personality): Personality => {
  if (f === CROWN) return { ...proxy, productionMul: proxy.productionMul * scale };
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
  proxy: Personality = PLAYER_PROXY,
): "attacker" | "defender" {
  const s = battleState(tierOf(target), attackerTroops(c, attacker), defenseOf(c, target), seed);
  // la résistance qui monte avec l'empire s'applique à l'IA dès qu'elle affronte la Couronne, dans les deux sens ;
  // les forteresses accélèrent la production du défenseur
  const sides = [
    makeAi({ owner: START.owner, ...personalityOf(attacker, defender === CROWN ? pressure(c) : 1, proxy) }),
    makeAi({ owner: FOE.owner, ...personalityOf(defender, (attacker === CROWN ? pressure(c) : 1) * fortMul(c, target), proxy) }),
  ];
  while (s.winner === null && s.time < BATTLE_MAX_TIME) {
    for (const ai of sides) ai(s, 0.1);
    step(s, 0.1);
  }
  return s.winner === START.owner ? "attacker" : "defender";
}

/* ---------- lisibilité : à quel point c'est dur ---------- */

export type Danger = 1 | 2 | 3 | 4 | 5;
export const DANGER_LABELS = ["Facile", "Abordable", "Disputé", "Dur", "Très dur"] as const;
export const dangerOf = (winRate: number): Danger => (winRate >= 0.85 ? 1 : winRate >= 0.65 ? 2 : winRate >= 0.4 ? 3 : winRate >= 0.2 ? 4 : 5);

const chances = new Map<string, number>();

/**
 * Chance que le joueur gagne cette bataille (en l'attaquant, ou en tenant la province menacée), estimée par
 * quelques simulations rapides avec un joueur moyen. Les graines sont fixes : l'affichage ne change pas d'un
 * coup d'œil à l'autre. C'est une estimation, pas une promesse.
 */
export function winChance(c: CampaignState, target: ProvinceId, kind: "attack" | "defend" | "auto", n = 8): number {
  const threat = c.threats.find((t) => t.target === target);
  if (kind !== "attack" && !threat) return 1;
  const key = [c.turn, target, kind, c.owner[target], fortOf(c, target), provincesOf(c, CROWN).length, c.difficulty ?? 1, threat?.attacker].join("|");
  const known = chances.get(key);
  if (known !== undefined) return known;
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const seed = (hashOf(target) + 7919 * i) % 100000;
    if (kind === "attack") {
      if (resolveBattle(c, CROWN, c.owner[target], target, seed, PROXY_ESTIMATE) === "attacker") wins++;
    } else if (resolveBattle(c, threat!.attacker, CROWN, target, seed, kind === "auto" ? AUTO_DEFENSE : PROXY_ESTIMATE) === "defender") wins++;
  }
  chances.set(key, wins / n);
  return wins / n;
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

/** La province de `f` voisine de `target` d'où part l'attaque : la plus grande. */
function bestFrom(c: CampaignState, f: FactionId, target: ProvinceId): ProvinceId | null {
  const mine = PROVINCES[target].neighbors.filter((n) => c.owner[n] === f);
  return mine.sort((a, b) => PROVINCES[b].area - PROVINCES[a].area)[0] ?? null;
}

/** Chaque camp adverse annonce, avec une certaine probabilité, une attaque pour la fin du tour. */
function planThreats(c: CampaignState): Threat[] {
  const out: Threat[] = [];
  for (const f of AI_FACTIONS) {
    if (provincesOf(c, f).length === 0 || draw(c) > FACTIONS[f].aggression) continue;
    const target = pickTarget(c, f);
    const from = target ? bestFrom(c, f, target) : null;
    if (target && from) out.push({ attacker: f, from, target });
  }
  return out;
}

/** Les camps adverses fortifient d'eux-mêmes leurs provinces au contact de la Couronne, tous les 3 tours. */
function growAiForts(c: CampaignState): void {
  if (c.turn % 3 !== 0) return;
  for (const f of AI_FACTIONS) {
    const border = provincesOf(c, f)
      .filter((id) => fortOf(c, id) < AI_MAX_FORT && PROVINCES[id].neighbors.some((n) => c.owner[n] === CROWN))
      .sort((a, b) => PROVINCES[b].area - PROVINCES[a].area);
    if (border[0]) c.fort[border[0]] = fortOf(c, border[0]) + 1;
  }
}

/** Dépense de l'or pour monter la forteresse d'une province de la Couronne. Retourne la ligne de chronique, ou null. */
export function fortify(c: CampaignState, id: ProvinceId): string | null {
  const cost = fortCost(c, id);
  if (cost === null || !canFortify(c, id)) return null;
  c.gold -= cost;
  c.fort[id] = fortOf(c, id) + 1;
  for (const m of c.missions) if (m.kind === "fortress") m.progress++;
  return say(c, `${PROVINCES[id].name} : forteresse de niveau ${c.fort[id]} (+${FORT_TROOPS} troupes en défense).`);
}

/** Dépense de l'or pour une case de renforts automatiques de plus dans toutes les batailles de la campagne. */
export function buyAutoSlot(c: CampaignState): string | null {
  const cost = autoSlotCost(c);
  if (cost === null || !canBuyAutoSlot(c)) return null;
  c.gold -= cost;
  c.autoSlots++;
  return say(c, `Renforts automatiques : ${c.autoSlots} case${c.autoSlots > 1 ? "s" : ""} de plus dans chaque bataille.`);
}

interface Play {
  kind: "attack" | "defend";
  target: ProvinceId;
  /** le joueur a gagné sa bataille (se retirer compte pour une défaite) */
  won: boolean;
  seconds: number;
  threat?: Threat;
}

function applyPlay(c: CampaignState, p: Play, r: TurnReport): void {
  const name = PROVINCES[p.target].name;
  const tier = tierOf(p.target);
  if (p.kind === "attack") {
    const was = c.owner[p.target];
    const from = PROVINCES[p.target].neighbors.filter((n) => c.owner[n] === CROWN).sort((a, b) => PROVINCES[b].area - PROVINCES[a].area)[0];
    r.events.push({ attacker: CROWN, from, target: p.target, defender: was, won: p.won, played: true });
    if (p.won) {
      c.owner[p.target] = CROWN;
      c.gold += LOOT[tier];
      r.reward += LOOT[tier];
      const h = HISTORY[p.target];
      r.lines.push(say(c, `${name} rejoint la Couronne (prise ${toFaction(FACTIONS[was].name)}, +${LOOT[tier]} or).${h ? ` Dans l'histoire : ${h.joined}.` : ""}`));
      if (goalReached(c)) c.status = "won";
    } else {
      r.lines.push(say(c, `${name} : l'attaque de la Couronne est repoussée.`));
    }
    return;
  }
  const t = p.threat!;
  const atk = FACTIONS[t.attacker].name;
  r.events.push({ attacker: t.attacker, from: t.from, target: p.target, defender: CROWN, won: !p.won, played: true });
  if (p.won) {
    c.gold += DEFENSE_LOOT;
    r.reward += DEFENSE_LOOT;
    r.lines.push(say(c, `${name} tient bon contre ${lcFirst(atk)} (+${DEFENSE_LOOT} or).`));
  } else {
    c.owner[p.target] = t.attacker;
    r.lines.push(say(c, `${name} tombe : ${atk} ${agree(atk, "l'emporte", "l'emportent")} malgré ta défense.`));
  }
}

function resolveThreat(c: CampaignState, t: Threat, r: TurnReport): void {
  const { attacker, target } = t;
  const defender = c.owner[target];
  if (defender === attacker) return; // déjà à lui
  const from = c.owner[t.from] === attacker ? t.from : bestFrom(c, attacker, target);
  if (!from) return; // il n'a plus de province au contact : l'attaque tombe à l'eau
  const won = resolveBattle(c, attacker, defender, target, Math.floor(draw(c) * 100000), AUTO_DEFENSE) === "attacker";
  r.events.push({ attacker, from, target, defender, won, played: false });
  const name = PROVINCES[target].name;
  if (won) {
    c.owner[target] = attacker;
    r.lines.push(say(c, `${name} : ${FACTIONS[attacker].name} ${agree(FACTIONS[attacker].name, "l'emporte", "l'emportent")} contre ${lcFirst(FACTIONS[defender].name)}.`));
  } else {
    r.lines.push(say(c, `${name} : ${FACTIONS[defender].name} ${agree(FACTIONS[defender].name, "repousse", "repoussent")} ${lcFirst(FACTIONS[attacker].name)}.`));
  }
}

/**
 * Fin d'un tour : applique la bataille du joueur, résout les attaques annoncées que personne n'a jouées, verse le
 * revenu, évalue les missions, fait avancer l'année et annonce les attaques du tour suivant.
 */
function advance(c: CampaignState, play?: Play): TurnReport {
  const r: TurnReport = { lines: [], events: [], income: 0, reward: 0, completed: [] };
  if (play) applyPlay(c, play, r);
  if (c.status === "won") return r;

  for (const t of c.threats) if (t !== play?.threat) resolveThreat(c, t, r);

  r.income = incomeOf(c);
  c.gold += r.income;
  r.lines.push(say(c, `Revenu des provinces : +${r.income} or.`));

  const { completed, expired } = evaluateMissions(c, r.events, play && { kind: play.kind, won: play.won, seconds: play.seconds });
  for (const m of completed) {
    r.reward += m.reward;
    r.completed.push(m);
    r.lines.push(say(c, `Mission accomplie : ${m.text} (+${m.reward} or).`));
  }
  for (const m of expired) r.lines.push(say(c, `Mission expirée : ${m.text}.`));

  c.turn++;
  const era = eraIndex(c.reach);
  c.reach = Math.max(c.reach, provincesOf(c, CROWN).length);
  if (eraIndex(c.reach) > era) {
    const e = eraOf(c);
    r.lines.push(say(c, `Nouvelle époque : ${e.name}. ${e.perk}`));
  }
  if (provincesOf(c, CROWN).length === 0) c.status = "lost";
  else if (goalReached(c)) c.status = "won";
  if (c.status === "playing") {
    growAiForts(c);
    fillMissions(c);
    c.threats = planThreats(c);
  } else c.threats = [];
  return r;
}

/** Le joueur a livré une bataille d'attaque. `won` faux : défaite ou retraite. */
export const playAttack = (c: CampaignState, target: ProvinceId, won: boolean, seconds: number): TurnReport =>
  advance(c, { kind: "attack", target, won, seconds });

/** Le joueur a livré la défense d'une province menacée. `won` faux : défaite ou retraite. */
export const playDefense = (c: CampaignState, threat: Threat, won: boolean, seconds: number): TurnReport =>
  advance(c, { kind: "defend", target: threat.target, won, seconds, threat });

/** Le joueur passe son tour : toutes les attaques annoncées sont résolues sans lui. */
export const passTurn = (c: CampaignState): TurnReport => advance(c);

/* ---------- sauvegarde ---------- */

export const serialize = (c: CampaignState): string => JSON.stringify(c);

/** Relit une sauvegarde (en complétant les champs des anciennes versions) ; null si absente, illisible ou périmée. */
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
    if (!ok) return null;
    c.threats ??= [];
    c.fort ??= {};
    c.gold ??= 0;
    c.autoSlots ??= 0;
    c.reach ??= provincesOf(c, CROWN).length;
    c.reach0 ??= Math.min(c.reach, 3);
    c.missions ??= [];
    c.nextMissionId ??= 1;
    if (c.status === "playing" && c.missions.length === 0) fillMissions(c);
    return c;
  } catch {
    return null;
  }
}

