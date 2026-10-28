import { describe, expect, it } from "vitest";
import { createState, send, step } from "./sim";
import { NEUTRAL, PLAYER } from "./types";

const ENEMY = 2;

describe("production", () => {
  it("produit jusqu'à la capacité puis s'arrête, sauf pour les neutres", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 10, capacity: 20 },
      { x: 50, y: 0, owner: NEUTRAL, troops: 5, capacity: 20 },
      { x: 99, y: 0, owner: ENEMY, troops: 5, capacity: 20 },
    ]);
    for (let i = 0; i < 100; i++) step(s, 1);
    expect(s.bases[0].troops).toBe(20);
    expect(s.bases[1].troops).toBe(5);
  });
});

describe("envoi et arrivée", () => {
  it("envoie la moitié des troupes", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 90, y: 0, owner: NEUTRAL, troops: 5, capacity: 50 },
    ]);
    expect(send(s, 0, 1, PLAYER)).toBe(true);
    expect(s.bases[0].troops).toBe(10);
    expect(s.squads[0].count).toBe(10);
  });

  it("refuse d'envoyer depuis une base qui n'est pas la sienne", () => {
    const s = createState([
      { x: 0, y: 0, owner: ENEMY, troops: 20, capacity: 50 },
      { x: 90, y: 0, owner: NEUTRAL, troops: 5, capacity: 50 },
    ]);
    expect(send(s, 0, 1, PLAYER)).toBe(false);
  });

  it("capture une base si l'attaquant dépasse la défense", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 10, y: 0, owner: NEUTRAL, troops: 4, capacity: 50 },
      { x: 99, y: 0, owner: ENEMY, troops: 5, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER);
    for (let i = 0; i < 20; i++) step(s, 0.1);
    expect(s.bases[1].owner).toBe(PLAYER);
    expect(s.bases[1].troops).toBeGreaterThanOrEqual(6); // 10 - 4, plus la production après capture
  });

  it("ne capture pas si la défense tient", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 10, capacity: 50 },
      { x: 10, y: 0, owner: NEUTRAL, troops: 9, capacity: 50 },
      { x: 99, y: 0, owner: ENEMY, troops: 5, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER);
    for (let i = 0; i < 20; i++) step(s, 0.1);
    expect(s.bases[1].owner).toBe(NEUTRAL);
    expect(s.bases[1].troops).toBe(4);
  });
});

describe("interception", () => {
  it("deux troupes ennemies qui se croisent s'annulent, la plus grosse survit diminuée", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 60, y: 0, owner: ENEMY, troops: 12, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER); // 10
    send(s, 1, 0, ENEMY); // 6
    for (let i = 0; i < 20; i++) step(s, 0.1); // rencontre vers 1,4 s
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0].owner).toBe(PLAYER);
    expect(s.squads[0].count).toBe(4);
  });

  it("des troupes alliées ne se combattent pas", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 60, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 99, y: 0, owner: ENEMY, troops: 5, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER);
    send(s, 1, 0, PLAYER);
    for (let i = 0; i < 20; i++) step(s, 0.1);
    expect(s.squads).toHaveLength(2);
  });
});

describe("victoire", () => {
  it("déclare le gagnant quand il ne reste qu'un camp", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 40, capacity: 50 },
      { x: 10, y: 0, owner: ENEMY, troops: 3, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER);
    for (let i = 0; i < 20; i++) step(s, 0.1);
    expect(s.winner).toBe(PLAYER);
  });
});
