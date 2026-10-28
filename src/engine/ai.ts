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
}

export const BALANCED: Omit<AiParams, "owner"> = {
  interval: 1.2,
  attackThreshold: 12,
  sendRatio: 0.6,
  margin: 3,
};

export function makeAi(params: AiParams): (s: GameState, dt: number) => void {
  let acc = 0;
  return (s, dt) => {
    acc += dt;
    if (acc < params.interval) return;
    acc = 0;

    for (const from of s.bases) {
      if (from.owner !== params.owner || from.troops < params.attackThreshold) continue;
      const count = Math.floor(from.troops * params.sendRatio);

      let best: { id: number; score: number } | null = null;
      for (const to of s.bases) {
        if (to.owner === params.owner) continue;
        if (to.troops + params.margin >= count) continue;
        const score = to.troops + Math.hypot(to.x - from.x, to.y - from.y) * 0.4;
        if (!best || score < best.score) best = { id: to.id, score };
      }
      if (best) send(s, from.id, best.id, params.owner, params.sendRatio);
    }
  };
}
