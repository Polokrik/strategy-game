import { describe, expect, it } from "vitest";
import { FATIGUE_FREE, OVERTIME_FLOOR, OVERTIME_START, createState, fatigue, findPath, overtime, send, step } from "./sim";
import { type Edge, NEUTRAL, PLAYER } from "./types";

const ENEMY = 2;
const run = (s: ReturnType<typeof createState>, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) step(s, 0.1);
};

describe("production", () => {
  it("produit jusqu'à la capacité puis s'arrête, sauf pour les neutres", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 10, capacity: 20 },
      { x: 50, y: 0, owner: NEUTRAL, troops: 5, capacity: 20 },
      { x: 99, y: 0, owner: ENEMY, troops: 5, capacity: 20 },
    ]);
    run(s, 100);
    expect(s.bases[0].troops).toBe(20);
    expect(s.bases[1].troops).toBe(5);
  });

  it("la fatigue d'empire ralentit la production par territoire au-delà du seuil", () => {
    expect(fatigue(FATIGUE_FREE)).toBe(1);
    expect(fatigue(FATIGUE_FREE + 8)).toBeLessThan(fatigue(FATIGUE_FREE + 2));
    expect(fatigue(0)).toBe(1);
  });

  it("un camp qui domine produit moins par territoire", () => {
    const small = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 0, capacity: 100 },
      { x: 50, y: 0, owner: ENEMY, troops: 0, capacity: 100 },
    ]);
    const big = createState([
      ...Array.from({ length: 12 }, (_, i) => ({ x: i, y: 0, owner: PLAYER, troops: 0, capacity: 100 })),
      { x: 50, y: 0, owner: ENEMY, troops: 0, capacity: 100 },
    ]);
    step(small, 1);
    step(big, 1);
    expect(big.bases[0].troops).toBeLessThan(small.bases[0].troops);
  });
});

describe("prolongation", () => {
  it("le plafond est normal avant le seuil puis rétrécit jusqu'à un plancher", () => {
    expect(overtime(0)).toBe(1);
    expect(overtime(OVERTIME_START)).toBe(1);
    expect(overtime(OVERTIME_START + 75)).toBeCloseTo(0.5);
    expect(overtime(10_000)).toBe(OVERTIME_FLOOR);
  });

  it("les troupes en excédent d'un territoire fondent en prolongation", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 60, capacity: 60 },
      { x: 50, y: 0, owner: ENEMY, troops: 60, capacity: 60 },
    ]);
    s.time = OVERTIME_START + 100;
    run(s, 30);
    expect(s.bases[0].troops).toBeLessThan(30); // plafond 0,35 × 60 = 21
  });

  it("avant la prolongation les troupes ne fondent pas", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 60, capacity: 60 },
      { x: 50, y: 0, owner: ENEMY, troops: 60, capacity: 60 },
    ]);
    run(s, 30);
    expect(s.bases[0].troops).toBe(60);
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

  it("refuse d'envoyer depuis un territoire qui n'est pas le sien", () => {
    const s = createState([
      { x: 0, y: 0, owner: ENEMY, troops: 20, capacity: 50 },
      { x: 90, y: 0, owner: NEUTRAL, troops: 5, capacity: 50 },
    ]);
    expect(send(s, 0, 1, PLAYER)).toBe(false);
  });

  it("capture un territoire si l'attaquant dépasse la défense", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 10, y: 0, owner: NEUTRAL, troops: 4, capacity: 50 },
      { x: 99, y: 0, owner: ENEMY, troops: 5, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER);
    run(s, 2);
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
    run(s, 2);
    expect(s.bases[1].owner).toBe(NEUTRAL);
    expect(s.bases[1].troops).toBe(4);
  });
});

describe("interception sur une frontière", () => {
  it("deux troupes ennemies en sens inverse s'annulent, la plus grosse survit diminuée", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 60, y: 0, owner: ENEMY, troops: 12, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER); // 10
    send(s, 1, 0, ENEMY); // 6
    run(s, 2.5); // rencontre vers 2,1 s, le flash dure 0,8 s
    expect(s.fights.length).toBeGreaterThan(0);
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
    run(s, 3);
    expect(s.squads).toHaveLength(2);
  });

  it("des trajets qui se croisent géométriquement mais sur des frontières différentes ne s'interceptent pas", () => {
    // A(0,0) -> B(60,60) et C(60,0) -> D(0,60) se croisent en (30,30) sans partager de frontière
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 60, y: 60, owner: NEUTRAL, troops: 3, capacity: 50 },
      { x: 60, y: 0, owner: ENEMY, troops: 20, capacity: 50 },
      { x: 0, y: 60, owner: NEUTRAL, troops: 3, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER);
    send(s, 2, 3, ENEMY);
    run(s, 3.2); // au centre vers 3 s, bien avant l'arrivée
    expect(s.fights).toHaveLength(0);
    expect(s.squads).toHaveLength(2);
  });

  it("ne se produit pas si les troupes vont dans le même sens", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 40, capacity: 50 },
      { x: 60, y: 0, owner: NEUTRAL, troops: 30, capacity: 50 },
      { x: 0, y: 10, owner: ENEMY, troops: 5, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER);
    send(s, 0, 1, PLAYER);
    run(s, 1);
    expect(s.fights).toHaveLength(0);
  });
});

describe("voisinage et chemins", () => {
  // A - M - B en ligne ; A et B ne sont pas voisins
  const edges: Edge[] = [
    [0, 1],
    [1, 2],
  ];
  const line = (mid: number) =>
    createState(
      [
        { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
        { x: 30, y: 0, owner: mid, troops: 5, capacity: 50 },
        { x: 60, y: 0, owner: NEUTRAL, troops: 3, capacity: 50 },
        { x: 99, y: 99, owner: ENEMY, troops: 5, capacity: 50 },
      ],
      edges,
    );

  it("traverse ses propres territoires", () => {
    const route = findPath(line(PLAYER), 0, 2, PLAYER);
    expect(route?.path).toEqual([1, 2]);
    expect(route?.length).toBeCloseTo(60);
  });

  it("un territoire neutre ou ennemi bloque le passage", () => {
    expect(findPath(line(NEUTRAL), 0, 2, PLAYER)).toBeNull();
    expect(findPath(line(ENEMY), 0, 2, PLAYER)).toBeNull();
  });

  it("refuse d'envoyer vers un territoire sans chemin", () => {
    expect(send(line(PLAYER), 0, 3, PLAYER)).toBe(false);
  });

  it("la troupe traverse ses territoires et capture la cible", () => {
    const s = line(PLAYER);
    send(s, 0, 2, PLAYER); // 10 troupes contre 3
    run(s, 7);
    expect(s.bases[2].owner).toBe(PLAYER);
  });

  it("un territoire perdu en cours de route arrête la troupe", () => {
    const s = line(PLAYER);
    send(s, 0, 2, PLAYER);
    s.bases[1].owner = ENEMY; // pris par l'ennemi pendant le trajet
    s.bases[1].troops = 100;
    run(s, 7);
    expect(s.bases[2].owner).toBe(NEUTRAL);
    expect(s.bases[1].owner).toBe(ENEMY);
  });
});

describe("victoire", () => {
  it("déclare le gagnant quand il ne reste qu'un camp", () => {
    const s = createState([
      { x: 0, y: 0, owner: PLAYER, troops: 40, capacity: 50 },
      { x: 10, y: 0, owner: ENEMY, troops: 3, capacity: 50 },
    ]);
    send(s, 0, 1, PLAYER);
    run(s, 2);
    expect(s.winner).toBe(PLAYER);
  });
});
