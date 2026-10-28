import { describe, expect, it } from "vitest";
import { BALANCED, makeAi } from "./ai";
import { createState, step } from "./sim";
import { NEUTRAL } from "./types";

const AI = 2;
const mk = () =>
  createState([
    { x: 0, y: 0, owner: AI, troops: 50, capacity: 60 },
    { x: 20, y: 0, owner: AI, troops: 50, capacity: 60 },
    { x: 0, y: 40, owner: NEUTRAL, troops: 3, capacity: 30 },
    { x: 20, y: 40, owner: NEUTRAL, troops: 3, capacity: 30 },
  ]);

describe("IA", () => {
  it("n'envoie qu'une attaque par décision, même avec plusieurs bases prêtes", () => {
    const s = mk();
    const ai = makeAi({ owner: AI, ...BALANCED });
    ai(s, BALANCED.interval);
    expect(s.squads).toHaveLength(1);
  });

  it("produit moins vite que le joueur grâce au multiplicateur", () => {
    const s = createState([
      { x: 0, y: 0, owner: AI, troops: 10, capacity: 100 },
      { x: 50, y: 0, owner: 1, troops: 10, capacity: 100 },
    ]);
    makeAi({ owner: AI, ...BALANCED })(s, 0);
    step(s, 1);
    expect(s.bases[0].troops).toBeLessThan(s.bases[1].troops);
  });
});
