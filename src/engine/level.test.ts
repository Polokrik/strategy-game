import { describe, expect, it } from "vitest";
import { LEVELS } from "./level";
import { findPath } from "./sim";
import { NEUTRAL } from "./types";

describe.each(LEVELS.map((l, i) => [i + 1, l] as const))("chapitre %i", (_i, def) => {
  it("chaque camp peut atteindre chaque base adverse en un chemin valide de départ", () => {
    const s = def.build();
    const real = s.bases.filter((b) => !b.junction);
    for (const from of real.filter((b) => b.owner !== NEUTRAL)) {
      // chemin vers au moins une base qui n'est pas la sienne
      const reachable = real.some((to) => to.owner !== from.owner && findPath(s, from.id, to.id, from.owner));
      expect(reachable, `base ${from.id} isolée`).toBe(true);
    }
  });

  it("toutes les bases sont reliées au graphe (pas d'îlot)", () => {
    const s = def.build();
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) for (const v of s.links[queue.pop()!]) if (!seen.has(v)) (seen.add(v), queue.push(v));
    expect(seen.size).toBe(s.bases.length);
  });

  it("annonce autant d'IA que de camps adverses", () => {
    const s = def.build();
    const owners = new Set(s.bases.filter((b) => b.owner > 1).map((b) => b.owner));
    expect(def.ais.map((a) => a.owner).sort()).toEqual([...owners].sort());
  });
});
