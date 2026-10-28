import { findPath, send } from "./sim";
import type { GameState, OwnerId } from "./types";

/** Seuils proposés au joueur ; 0 = désactivé. */
export const AUTO_THRESHOLDS = [0, 10, 20, 30] as const;

const AUTO_INTERVAL = 1; // secondes entre deux passages

/**
 * Renforts automatiques : un territoire de l'arrière (aucun voisin qui ne soit pas à nous) qui atteint
 * le seuil envoie tout sauf une troupe vers le front le plus proche, en passant par nos territoires.
 * C'est un passif d'aide à la gestion des frontières : il ne choisit jamais d'attaquer.
 */
export function makeAutoReinforce(
  owner: OwnerId,
  getThreshold: () => number,
): (s: GameState, dt: number) => void {
  let acc = 0;
  return (s, dt) => {
    acc += dt;
    if (acc < AUTO_INTERVAL) return;
    acc = 0;
    const threshold = getThreshold();
    if (threshold <= 0) return;

    const onFront = (id: number) => s.links[id].some((n) => s.bases[n].owner !== owner);
    const fronts = s.bases.filter((b) => b.owner === owner && onFront(b.id));
    if (fronts.length === 0) return;

    for (const from of s.bases) {
      if (from.owner !== owner || from.troops < threshold || onFront(from.id)) continue;
      let best: { id: number; length: number } | null = null;
      for (const front of fronts) {
        const route = findPath(s, from.id, front.id, owner);
        if (route && (!best || route.length < best.length)) best = { id: front.id, length: route.length };
      }
      if (best) send(s, from.id, best.id, owner, (from.troops - 1) / from.troops);
    }
  };
}
