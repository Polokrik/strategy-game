import { describe, expect, it } from "vitest";
import { createState, findPath, send, step } from "./sim";
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
    for (let i = 0; i < 30; i++) step(s, 0.1); // rencontre vers 2,1 s
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
    for (let i = 0; i < 30; i++) step(s, 0.1);
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

describe("routes et carrefours", () => {
  // A(0,0) - J(30,0) - B(60,0) ; la ligne droite A-B n'existe pas
  const road = (bOwner = NEUTRAL) =>
    createState(
      [
        { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
        { x: 30, y: 0, owner: NEUTRAL, troops: 0, capacity: 0, junction: true },
        { x: 60, y: 0, owner: bOwner, troops: 3, capacity: 50 },
        { x: 99, y: 99, owner: ENEMY, troops: 5, capacity: 50 },
      ],
      [
        [0, 1],
        [1, 2],
      ],
    );

  it("passe par le carrefour pour atteindre la destination", () => {
    const route = findPath(road(), 0, 2, PLAYER);
    expect(route?.path).toEqual([1, 2]);
    expect(route?.length).toBeCloseTo(60);
  });

  it("refuse un chemin inexistant", () => {
    expect(send(road(), 0, 3, PLAYER)).toBe(false);
  });

  it("refuse de viser un carrefour", () => {
    expect(send(road(), 0, 1, PLAYER)).toBe(false);
  });

  it("une base neutre ou ennemie bloque le passage, la sienne se traverse", () => {
    const nodes = (mid: number) => [
      { x: 0, y: 0, owner: PLAYER, troops: 20, capacity: 50 },
      { x: 30, y: 0, owner: mid, troops: 5, capacity: 50 },
      { x: 60, y: 0, owner: NEUTRAL, troops: 3, capacity: 50 },
    ];
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
    ];
    expect(findPath(createState(nodes(NEUTRAL), edges), 0, 2, PLAYER)).toBeNull();
    expect(findPath(createState(nodes(ENEMY), edges), 0, 2, PLAYER)).toBeNull();
    expect(findPath(createState(nodes(PLAYER), edges), 0, 2, PLAYER)?.path).toEqual([1, 2]);
  });

  it("la troupe arrive à destination en suivant la route", () => {
    const s = road();
    send(s, 0, 2, PLAYER); // 10 troupes contre 3
    for (let i = 0; i < 60; i++) step(s, 0.1);
    expect(s.bases[2].owner).toBe(PLAYER);
  });

  it("deux troupes qui se croisent au carrefour s'interceptent et laissent une trace", () => {
    const s = road(ENEMY);
    s.bases[2].troops = 12;
    send(s, 0, 2, PLAYER); // 10
    send(s, 2, 0, ENEMY); // 6
    for (let i = 0; i < 25; i++) step(s, 0.1); // rencontre vers 2,1 s
    expect(s.fights.length).toBeGreaterThan(0);
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0].owner).toBe(PLAYER);
  });
});
