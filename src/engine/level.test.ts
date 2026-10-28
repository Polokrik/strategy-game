import { describe, expect, it } from "vitest";
import { LEVELS } from "./level";
import { findPath } from "./sim";
import { NEUTRAL, PLAYER } from "./types";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe.each(LEVELS.map((l, i) => [i + 1, l] as const))("chapitre %i", (_i, def) => {
  it("annonce autant d'IA que de camps adverses", () => {
    const s = def.build();
    const owners = new Set(s.bases.filter((b) => b.owner > PLAYER).map((b) => b.owner));
    expect(def.ais.map((a) => a.owner).sort()).toEqual([...owners].sort());
  });

  it.each(SEEDS)("graine %i : carte d'un seul tenant, chaque camp a un chemin vers un adversaire", (seed) => {
    const s = def.build(seed);
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) for (const v of s.links[queue.pop()!]) if (!seen.has(v)) (seen.add(v), queue.push(v));
    expect(seen.size).toBe(s.bases.length);

    for (const from of s.bases.filter((b) => b.owner !== NEUTRAL)) {
      const reachable = s.bases.some((to) => to.owner !== from.owner && findPath(s, from.id, to.id, from.owner));
      expect(reachable, `territoire ${from.id} isolé`).toBe(true);
    }
    expect(s.bases.some((b) => b.owner === PLAYER)).toBe(true);
  });

  it("chaque territoire a un contour à dessiner", () => {
    const s = def.build();
    expect(s.shapes).toHaveLength(s.bases.length);
    for (const poly of s.shapes) expect(poly.length).toBeGreaterThanOrEqual(4);
  });
});
