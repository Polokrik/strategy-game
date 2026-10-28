import { describe, expect, it } from "vitest";
import { BALANCED, makeAi } from "./ai";
import { createState, step } from "./sim";
import { NEUTRAL, PLAYER } from "./types";

const AI = 2;

describe("IA", () => {
  it("n'envoie qu'une attaque par décision, même avec plusieurs territoires prêts", () => {
    const s = createState([
      { x: 0, y: 0, owner: AI, troops: 50, capacity: 60 },
      { x: 20, y: 0, owner: AI, troops: 50, capacity: 60 },
      { x: 0, y: 40, owner: NEUTRAL, troops: 3, capacity: 30 },
      { x: 20, y: 40, owner: NEUTRAL, troops: 3, capacity: 30 },
    ]);
    makeAi({ owner: AI, ...BALANCED })(s, BALANCED.interval);
    expect(s.squads).toHaveLength(1);
  });

  it("réunit plusieurs territoires pour briser une défense qu'un seul ne peut pas battre", () => {
    const s = createState([
      { x: 0, y: 0, owner: AI, troops: 40, capacity: 60 },
      { x: 20, y: 0, owner: AI, troops: 40, capacity: 60 },
      { x: 10, y: 40, owner: PLAYER, troops: 40, capacity: 60 },
    ]);
    makeAi({ owner: AI, ...BALANCED })(s, BALANCED.interval);
    expect(s.squads).toHaveLength(2);
  });

  it("préfère s'en prendre au camp qui domine", () => {
    const s = createState([
      { x: 50, y: 0, owner: AI, troops: 30, capacity: 60 },
      { x: 0, y: 50, owner: PLAYER, troops: 5, capacity: 30 }, // 1 territoire
      { x: 100, y: 50, owner: 3, troops: 5, capacity: 30 }, // le camp 3 en a 2
      { x: 100, y: 90, owner: 3, troops: 40, capacity: 60 },
    ]);
    makeAi({ owner: AI, ...BALANCED, leaderFocus: 20 })(s, BALANCED.interval);
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0].path.at(-1)).toBe(2);
  });

  it("produit moins vite que le joueur grâce au multiplicateur", () => {
    const s = createState([
      { x: 0, y: 0, owner: AI, troops: 10, capacity: 100 },
      { x: 50, y: 0, owner: PLAYER, troops: 10, capacity: 100 },
    ]);
    makeAi({ owner: AI, ...BALANCED })(s, 0);
    step(s, 1);
    expect(s.bases[0].troops).toBeLessThan(s.bases[1].troops);
  });
});
