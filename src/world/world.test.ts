import { describe, expect, it } from "vitest";
import { PERIODS, START_YEAR, formatYear, fromBCE, nextYear, stepAt, turnsBetween } from "./calendar";
import {
  MAX_CHANCE,
  MIN_CHANCE,
  available,
  canAttack,
  capacityOf,
  deserialize,
  endTurn,
  newWorld,
  playerAttack,
  serialize,
  targetsOf,
  winChance,
} from "./rules";
import { REGIONS, THEATRE, regionsOf, societies, troopsOf } from "./state";

describe("calendrier", () => {
  it("affiche les dates sans année zéro", () => {
    expect(formatYear(START_YEAR)).toBe("3000 av. J.-C.");
    expect(formatYear(0)).toBe("1 av. J.-C.");
    expect(formatYear(1)).toBe("1 apr. J.-C.");
    expect(formatYear(1492)).toBe("1492");
  });
  it("avance de 50 ans au début, et ne dépend que de la date", () => {
    expect(stepAt(START_YEAR)).toBe(50);
    expect(formatYear(nextYear(START_YEAR))).toBe("2950 av. J.-C.");
  });
  it("change de pas aux seuils, sans jamais sauter par-dessus", () => {
    expect(turnsBetween(START_YEAR, fromBCE(1000))).toBe(40);
    expect(stepAt(fromBCE(1000))).toBe(25);
    // de 1000 av. J.-C. à 500 il y a 1 499 ans (pas d'année zéro) : le dernier tour est écourté pour tomber sur 500
    expect(turnsBetween(fromBCE(1000), 500)).toBe(60);
    expect(nextYear(476)).toBe(500);
    expect(stepAt(500)).toBe(10);
    for (const p of PERIODS.slice(0, -1)) expect(stepAt(p.until - 1)).toBe(1);
  });
  it("compte environ 436 tours de 3000 av. J.-C. à 2026", () => {
    expect(turnsBetween(START_YEAR, 2026)).toBe(436);
  });
  it("traverse le passage à notre ère sans date impossible", () => {
    let y = fromBCE(25);
    y = nextYear(y);
    expect(formatYear(y)).toBe("1 apr. J.-C.");
  });
});

describe("carte du théâtre", () => {
  it("a des voisinages réciproques, et aucune région isolée", () => {
    for (const r of THEATRE.regions) {
      expect(r.neighbors.length).toBeGreaterThan(0);
      for (const n of r.neighbors) expect(REGIONS[n].neighbors).toContain(r.id);
    }
  });
  it("est d'un seul tenant : toute région est joignable depuis toute autre", () => {
    const seen = new Set([THEATRE.regions[0].id]);
    const todo = [THEATRE.regions[0].id];
    while (todo.length) for (const n of REGIONS[todo.pop()!].neighbors) if (!seen.has(n)) (seen.add(n), todo.push(n));
    expect(seen.size).toBe(THEATRE.regions.length);
  });
  it("ne porte aucun nom d'État", () => {
    for (const r of THEATRE.regions) expect(r.name).not.toMatch(/France|Espagne|Allemagne|Royaume|Empire|Italie|Angleterre/);
  });
});

describe("chances de victoire", () => {
  it("suit le rapport de forces : 50 % à égalité, 90 % à dix contre un", () => {
    expect(winChance(100, 100)).toBeCloseTo(0.5, 5);
    expect(winChance(250, 25)).toBe(0.9);
    expect(winChance(200, 100)).toBeGreaterThan(0.7);
    expect(winChance(200, 100)).toBeLessThan(0.8);
  });
  it("ne garantit jamais rien, dans un sens ni dans l'autre", () => {
    expect(winChance(100000, 1)).toBe(MAX_CHANCE);
    expect(winChance(1, 100000)).toBe(MIN_CHANCE);
  });
  it("vaut pour les deux camps : la puissance joue symétriquement", () => {
    expect(winChance(100, 100, 2, 1)).toBeCloseTo(winChance(200, 100), 5);
    expect(winChance(100, 100, 1, 2)).toBeCloseTo(winChance(50, 100), 5);
  });
  it("le tirage automatique respecte la chance affichée", () => {
    let wins = 0;
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const w = newWorld("bassin-parisien", seed);
      const target = targetsOf(w, w.player)[0];
      const sent = w.troops[target]; // à égalité : 50 %
      if (playerAttack(w, target, sent)?.won) wins++;
    }
    expect(wins / N).toBeGreaterThan(0.42);
    expect(wins / N).toBeLessThan(0.58);
  });
});

