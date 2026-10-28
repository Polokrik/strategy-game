import { describe, expect, it } from "vitest";
import { type AutoRules, autoSources, makeAutoReinforce } from "./auto";
import { createState } from "./sim";
import type { Edge } from "./types";
import { NEUTRAL, PLAYER } from "./types";

const ENEMY = 2;
/** sans bornes, pour tester la mécanique de base */
const FREE: AutoRules = { maxSources: 99, tax: 0 };
const edges: Edge[] = [
  [0, 1],
  [1, 2],
];
/** A (arrière) - B (front) - C (ennemi) */
const line = (aTroops: number) =>
  createState(
    [
      { x: 0, y: 0, owner: PLAYER, troops: aTroops, capacity: 60 },
      { x: 30, y: 0, owner: PLAYER, troops: 4, capacity: 60 },
      { x: 60, y: 0, owner: ENEMY, troops: 30, capacity: 60 },
    ],
    edges,
  );

describe("renforts automatiques", () => {
  it("envoie l'arrière vers le front une fois le seuil atteint", () => {
    const s = line(25);
    makeAutoReinforce(PLAYER, () => 20, FREE)(s, 1);
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0].path).toEqual([1]);
    expect(s.squads[0].count).toBe(24);
    expect(s.bases[0].troops).toBeCloseTo(1);
  });

  it("n'envoie rien sous le seuil", () => {
    const s = line(15);
    makeAutoReinforce(PLAYER, () => 20, FREE)(s, 1);
    expect(s.squads).toHaveLength(0);
  });

  it("ne fait rien quand il est désactivé (seuil 0)", () => {
    const s = line(50);
    makeAutoReinforce(PLAYER, () => 0, FREE)(s, 1);
    expect(s.squads).toHaveLength(0);
  });

  it("ne pousse jamais depuis un territoire du front, ni ne choisit d'attaquer", () => {
    const s = line(5);
    s.bases[1].troops = 50; // le front est plein
    makeAutoReinforce(PLAYER, () => 10, FREE)(s, 1);
    expect(s.squads).toHaveLength(0);
    expect(s.bases[2].owner).toBe(ENEMY);
  });

  it("respecte la cadence d'une seconde", () => {
    const s = line(40);
    const auto = makeAutoReinforce(PLAYER, () => 10, FREE);
    auto(s, 0.4);
    expect(s.squads).toHaveLength(0);
    auto(s, 0.7);
    expect(s.squads).toHaveLength(1);
  });

  it("ne fait rien sans front (plus aucun voisin hostile)", () => {
    const s = createState(
      [
        { x: 0, y: 0, owner: PLAYER, troops: 40, capacity: 60 },
        { x: 30, y: 0, owner: PLAYER, troops: 40, capacity: 60 },
        { x: 99, y: 0, owner: NEUTRAL, troops: 5, capacity: 30 },
      ],
      [[0, 1]],
    );
    makeAutoReinforce(PLAYER, () => 10, FREE)(s, 1);
    expect(s.squads).toHaveLength(0);
  });

  it("traverse plusieurs territoires alliés pour rejoindre le front le plus proche", () => {
    // A - B - C - D(front) - E(ennemi), tous alliés sauf E
    const s = createState(
      [
        { x: 0, y: 0, owner: PLAYER, troops: 30, capacity: 60 },
        { x: 20, y: 0, owner: PLAYER, troops: 2, capacity: 60 },
        { x: 40, y: 0, owner: PLAYER, troops: 2, capacity: 60 },
        { x: 60, y: 0, owner: PLAYER, troops: 2, capacity: 60 },
        { x: 80, y: 0, owner: ENEMY, troops: 30, capacity: 60 },
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
    );
    makeAutoReinforce(PLAYER, () => 20, FREE)(s, 1);
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0].path).toEqual([1, 2, 3]);
  });

  describe("bornes", () => {
    // trois territoires de l'arrière de capacités différentes, un front, un ennemi
    const rear = () =>
      createState(
        [
          { x: 0, y: 0, owner: PLAYER, troops: 40, capacity: 30 },
          { x: 0, y: 20, owner: PLAYER, troops: 40, capacity: 60 },
          { x: 0, y: 40, owner: PLAYER, troops: 40, capacity: 45 },
          { x: 30, y: 20, owner: PLAYER, troops: 4, capacity: 60 },
          { x: 60, y: 20, owner: ENEMY, troops: 30, capacity: 60 },
        ],
        [
          [0, 1],
          [1, 2],
          [1, 3],
          [3, 4],
        ],
      );

    it("n'automatise que les plus gros territoires de l'arrière", () => {
      expect(autoSources(rear(), PLAYER, { maxSources: 2, tax: 0 })).toEqual([1, 2]);
    });

    it("n'envoie que depuis les territoires automatisés", () => {
      const s = rear();
      makeAutoReinforce(PLAYER, () => 10, { maxSources: 2, tax: 0 })(s, 1);
      expect(s.squads).toHaveLength(2);
      expect(s.bases[0].troops).toBe(40); // le plus petit n'est pas automatisé
    });

    it("la taxe retire une part des troupes du convoi", () => {
      const s = line(41);
      makeAutoReinforce(PLAYER, () => 10, { maxSources: 99, tax: 0.25 })(s, 1);
      expect(s.squads[0].count).toBe(30); // 40 envoyées, un quart perdu
    });

    it("les bornes par défaut sont 2 territoires et 25 % de pertes", () => {
      const s = line(41);
      makeAutoReinforce(PLAYER, () => 10)(s, 1);
      expect(s.squads[0].count).toBe(30);
    });
  });
});
