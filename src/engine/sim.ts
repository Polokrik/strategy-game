import { type Base, type GameState, type OwnerId, NEUTRAL, type Squad } from "./types";

export const SQUAD_SPEED = 22; // unités monde / seconde
export const PRODUCTION_PER_CAPACITY = 0.03; // troupes / s / point de capacité
export const INTERCEPT_RADIUS = 2.5;
export const SEND_RATIO = 0.5;

export function createState(bases: Omit<Base, "id">[]): GameState {
  return {
    bases: bases.map((b, id) => ({ ...b, id })),
    squads: [],
    time: 0,
    nextSquadId: 1,
    productionMul: {},
    winner: null,
  };
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
  from.troops -= count;
  s.squads.push({ id: s.nextSquadId++, owner, count, to: toId, x: from.x, y: from.y });
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
function fight(a: Squad, b: Squad): void {
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

  for (const b of s.bases) {
    if (b.owner === NEUTRAL || b.troops >= b.capacity) continue;
    b.troops = Math.min(b.capacity, b.troops + b.capacity * PRODUCTION_PER_CAPACITY * (s.productionMul[b.owner] ?? 1) * dt);
  }

  for (const q of s.squads) {
    const target = s.bases[q.to];
    const dx = target.x - q.x;
    const dy = target.y - q.y;
    const dist = Math.hypot(dx, dy);
    const move = SQUAD_SPEED * dt;
    if (move >= dist) {
      arrive(target, q);
      q.count = 0;
    } else {
      q.x += (dx / dist) * move;
      q.y += (dy / dist) * move;
    }
  }

  for (let i = 0; i < s.squads.length; i++) {
    const a = s.squads[i];
    if (a.count <= 0) continue;
    for (let j = i + 1; j < s.squads.length; j++) {
      const b = s.squads[j];
      if (b.count <= 0 || a.owner === b.owner) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < INTERCEPT_RADIUS) {
        fight(a, b);
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
