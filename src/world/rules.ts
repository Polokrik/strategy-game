import { formatYear, nextYear } from "./calendar";
import {
  NEW_GAME_YEAR,
  REGIONS,
  type RegionId,
  SAVE_VERSION,
  type SocietyId,
  THEATRE,
  type WorldEvent,
  type WorldState,
  draw,
  regionsOf,
  societies,
  societyName,
  troopsOf,
} from "./state";

/*
 * Règles de la tranche 1 de la campagne Monde. Tout ce qui est chiffré ici est une HYPOTHÈSE D'ÉQUILIBRAGE,
 * pas une donnée historique : les « troupes » sont une abstraction (ni effectifs réels, ni types d'unités).
 * Les mêmes règles valent pour le joueur et pour les autres sociétés.
 */

export const RIVALS = 4;
const LOG_KEEP = 40;

/** Troupes qu'une région peut entretenir : un socle, plus une part proportionnelle à sa surface. */
export const capacityOf = (id: RegionId): number => Math.round(30 + REGIONS[id].area * 0.4);
const NEUTRAL_START = 0.2;
const SOCIETY_START = 1;
/** Part de l'écart à la capacité regagnée à chaque tour (les communautés locales plafonnent à NEUTRAL_CAP de la capacité). */
const NEUTRAL_CAP = 0.35;
const GROWTH = 0.35;
const NEUTRAL_GROWTH = 0.1;

/** Puissance d'une société : 1 pour tous en tranche 1. Les savoirs et l'équipement (tranche 2) la feront varier. */
export const powerOf = (_w: WorldState, _s: SocietyId | null): number => 1;

export const MAX_CHANCE = 0.9;
export const MIN_CHANCE = 0.05;
const STEEPNESS = 1.6;

/**
 * Chance de prendre une région : ne dépend que du rapport de forces (troupes envoyées × puissance, contre
 * défenseurs × puissance). À forces égales 50 %, à 2 contre 1 environ 75 %, à 10 contre 1 le plafond de 90 % :
 * rien n'est jamais garanti. C'est la probabilité réellement tirée en résolution automatique.
 */
export function winChance(sent: number, defenders: number, attackPower = 1, defensePower = 1): number {
  if (sent <= 0) return 0;
  const ratio = (sent * attackPower) / (Math.max(1, defenders) * defensePower);
  const p = ratio ** STEEPNESS / (1 + ratio ** STEEPNESS);
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, p));
}

export function chanceOf(w: WorldState, attacker: SocietyId, target: RegionId, sent: number): number {
  return winChance(sent, w.troops[target], powerOf(w, attacker), powerOf(w, w.owner[target]));
}

/** Troupes qu'une société peut envoyer : tout son territoire y contribue, en laissant un gardien par région. */
export const available = (w: WorldState, s: SocietyId): number => regionsOf(w, s).reduce((n, id) => n + Math.max(0, w.troops[id] - 1), 0);

/** Régions qu'une société peut attaquer : voisines de son territoire. */
export function targetsOf(w: WorldState, s: SocietyId): RegionId[] {
  const out = new Set<RegionId>();
  for (const id of regionsOf(w, s)) for (const n of REGIONS[id].neighbors) if (w.owner[n] !== s) out.add(n);
  return [...out];
}

export function newWorld(start: RegionId, seed = (Math.random() * 2 ** 31) | 0): WorldState {
  if (!REGIONS[start]) throw new Error(`région inconnue : ${start}`);
  const w: WorldState = {
    version: SAVE_VERSION,
    theatre: THEATRE.id,
    year: NEW_GAME_YEAR,
    turn: 0,
    seed,
    player: start,
    rivals: [],
    owner: Object.fromEntries(THEATRE.regions.map((r) => [r.id, null])),
    troops: Object.fromEntries(THEATRE.regions.map((r) => [r.id, Math.round(capacityOf(r.id) * NEUTRAL_START)])),
    status: "playing",
    log: [],
  };
  // les autres sociétés naissent loin du joueur et loin les unes des autres
  const homes = [start];
  const far = (id: RegionId) => Math.min(...homes.map((h) => Math.hypot(REGIONS[id].x - REGIONS[h].x, REGIONS[id].y - REGIONS[h].y)));
  for (let i = 0; i < RIVALS; i++) {
    const free = THEATRE.regions.map((r) => r.id).filter((id) => !homes.includes(id));
    free.sort((a, b) => far(b) + draw(w) * 6 - (far(a) + draw(w) * 6));
    homes.push(free[0]);
  }
  w.rivals = homes.slice(1);
  for (const h of homes) {
    w.owner[h] = h;
    w.troops[h] = Math.round(capacityOf(h) * SOCIETY_START);
  }
  say(w, `${formatYear(w.year)} : ton peuple vit ici (${REGIONS[start].name}). Autour, des communautés sans pouvoir commun.`);
  return w;
}

function say(w: WorldState, line: string): string {
  w.log.push(line);
  if (w.log.length > LOG_KEEP) w.log.splice(0, w.log.length - LOG_KEEP);
  return line;
}

/** Retire `n` troupes à une société, au prorata de ce que chaque région peut donner. */
function withdraw(w: WorldState, s: SocietyId, n: number): void {
  const ids = regionsOf(w, s).sort((a, b) => w.troops[b] - w.troops[a]);
  const total = available(w, s);
  let left = n;
  for (const id of ids) {
    const take = Math.min(left, Math.max(0, w.troops[id] - 1), Math.ceil((n * Math.max(0, w.troops[id] - 1)) / total));
    w.troops[id] -= take;
    left -= take;
  }
  for (const id of ids) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, w.troops[id] - 1));
    w.troops[id] -= take;
    left -= take;
  }
}

