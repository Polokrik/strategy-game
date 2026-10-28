import { send } from "./sim";
import type { GameState, OwnerId } from "./types";

/** Même moteur pour toutes les personnalités : seuls ces paramètres changent (phase 2). */
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
  /** nombre maximum d'envois par décision (un humain ne lance pas tout en même temps) */
  maxSends: number;
  /** multiplicateur de production de l'IA (< 1 = handicap) */
  productionMul: number;
}

export const BALANCED: Omit<AiParams, "owner"> = {
  interval: 2.2,
  attackThreshold: 14,
  sendRatio: 0.6,
  margin: 4,
  maxSends: 1,
  productionMul: 0.8,
};

export function makeAi(params: AiParams): (s: GameState, dt: number) => void {
  let acc = 0;
  return (s, dt) => {
    s.productionMul[params.owner] = params.productionMul;
    acc += dt;
    if (acc < params.interval) return;
    acc = 0;

    const options: { from: number; to: number; score: number }[] = [];
    for (const from of s.bases) {
      if (from.owner !== params.owner || from.troops < params.attackThreshold) continue;
      const count = Math.floor(from.troops * params.sendRatio);
      for (const to of s.bases) {
        if (to.owner === params.owner || to.troops + params.margin >= count) continue;
        const score = to.troops + Math.hypot(to.x - from.x, to.y - from.y) * 0.4;
        options.push({ from: from.id, to: to.id, score });
      }
    }
    options.sort((a, b) => a.score - b.score);

    const used = new Set<number>();
    let sent = 0;
    for (const o of options) {
      if (sent >= params.maxSends) break;
      if (used.has(o.from)) continue;
      if (send(s, o.from, o.to, params.owner, params.sendRatio)) {
        used.add(o.from);
        sent++;
      }
    }
  };
}
