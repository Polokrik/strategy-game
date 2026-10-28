import { findPath, send } from "./sim";
import type { GameState, OwnerId } from "./types";

/** Seuils proposés au joueur ; 0 = désactivé. */
export const AUTO_THRESHOLDS = [0, 10, 20, 30] as const;

const AUTO_INTERVAL = 1; // secondes entre deux passages

/**
 * Les bornes qui font des renforts une aide et non un pilote automatique. Mesuré avec un joueur lent :
 * sans bornes les renforts font passer la victoire de ~30 % à 95 % (ils vident en continu les territoires
 * de l'arrière qui, pleins, ne produisent plus). Limiter le nombre de territoires automatisés est le levier ;
 * plafonner les convois ou les ralentir ne change rien.
 */
export interface AutoRules {
  /** territoires de l'arrière automatisés en même temps (les plus gros d'abord) */
  maxSources: number;
  /** part des troupes perdue en route (0 à 1) */
  tax: number;
}
export const AUTO_RULES: AutoRules = { maxSources: 2, tax: 0.25 };

const onFront = (s: GameState, owner: OwnerId, id: number): boolean =>
  s.links[id].some((n) => s.bases[n].owner !== owner);

/** Les territoires de l'arrière actuellement automatisés (pour l'affichage comme pour les envois). */
export function autoSources(s: GameState, owner: OwnerId, rules: AutoRules = AUTO_RULES): number[] {
  return s.bases
    .filter((b) => b.owner === owner && !onFront(s, owner, b.id))
    .sort((a, b) => b.capacity - a.capacity || b.troops - a.troops)
    .slice(0, rules.maxSources)
    .map((b) => b.id);
}

/**
 * Renforts automatiques : un territoire de l'arrière (aucun voisin qui ne soit pas à nous), parmi les plus gros,
 * qui atteint le seuil envoie tout sauf une troupe vers le front le plus proche, en passant par nos territoires.
 * Un quart des troupes est perdu en route. C'est un passif d'aide à la gestion des frontières : il ne choisit
 * jamais d'attaquer.
 */
export function makeAutoReinforce(
  owner: OwnerId,
  getThreshold: () => number,
  rules: AutoRules = AUTO_RULES,
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

    for (const id of autoSources(s, owner, rules)) {
      const from = s.bases[id];
      if (from.troops < threshold) continue;
      let best: { id: number; length: number } | null = null;
      for (const front of fronts) {
        const route = findPath(s, from.id, front.id, owner);
        if (route && (!best || route.length < best.length)) best = { id: front.id, length: route.length };
      }
      if (best && send(s, from.id, best.id, owner, (from.troops - 1) / from.troops)) {
        const convoy = s.squads[s.squads.length - 1];
        convoy.count = Math.max(1, Math.floor(convoy.count * (1 - rules.tax)));
      }
    }
  };
}