/**
 * Applique une attaque dont l'issue est connue (tirée au sort en automatique, ou jouée en bataille).
 * Les pertes sont tirées avec le hasard de la partie.
 */
export function applyAttack(w: WorldState, attacker: SocietyId, target: RegionId, sent: number, won: boolean): WorldEvent {
  const defender = w.owner[target];
  const defenders = w.troops[target];
  const chance = chanceOf(w, attacker, target, sent);
  withdraw(w, attacker, sent);
  if (won) {
    const lost = Math.min(sent - 1, Math.round(defenders * (0.5 + 0.5 * draw(w))));
    w.owner[target] = attacker;
    w.troops[target] = sent - lost;
  } else {
    const lost = Math.round(sent * (0.5 + 0.4 * draw(w)));
    w.troops[target] = Math.max(1, defenders - Math.round(Math.min(defenders * 0.6, sent * 0.3) * draw(w)));
    // les survivants rentrent dans la région de l'attaquant la plus proche de la cible
    const home = regionsOf(w, attacker).sort((a, b) => dist(a, target) - dist(b, target))[0];
    if (home) w.troops[home] += sent - lost;
  }
  return { attacker, target, defender, sent, chance, won };
}

const dist = (a: RegionId, b: RegionId): number => Math.hypot(REGIONS[a].x - REGIONS[b].x, REGIONS[a].y - REGIONS[b].y);

/** Résolution automatique : l'issue est tirée avec exactement la chance affichée. */
export function autoAttack(w: WorldState, attacker: SocietyId, target: RegionId, sent: number): WorldEvent {
  const won = draw(w) < chanceOf(w, attacker, target, sent);
  return applyAttack(w, attacker, target, sent, won);
}

export const canAttack = (w: WorldState, s: SocietyId, target: RegionId, sent: number): boolean =>
  w.status === "playing" && w.owner[target] !== s && targetsOf(w, s).includes(target) && sent >= 1 && sent <= available(w, s);

function describe(w: WorldState, e: WorldEvent): string {
  const who = e.attacker === w.player ? "Ton peuple" : societyName(e.attacker);
  const from = e.defender === w.player ? " (à toi)" : "";
  return e.won
    ? `${who} prend ${REGIONS[e.target].name}${from} avec ${e.sent} troupes.`
    : `${who} échoue devant ${REGIONS[e.target].name}${from} (${e.sent} troupes envoyées).`;
}

/** Le joueur attaque. `won` vient de la bataille jouée ; absent, l'attaque est résolue automatiquement. */
export function playerAttack(w: WorldState, target: RegionId, sent: number, won?: boolean): WorldEvent | null {
  if (!canAttack(w, w.player, target, sent)) return null;
  const e = won === undefined ? autoAttack(w, w.player, target, sent) : applyAttack(w, w.player, target, sent, won);
  say(w, describe(w, e));
  return e;
}

/** Une autre société joue son tour : au plus une attaque, la plus sûre, et seulement si elle est assez favorable. */
function rivalTurn(w: WorldState, s: SocietyId): WorldEvent | null {
  const sent = Math.floor(available(w, s) * 0.6);
  if (sent < 1) return null;
  const best = targetsOf(w, s)
    .map((id) => ({ id, p: chanceOf(w, s, id, sent) }))
    .sort((a, b) => b.p - a.p || a.id.localeCompare(b.id))[0];
  if (!best || best.p < 0.6 || draw(w) > 0.7) return null;
  return autoAttack(w, s, best.id, sent);
}

export interface TurnReport {
  events: WorldEvent[];
  lines: string[];
  /** années écoulées pendant ce tour */
  years: number;
}

/** Fin du tour : les autres sociétés agissent, les troupes se refont, la date avance selon le calendrier. */
export function endTurn(w: WorldState): TurnReport {
  const r: TurnReport = { events: [], lines: [], years: 0 };
  if (w.status !== "playing") return r;
  for (const s of societies(w).sort()) {
    if (s === w.player || regionsOf(w, s).length === 0) continue;
    const e = rivalTurn(w, s);
    if (!e) continue;
    r.events.push(e);
    // la chronique ne retient que ce qui touche le joueur ou change la carte
    if (e.won || e.defender === w.player) r.lines.push(say(w, describe(w, e)));
  }
  for (const id of Object.keys(w.troops)) {
    const cap = capacityOf(id) * (w.owner[id] === null ? NEUTRAL_CAP : 1);
    if (w.troops[id] < cap) w.troops[id] += Math.ceil((cap - w.troops[id]) * (w.owner[id] === null ? NEUTRAL_GROWTH : GROWTH));
  }
  const before = w.year;
  w.year = nextYear(w.year);
  r.years = w.year - before;
  w.turn++;
  const mine = regionsOf(w, w.player).length;
  if (mine === 0) w.status = "lost";
  else if (mine === THEATRE.regions.length) w.status = "won";
  r.lines.push(say(w, `${formatYear(w.year)} : ${r.years} ans ont passé.`));
  return r;
}

export { troopsOf };

export const serialize = (w: WorldState): string => JSON.stringify(w);

/** Relit une sauvegarde Monde ; null si absente, illisible, d'une autre version ou d'un autre théâtre. */
export function deserialize(raw: string | null): WorldState | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(raw) as WorldState;
    const ids = Object.keys(REGIONS);
    const ok =
      w.version === SAVE_VERSION &&
      w.theatre === THEATRE.id &&
      Number.isInteger(w.year) &&
      Number.isInteger(w.turn) &&
      ids.every((id) => id in w.owner && Number.isFinite(w.troops?.[id])) &&
      ["playing", "won", "lost"].includes(w.status) &&
      Array.isArray(w.rivals) &&
      Array.isArray(w.log);
    return ok ? w : null;
  } catch {
    return null;
  }
}
