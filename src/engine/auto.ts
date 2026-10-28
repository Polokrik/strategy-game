import { findPath, send } from "./sim";
import type { GameState, OwnerId } from "./types";

/** Seuils proposés au joueur ; 0 = désactivé. */
export const AUTO_THRESHOLDS = [0, 10, 20, 30] as const;

/**
 * Part des territoires de la CARTE que le joueur peut automatiser, au moins un. Mesuré avec un joueur lent
 * (victoire sans renforts ~30 %), sur 25 territoires : 4 cases 92-96 % au seuil 10, 3 cases 83-88 %, 2 cases
 * 75-88 %, 1 case 46-83 % (marge ±10). Ces mesures ont conduit à 1/10, que le test en jeu a jugé trop faible
 * (12 territoires : 1 case). Retour de jeu : au moins 3 cases sur 12, donc 1/4 ; l'or achète des cases en plus.
 */
export const AUTO_RATIO = 1 / 4;

const AUTO_INTERVAL = 1; // secondes entre deux passages

/** Nombre de territoires automatisables sur une carte de `total` territoires : au moins un, même sur une petite carte. */
export const autoCap = (total: number, ratio: number = AUTO_RATIO, bonus = 0): number =>
  Math.max(1, Math.floor(total * ratio)) + bonus;

const onFront = (s: GameState, owner: OwnerId, id: number): boolean =>
  s.links[id].some((n) => s.bases[n].owner !== owner);

/** Les meilleurs territoires de l'arrière à automatiser (les plus gros d'abord), pour remplir les cases d'un seul geste. */
export function suggestFlags(s: GameState, owner: OwnerId, ratio: number = AUTO_RATIO, bonus = 0): number[] {
  return s.bases
    .filter((b) => b.owner === owner && !onFront(s, owner, b.id))
    .sort((a, b) => b.capacity - a.capacity || b.troops - a.troops)
    .slice(0, autoCap(s.bases.length, ratio, bonus))
    .map((b) => b.id);
}

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
  bonus = 0,
): AutoStatus {
  const cap = autoCap(s.bases.length, ratio, bonus);
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
  bonus = 0,
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

    for (const id of autoStatus(s, owner, getFlags(), ratio, bonus).active) {
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
