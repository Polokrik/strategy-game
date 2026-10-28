import { type Base, type Edge, type GameState, type OwnerId, NEUTRAL, type Squad } from "./types";

export const SQUAD_SPEED = 14; // unités monde / seconde
export const PRODUCTION_PER_CAPACITY = 0.025; // troupes / s / point de capacité
export const SEND_RATIO = 0.5;
export const FIGHT_FLASH = 0.8; // secondes d'affichage d'une interception

/** Fatigue d'empire : au-delà de FATIGUE_FREE territoires, chacun produit un peu moins (anti-boule de neige). */
export const FATIGUE_FREE = 4;
export const FATIGUE_RATE = 0.05;
export const fatigue = (territories: number): number =>
  1 / (1 + FATIGUE_RATE * Math.max(0, territories - FATIGUE_FREE));

/**
 * Prolongation : après OVERTIME_START secondes, le plafond de troupes de chaque territoire rétrécit
 * et l'excédent fond, pour qu'aucune impasse ne dure. Les parties visent 2 à 4 minutes.
 */
export const OVERTIME_START = 300;
export const OVERTIME_SPAN = 150;
export const OVERTIME_FLOOR = 0.35;
const OVERTIME_DECAY = 0.3; // part de l'excédent perdue par seconde
export const overtime = (time: number): number =>
  Math.max(OVERTIME_FLOOR, 1 - Math.max(0, time - OVERTIME_START) / OVERTIME_SPAN);

const gap = (a: Base, b: Base): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Sans `edges`, tous les territoires sont voisins (pratique pour les tests). */
export function createState(bases: Omit<Base, "id">[], edges?: Edge[]): GameState {
  const nodes = bases.map((b, id) => ({ ...b, id }));
  const links: number[][] = nodes.map(() => []);
  const all: Edge[] = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) all.push([i, j]);
  for (const [a, b] of edges ?? all) {
    links[a].push(b);
    links[b].push(a);
  }
  return {
    bases: nodes,
    links,
    shapes: [],
    seaLinks: [],
    squads: [],
    fights: [],
    time: 0,
    nextSquadId: 1,
    productionMul: {},
    speedMul: {},
    winner: null,
  };
}

export interface Route {
  /** territoires à parcourir, sans le départ ; le dernier est la destination */
  path: number[];
  length: number;
}

/**
 * Plus court chemin de voisin en voisin. On ne traverse que ses propres
 * territoires : un territoire ennemi ou neutre arrête la troupe.
 */
export function findPath(s: GameState, fromId: number, toId: number, owner: OwnerId): Route | null {
  const n = s.bases.length;
  const dist: number[] = Array(n).fill(Infinity);
  const prev: number[] = Array(n).fill(-1);
  const done: boolean[] = Array(n).fill(false);
  dist[fromId] = 0;

  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === toId) break;
    done[u] = true;
    if (u !== fromId && s.bases[u].owner !== owner) continue;
    for (const v of s.links[u]) {
      const d = dist[u] + gap(s.bases[u], s.bases[v]);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }

  if (!Number.isFinite(dist[toId])) return null;
  const path: number[] = [];
  for (let v = toId; v !== fromId; v = prev[v]) path.unshift(v);
  return { path, length: dist[toId] };
}

/** Envoie une partie des troupes de `fromId` vers `toId`. Retourne false si impossible. */
export function send(
  s: GameState,
  fromId: number,
  toId: number,
  owner: OwnerId,
  ratio = SEND_RATIO,
): boolean {
  if (s.winner !== null || fromId === toId) return false;
  const from = s.bases[fromId];
  if (!from || !s.bases[toId] || from.owner !== owner) return false;
  const count = Math.floor(from.troops * ratio);
  if (count < 1) return false;
  const route = findPath(s, fromId, toId, owner);
  if (!route) return false;
  from.troops -= count;
  s.squads.push({
    id: s.nextSquadId++,
    owner,
    count,
    from: fromId,
    path: route.path,
    progress: 0,
    x: from.x,
    y: from.y,
  });
  return true;
}

function arrive(base: Base, squad: Squad): void {
  if (base.owner === squad.owner) {
    base.troops += squad.count;
    return;
  }
  base.troops -= squad.count;
  if (base.troops < 0) {
    base.owner = squad.owner;
    base.troops = -base.troops;
  }
}

/** Interception : deux troupes ennemies qui se croisent sur une même frontière s'annulent. */
function fight(s: GameState, a: Squad, b: Squad, x: number, y: number): void {
  s.fights.push({ x, y, t: s.time });
  const diff = a.count - b.count;
  if (diff > 0) {
    a.count = diff;
    b.count = 0;
  } else if (diff < 0) {
    b.count = -diff;
    a.count = 0;
  } else {
    a.count = 0;
    b.count = 0;
  }
}

export function step(s: GameState, dt: number): void {
  if (s.winner !== null) return;
  s.time += dt;
  s.fights = s.fights.filter((f) => s.time - f.t < FIGHT_FLASH);

  const owned: Record<OwnerId, number> = {};
  for (const b of s.bases) if (b.owner !== NEUTRAL) owned[b.owner] = (owned[b.owner] ?? 0) + 1;
  const squeeze = overtime(s.time);
  for (const b of s.bases) {
    if (b.owner === NEUTRAL) continue;
    const cap = b.capacity * squeeze;
    if (b.troops > cap) {
      b.troops -= (b.troops - cap) * Math.min(1, OVERTIME_DECAY * dt);
    } else if (b.troops < cap) {
      const rate = b.capacity * PRODUCTION_PER_CAPACITY * (s.productionMul[b.owner] ?? 1) * fatigue(owned[b.owner]);
      b.troops = Math.min(cap, b.troops + rate * dt);
    }
  }

  for (const q of s.squads) {
    const from = s.bases[q.from];
    const to = s.bases[q.path[0]];
    const len = gap(from, to);
    q.progress += SQUAD_SPEED * (s.speedMul[q.owner] ?? 1) * dt;
    if (q.progress < len) {
      const f = q.progress / len;
      q.x = from.x + (to.x - from.x) * f;
      q.y = from.y + (to.y - from.y) * f;
      continue;
    }
    q.x = to.x;
    q.y = to.y;
    // un territoire qui a changé de main en cours de route arrête la troupe
    if (q.path.length === 1 || to.owner !== q.owner) {
      arrive(to, q);
      q.count = 0;
    } else {
      q.from = to.id;
      q.path.shift();
      q.progress = 0;
    }
  }

  // deux troupes ennemies en sens inverse sur la même frontière se rencontrent quand leurs trajets se rejoignent
  for (let i = 0; i < s.squads.length; i++) {
    const a = s.squads[i];
    if (a.count <= 0) continue;
    for (let j = i + 1; j < s.squads.length; j++) {
      const b = s.squads[j];
      if (b.count <= 0 || a.owner === b.owner) continue;
      if (a.from !== b.path[0] || a.path[0] !== b.from) continue;
      const len = gap(s.bases[a.from], s.bases[a.path[0]]);
      if (a.progress + b.progress < len) continue;
      fight(s, a, b, a.x, a.y);
      if (a.count <= 0) break;
    }
  }
  s.squads = s.squads.filter((q) => q.count > 0);

  const alive = new Set<OwnerId>();
  for (const b of s.bases) if (b.owner !== NEUTRAL) alive.add(b.owner);
  for (const q of s.squads) alive.add(q.owner);
  if (alive.size === 1) s.winner = [...alive][0];
}