describe("partie", () => {
  it("commence en 3000 av. J.-C. avec une région, des rivaux éloignés et des communautés locales", () => {
    const w = newWorld("armorique", 7);
    expect(formatYear(w.year)).toBe("3000 av. J.-C.");
    expect(regionsOf(w, w.player)).toEqual(["armorique"]);
    expect(societies(w)).toHaveLength(5);
    for (const s of societies(w)) if (s !== w.player) expect(REGIONS[s].neighbors).not.toContain("armorique");
    expect(Object.values(w.owner).filter((o) => o === null).length).toBe(THEATRE.regions.length - 5);
  });
  it("n'attaque que les voisines, avec des troupes qu'on a", () => {
    const w = newWorld("armorique", 7);
    expect(targetsOf(w, w.player)).toEqual(["val-de-loire"]);
    expect(canAttack(w, w.player, "provence", 10)).toBe(false);
    expect(canAttack(w, w.player, "val-de-loire", available(w, w.player) + 1)).toBe(false);
    expect(canAttack(w, w.player, "val-de-loire", available(w, w.player))).toBe(true);
  });
  it("une victoire donne la région et coûte des troupes ; un échec en coûte aussi", () => {
    const w = newWorld("armorique", 7);
    const before = troopsOf(w, w.player);
    const e = playerAttack(w, "val-de-loire", 40, true)!;
    expect(e.won).toBe(true);
    expect(w.owner["val-de-loire"]).toBe(w.player);
    expect(troopsOf(w, w.player)).toBeLessThan(before);
    const w2 = newWorld("armorique", 7);
    playerAttack(w2, "val-de-loire", 40, false);
    expect(w2.owner["val-de-loire"]).toBeNull();
    expect(troopsOf(w2, w2.player)).toBeLessThan(before);
    expect(troopsOf(w2, w2.player)).toBeGreaterThan(0);
  });
  it("le temps avance à chaque tour, que le joueur conquière ou non", () => {
    const w = newWorld("armorique", 7);
    const r = endTurn(w);
    expect(r.years).toBe(50);
    expect(formatYear(w.year)).toBe("2950 av. J.-C.");
    expect(w.turn).toBe(1);
  });
  it("garde des effectifs entiers, positifs et sous la capacité pendant 300 tours", () => {
    const w = newWorld("bassin-parisien", 3);
    for (let i = 0; i < 300 && w.status === "playing"; i++) {
      endTurn(w);
      for (const id of Object.keys(w.troops)) {
        expect(Number.isInteger(w.troops[id])).toBe(true);
        expect(w.troops[id]).toBeGreaterThanOrEqual(1);
      }
    }
    expect(w.turn).toBeGreaterThan(0);
    for (const id of Object.keys(w.troops)) if (w.owner[id] === null) expect(w.troops[id]).toBeLessThanOrEqual(capacityOf(id));
  });
  it("est reproductible : même graine et mêmes ordres, même histoire, y compris après sauvegarde", () => {
    const play = (reload: boolean) => {
      let w = newWorld("meseta-nord", 99);
      for (let i = 0; i < 30 && w.status === "playing"; i++) {
        const t = targetsOf(w, w.player).sort()[0];
        if (t) playerAttack(w, t, Math.floor(available(w, w.player) / 2));
        endTurn(w);
        if (reload) w = deserialize(serialize(w))!;
      }
      return serialize(w);
    };
    expect(play(true)).toBe(play(false));
  });
  it("refuse une sauvegarde d'une autre version", () => {
    const w = newWorld("armorique", 1);
    expect(deserialize(serialize(w))).not.toBeNull();
    expect(deserialize(serialize({ ...w, version: 0 as never }))).toBeNull();
    expect(deserialize("n'importe quoi")).toBeNull();
  });
});
