import { findPath, send } from "./sim";
import type { GameState, OwnerId } from "./types";

/** Seuils proposés au joueur ; 0 = désactivé. */
export const AUTO_THRESHOLDS = [0, 10, 20, 30] as const;

/**
 * Part des territoires du joueur qu'il peut automatiser (le plafond monte avec l'empire). Mesuré avec un joueur
 * lent (victoire sans renforts ~30 %) : 1/3 donne 92 % (aucune borne en pratique), 1/6 donne 75-83 %, 1/8 54-63 %.
 */
export const AUTO_RATIO = 1 / 6;

const AUTO_INTERVAL = 1; // secondes entre deux passages

/** Nombre de territoires automatisables pour `owned` territoires. */
export const autoCap = (owned: number, ratio: number = AUTO_RATIO): number => Math.floor(owned * ratio);

const onFront = (s: GameState, owner: OwnerId, id: number): boolean =>
  s.links[id].some((n) => s.bases[n].owner !== owner);

export interface AutoStatus {
  /** cochés, qui nous appartiennent et dans le plafond */
  flagged: number[];
  /** parmi eux, ceux de l'arrière : les seuls qui envoient */
  active: number[];
  cap: number;
}

/**
 * Le joueur coche les territoires à automatiser. Seuls les `autoCap` premiers cochés comptent (si l'empire
 * rétrécit, les derniers cochés se mettent en veille) et seuls ceux de l'arrière envoient : un territoire du
 * front reçoit les renforts.
 */
export function autoStatus(
  s: GameState,
  owner: OwnerId,
  flags: readonly number[],
  ratio: number = AUTO_RATIO,
): AutoStatus {
  const owned = s.bases.filter((b) => b.owner === owner).length;
  const cap = autoCap(owned, ratio);
  const flagged = flags.filter((id) => s.bases[id]?.owner === owner).slice(0, cap);
  return { flagged, active: flagged.filter((id) => !onFront(s, owner, id)), cap };
}

/**
 * Renforts automatiques : un territoire coché de l'arrière qui atteint le seuil envoie toutes ses troupes sauf
 * une vers le front le plus proche, en passant par nos territoires. C'est un passif d'aide à la gestion des
 * frontières : il ne choisit jamais d'attaquer.
 *
 * Mesuré avec un joueur lent : sans plafond les renforts font passer la victoire de ~30 % à 95 % (ils vident en
 * continu les territoires de l'arrière qui, pleins, ne produisent plus). Le plafond en part de territoires est le
 * levier ; limiter les convois, les ralentir ou les taxer ne change presque rien.
 */
export function makeAutoReinforce(
  owner: OwnerId,
  getThreshold: () => number,
  getFlags: () => readonly number[],
  ratio: number = AUTO_RATIO,
): (s: GameState, dt: number) => void {
  let acc = 0;
  return (s, dt) => {
    acc += dt;
    if (acc < AUTO_INTERVAL) return;
    acc = 0;
    const threshold = getThreshold();
    if (threshold <= 0) return;

    const fronts = s.bases.filter((b) => b.owner === owner && onFront(s, owner, b.id));
    if (fronts.length === 0) return;

    for (const id of autoStatus(s, owner, getFlags(), ratio).active) {
      const from = s.bases[id];
      if (from.troops < threshold) continue;
      let best: { id: number; length: number } | null = null;
      for (const front of fronts) {
        const route = findPath(s, from.id, front.id, owner);
        if (route && (!best || route.length < best.length)) best = { id: front.id, length: route.length };
      }
      if (best) send(s, from.id, best.id, owner, (from.troops - 1) / from.troops);
    }
  };
}
