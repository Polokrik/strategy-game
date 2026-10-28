import { type Route, findPath, overtime, send } from "./sim";
import { type Base, type GameState, type OwnerId, NEUTRAL } from "./types";

/** Nombre maximum de bases qui s'unissent sur une même cible. */
const MAX_SOURCES = 6;

/** Même moteur pour toutes les personnalités : seuls ces paramètres changent. */
export interface AiParams {
  owner: OwnerId;
  /** secondes entre deux décisions */
  interval: number;
  /** troupes minimum dans une base avant d'attaquer */
  attackThreshold: number;
  /** part des troupes envoyées */
  sendRatio: number;
  /** marge exigée sur la défense de la cible */
  margin: number;
  /** nombre maximum d'attaques lancées par décision (un humain ne lance pas tout en même temps) */
  maxSends: number;
  /** multiplicateur de production de l'IA (< 1 = handicap) */
  productionMul: number;
  /** ajouté au score des cibles neutres : négatif = préfère les neutres, positif = préfère les ennemis */
  neutralBias: number;
  /** poids du rapport troupes/capacité de la cible : positif = vise les bases affaiblies */
  weakness: number;
  /** bonus de ciblage sur les territoires du camp qui domine (anti-boule de neige) */
  leaderFocus: number;
}

export type Personality = Omit<AiParams, "owner">;

export const BALANCED: Personality = {
  interval: 2.2,
  attackThreshold: 14,
  sendRatio: 0.6,
  margin: 4,
  maxSends: 1,
  productionMul: 0.8,
  neutralBias: 0,
  weakness: 0,
  leaderFocus: 0,
};

/** Frappe tôt et fort, préfère les adversaires aux neutres. */
export const AGGRESSIVE: Personality = {
  interval: 1.8,
  attackThreshold: 10,
  sendRatio: 0.75,
  margin: 1,
  maxSends: 1,
  productionMul: 0.85,
  neutralBias: 15,
  weakness: 0,
  leaderFocus: 6,
};

/** Accumule, s'étend sur les neutres, n'attaque qu'avec une grosse avance. */
export const DEFENSIVE: Personality = {
  interval: 2.8,
  attackThreshold: 22,
  sendRatio: 0.4,
  margin: 6,
  maxSends: 1,
  productionMul: 0.9,
  neutralBias: -10,
  weakness: 0,
  leaderFocus: 10,
};

/** Cherche la base la plus affaiblie, quel que soit son camp. */
export const OPPORTUNIST: Personality = {
  interval: 2.0,
  attackThreshold: 12,
  sendRatio: 0.6,
  margin: 3,
  maxSends: 1,
  productionMul: 0.8,
  neutralBias: 0,
  weakness: 1.5,
  leaderFocus: 10,
};

export function makeAi(params: AiParams): (s: GameState, dt: number) => void {
  let acc = 0;
  return (s, dt) => {
    s.productionMul[params.owner] = params.productionMul;
    acc += dt;
    if (acc < params.interval) return;
    acc = 0;

    // Pour chaque cible, on réunit les bases prêtes (les plus proches d'abord) jusqu'à
    // dépasser sa défense : un humain enchaîne plusieurs glissers sur la même base.
    // le camp qui domine (s'il n'est pas nous) est une cible prioritaire
    const owned = new Map<OwnerId, number>();
    for (const b of s.bases) if (b.owner !== NEUTRAL) owned.set(b.owner, (owned.get(b.owner) ?? 0) + 1);
    let leader: OwnerId = NEUTRAL;
    for (const [o, n] of owned) if (leader === NEUTRAL || n > owned.get(leader)!) leader = o;
    const leads = leader !== params.owner && (owned.get(leader) ?? 0) > (owned.get(params.owner) ?? 0);

    const plans: { sources: number[]; to: number; score: number }[] = [];
    // en prolongation le plafond rétrécit : le seuil d'attaque suit, sinon plus personne n'attaque
    const squeeze = overtime(s.time);
    const margin = Math.max(1, params.margin * squeeze);
    const ready = s.bases.filter(
      (b) => b.owner === params.owner && b.troops >= Math.min(params.attackThreshold, b.capacity * squeeze * 0.8),
    );
    for (const to of s.bases) {
      if (to.owner === params.owner) continue;
      const contributors = ready
        .map((from) => ({ from, route: findPath(s, from.id, to.id, params.owner) }))
        .filter((c): c is { from: Base; route: Route } => c.route !== null)
        .sort((a, b) => a.route.length - b.route.length)
        .slice(0, MAX_SOURCES);
      let total = 0;
      const sources: number[] = [];
      for (const c of contributors) {
        total += Math.floor(c.from.troops * params.sendRatio);
        sources.push(c.from.id);
        if (total > to.troops + margin) break;
      }
      if (total <= to.troops + margin) continue;
      const score =
        to.troops +
        contributors[0].route.length * 0.4 +
        (to.owner === NEUTRAL ? params.neutralBias : 0) +
        params.weakness * (to.troops / to.capacity) * 20 -
        (leads && to.owner === leader ? params.leaderFocus : 0);
      plans.push({ sources, to: to.id, score });
    }
    plans.sort((a, b) => a.score - b.score);

    const used = new Set<number>();
    let launched = 0;
    for (const plan of plans) {
      if (launched >= params.maxSends) break;
      if (plan.sources.some((id) => used.has(id))) continue;
      for (const id of plan.sources) {
        send(s, id, plan.to, params.owner, params.sendRatio);
        used.add(id);
      }
      launched++;
    }
  };
}
