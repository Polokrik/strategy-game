import { type Base, type GameState, type OwnerId, NEUTRAL, type Squad } from "./types";

export const SQUAD_SPEED = 14; // unités monde / seconde
export const PRODUCTION_PER_CAPACITY = 0.025; // troupes / s / point de capacité
export const INTERCEPT_RADIUS = 2.5;
export const SEND_RATIO = 0.5;
export const FIGHT_FLASH = 0.8; // secondes d'affichage d'une interception

export type Edge = [number, number];

/** Relie toutes les paires de nœuds distantes d'au plus `maxDist`. */
export function autoEdges(nodes: { x: number; y: number }[], maxDist: number): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) <= maxDist) edges.push([i, j]);
  return edges;
}

/** Sans `edges`, toutes les paires de nœuds sont reliées (lignes droites). */
export function createState(bases: Omit<Base, "id">[], edges?: Edge[]): GameState {
  const nodes = bases.map((b, id) => ({ ...b, id }));
  const links: number[][] = nodes.map(() => []);
  for (const [a, b] of edges ?? autoEdges(nodes, Infinity)) {
    links[a].push(b);
    links[b].push(a);
  }
  return {
    bases: nodes,
    links,
    squads: [],
    fights: [],
    time: 0,
    nextSquadId: 1,
    productionMul: {},
    winner: null,
  };
}

export interface Route {
  /** nœuds à parcourir, sans le départ ; le dernier est la destination */
  path: number[];
  length: number;
}

/**
 * Plus court chemin sur les routes. On ne peut traverser que des carrefours
 * ou ses propres bases : une base ennemie ou neutre arrête la troupe.
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
    const node = s.bases[u];
    if (u !== fromId && !node.junction && node.owner !== owner) continue;
    for (const v of s.links[u]) {
      const d = dist[u] + Math.hypot(node.x - s.bases[v].x, node.y - s.bases[v].y);
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
  const to = s.bases[toId];
  if (!from || !to || to.junction || from.owner !== owner) return false;
  const count = Math.floor(from.troops * ratio);
  if (count < 1) return false;
  const route = findPath(s, fromId, toId, owner);
  if (!route) return false;
  from.troops -= count;
  s.squads.push({ id: s.nextSquadId++, owner, count, path: route.path, x: from.x, y: from.y });
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

/** Interception : deux troupes ennemies qui se croisent s'annulent mutuellement. */
function fight(s: GameState, a: Squad, b: Squad): void {
  s.fights.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: s.time });
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

  for (const b of s.bases) {
    if (b.owner === NEUTRAL || b.troops >= b.capacity) continue;
    const rate = b.capacity * PRODUCTION_PER_CAPACITY * (s.productionMul[b.owner] ?? 1);
    b.troops = Math.min(b.capacity, b.troops + rate * dt);
  }

  for (const q of s.squads) {
    const node = s.bases[q.path[0]];
    const dx = node.x - q.x;
    const dy = node.y - q.y;
    const dist = Math.hypot(dx, dy);
    const move = SQUAD_SPEED * dt;
    if (move < dist) {
      q.x += (dx / dist) * move;
      q.y += (dy / dist) * move;
      continue;
    }
    q.x = node.x;
    q.y = node.y;
    const last = q.path.length === 1;
    // une base qui a changé de main en cours de route arrête la troupe
    if (last || (!node.junction && node.owner !== q.owner)) {
      arrive(node, q);
      q.count = 0;
    } else {
      q.path.shift();
    }
  }

  for (let i = 0; i < s.squads.length; i++) {
    const a = s.squads[i];
    if (a.count <= 0) continue;
    for (let j = i + 1; j < s.squads.length; j++) {
      const b = s.squads[j];
      if (b.count <= 0 || a.owner === b.owner) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < INTERCEPT_RADIUS) {
        fight(s, a, b);
        if (a.count <= 0) break;
      }
    }
  }
  s.squads = s.squads.filter((q) => q.count > 0);

  const alive = new Set<OwnerId>();
  for (const b of s.bases) if (b.owner !== NEUTRAL) alive.add(b.owner);
  for (const q of s.squads) alive.add(q.owner);
  if (alive.size === 1) s.winner = [...alive][0];
}
