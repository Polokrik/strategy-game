import { PROVINCES, tierOf } from "./france";
import { CROWN } from "./france";
import { type CampaignState, type Mission, type MissionKind, type TurnEvent, draw, provincesOf, targets } from "./state";

/** Missions actives en même temps. */
export const ACTIVE_MISSIONS = 3;
const KINDS: MissionKind[] = ["take", "hold", "defend", "fast", "fortress"];

function make(c: CampaignState, kind: MissionKind): Omit<Mission, "id"> | null {
  const base = { progress: 0, since: c.turn };
  switch (kind) {
    case "take": {
      const taken = new Set(c.missions.filter((m) => m.kind === "take").map((m) => m.target));
      const options = targets(c).filter((id) => !taken.has(id));
      if (options.length === 0) return null;
      const target = options[Math.floor(draw(c) * options.length)];
      return { ...base, kind, target, text: `Prends ${PROVINCES[target].name}`, reward: 30 + 20 * tierOf(target), expires: c.turn + 8 };
    }
    case "hold": {
      const n = provincesOf(c, CROWN).length + 2;
      return { ...base, kind, n, text: `Tiens ${n} provinces`, reward: 40 + 6 * n, expires: c.turn + 10 };
    }
    case "defend":
      return { ...base, kind, n: 1, text: "Défends en personne une province menacée", reward: 45, expires: c.turn + 10 };
    case "fast":
      return { ...base, kind, text: "Gagne une bataille en moins de 90 secondes", reward: 40, expires: c.turn + 10 };
    case "fortress":
      return { ...base, kind, n: 2, text: "Construis 2 forteresses", reward: 30, expires: c.turn + 10 };
  }
}

/** Complète la liste jusqu'à ACTIVE_MISSIONS, en variant les types. */
export function fillMissions(c: CampaignState): void {
  for (let tries = 0; c.missions.length < ACTIVE_MISSIONS && tries < 12; tries++) {
    const free = KINDS.filter((k) => !c.missions.some((m) => m.kind === k));
    if (free.length === 0) return;
    const kind = free[Math.floor(draw(c) * free.length)];
    const m = make(c, kind);
    if (m) c.missions.push({ ...m, id: c.nextMissionId++ });
  }
}

export interface Played {
  kind: "attack" | "defend";
  won: boolean;
  seconds: number;
}

/**
 * Fin de tour : met à jour les missions. Les missions accomplies rapportent leur or tout de suite ; celles dont
 * le délai est passé disparaissent sans pénalité. Retourne les accomplies et les expirées.
 */
export function evaluateMissions(
  c: CampaignState,
  events: TurnEvent[],
  played?: Played,
): { completed: Mission[]; expired: Mission[] } {
  const completed: Mission[] = [];
  const expired: Mission[] = [];
  // une défense que le joueur a jouée et gagnée ; les défenses automatiques ne comptent pas (sinon la mission paie sans rien faire)
  const heldNow = events.filter((e) => e.played && e.defender === CROWN && !e.won).length;
  for (const m of [...c.missions]) {
    let done = false;
    if (m.kind === "take") done = c.owner[m.target!] === CROWN;
    else if (m.kind === "hold") (m.progress = provincesOf(c, CROWN).length), (done = m.progress >= m.n!);
    else if (m.kind === "defend") (m.progress += heldNow), (done = m.progress >= m.n!);
    else if (m.kind === "fast") done = !!played && played.won && played.seconds < 90;
    else if (m.kind === "fortress") done = m.progress >= m.n!; // le compteur monte quand on construit

    if (done) {
      c.gold += m.reward;
      c.missions = c.missions.filter((x) => x.id !== m.id);
      completed.push(m);
    } else if (c.turn >= m.expires) {
      c.missions = c.missions.filter((x) => x.id !== m.id);
      expired.push(m);
    }
  }
  return { completed, expired };
}
