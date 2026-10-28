import { Delaunay } from "d3-delaunay";
import { createState } from "./sim";
import { type Base, type Edge, type GameState, type OwnerId, NEUTRAL, PLAYER, type Point } from "./types";

export const WORLD_W = 100;
export const WORLD_H = 160;

/** Part de la cellule de Voronoï réellement dessinée : le reste forme la frontière. */
const SHRINK = 0.93;

export interface MapSpec {
  seed: number;
  cols: number;
  rows: number;
  /** vrai si le point (x, y) est de la terre, faux si c'est la mer */
  land: (x: number, y: number) => boolean;
  /** camps de départ : chacun prend le territoire le plus proche du point donné */
  starts: { owner: OwnerId; x: number; y: number }[];
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deux cellules sont voisines si elles partagent un côté visible (au moins deux sommets communs). */
function sharesSide(a: Point[], b: Point[]): boolean {
  let common = 0;
  for (const p of a) if (b.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6)) common++;
  return common >= 2;
}

/**
 * Carte de territoires façon mappemonde : des points jittérés sur une grille, découpés en
 * cellules de Voronoï, dont seules les « terres » sont jouables. Les îles sont reliées au
 * continent par une liaison maritime.
 */
export function generateMap(spec: MapSpec): GameState {
  const rnd = mulberry32(spec.seed);
  const cw = WORLD_W / spec.cols;
  const ch = WORLD_H / spec.rows;
  const sites: Point[] = [];
  for (let r = 0; r < spec.rows; r++)
    for (let c = 0; c < spec.cols; c++)
      sites.push([(c + 0.5) * cw + (rnd() - 0.5) * cw * 0.6, (r + 0.5) * ch + (rnd() - 0.5) * ch * 0.6]);

  const delaunay = Delaunay.from(sites);
  const voronoi = delaunay.voronoi([0, 0, WORLD_W, WORLD_H]);
  const polygons = sites.map((_, i) => (voronoi.cellPolygon(i) as unknown as Point[] | null) ?? []);
  const land = sites.map(([x, y]) => spec.land(x, y));

  const startOf = new Map<number, OwnerId>();
  for (const st of spec.starts) {
    let best = -1;
    sites.forEach(([x, y], i) => {
      if (startOf.has(i)) return;
      if (best < 0 || Math.hypot(x - st.x, y - st.y) < Math.hypot(sites[best][0] - st.x, sites[best][1] - st.y))
        best = i;
    });
    land[best] = true;
    startOf.set(best, st.owner);
  }

  // frontières entre terres voisines
  const adj: number[][] = sites.map(() => []);
  for (let i = 0; i < sites.length; i++) {
    if (!land[i]) continue;
    for (const j of delaunay.neighbors(i)) {
      if (j > i && land[j] && sharesSide(polygons[i], polygons[j])) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  // composantes connexes ; chaque île est reliée à ce qui est déjà relié par sa paire de territoires la plus proche
  const comp: number[] = sites.map(() => -1);
  const comps: number[][] = [];
  for (let i = 0; i < sites.length; i++) {
    if (!land[i] || comp[i] >= 0) continue;
    const members: number[] = [];
    const queue = [i];
    comp[i] = comps.length;
    while (queue.length) {
      const u = queue.pop()!;
      members.push(u);
      for (const v of adj[u]) if (comp[v] < 0) ((comp[v] = comps.length), queue.push(v));
    }
    comps.push(members);
  }
  const playerStart = [...startOf].find(([, o]) => o === PLAYER)?.[0];
  const mainComp = playerStart === undefined ? 0 : comp[playerStart];
  const connected = new Set<number>(comps[mainComp]);
  const sea: Edge[] = [];
  const pending = comps.filter((_, k) => k !== mainComp);
  while (pending.length) {
    let best: { k: number; a: number; b: number; d: number } | null = null;
    pending.forEach((members, k) => {
      for (const a of members)
        for (const b of connected) {
          const d = Math.hypot(sites[a][0] - sites[b][0], sites[a][1] - sites[b][1]);
          if (!best || d < best.d) best = { k, a, b, d };
        }
    });
    const pick = best!;
    sea.push([pick.a, pick.b]);
    adj[pick.a].push(pick.b);
    adj[pick.b].push(pick.a);
    for (const m of pending[pick.k]) connected.add(m);
    pending.splice(pick.k, 1);
  }

  // nœuds du jeu = terres, numérotées dans l'ordre
  const nodeOf = new Map<number, number>();
  const bases: Omit<Base, "id">[] = [];
  const shapes: Point[][] = [];
  sites.forEach(([x, y], i) => {
    if (!land[i]) return;
    nodeOf.set(i, bases.length);
    const owner = startOf.get(i) ?? NEUTRAL;
    const capacity = owner !== NEUTRAL ? 60 : rnd() < 0.3 ? 45 : 30;
    const troops = owner !== NEUTRAL ? 20 : 8 + Math.floor((capacity - 30) / 4) + Math.floor(rnd() * 3);
    bases.push({ x, y, owner, troops, capacity });
    shapes.push(polygons[i].map(([px, py]): Point => [x + (px - x) * SHRINK, y + (py - y) * SHRINK]));
  });

  const edges: Edge[] = [];
  for (let i = 0; i < sites.length; i++)
    for (const j of adj[i]) if (j > i) edges.push([nodeOf.get(i)!, nodeOf.get(j)!]);

  const state = createState(bases, edges);
  state.shapes = shapes;
  state.seaLinks = sea.map(([a, b]): Edge => [nodeOf.get(a)!, nodeOf.get(b)!]);
  return state;
}
