import { describe, expect, it } from "vitest";
import { AUTO_RATIO, autoCap, autoStatus, makeAutoReinforce, suggestFlags } from "./auto";

/** un tiers : un plafond assez large pour tester la mécanique sur de petites cartes */
const THIRD = 1 / 3;
import { createState } from "./sim";
import type { Edge } from "./types";
import { NEUTRAL, PLAYER } from "./types";

const ENEMY = 2;
/** n territoires alliés en file, puis un ennemi : seul le dernier allié est au front */
const chain = (n: number, troops = 40) =>
  createState(
    [
      ...Array.from({ length: n }, (_, i) => ({ x: i * 20, y: 0, owner: PLAYER, troops, capacity: 60 })),
      { x: n * 20, y: 0, owner: ENEMY, troops: 30, capacity: 60 },
    ],
    Array.from({ length: n }, (_, i): Edge => [i, i + 1]),
  );

describe("plafond", () => {
  it("un dixième des territoires de la carte, au moins un", () => {
    expect(AUTO_RATIO).toBeCloseTo(1 / 10);
    // petites cartes : toujours 1 ; 25 territoires : 2 ; une grande carte monde : beaucoup
    expect([3, 7, 9, 16, 19].map((n) => autoCap(n))).toEqual([1, 1, 1, 1, 1]);
    expect([20, 25, 31, 200].map((n) => autoCap(n))).toEqual([2, 2, 3, 20]);
    expect([2, 5, 6, 9, 14].map((n) => autoCap(n, THIRD))).toEqual([1, 1, 2, 3, 4]);
  });

  it("ne retient que les territoires cochés qui nous appartiennent, dans le plafond", () => {
    const s = chain(7); // 8 territoires, plafond 2 à un tiers
    const st = autoStatus(s, PLAYER, [0, 1, 2], THIRD);
    expect(st.cap).toBe(2);
    expect(st.flagged).toEqual([0, 1]);
    s.bases[0].owner = ENEMY; // un coché est perdu
    expect(autoStatus(s, PLAYER, [0, 1, 2], THIRD).flagged).toEqual([1, 2]);
  });

  it("seuls les cochés de l'arrière envoient : le front reçoit", () => {
    const s = chain(6); // le front est le territoire 5
    const st = autoStatus(s, PLAYER, [0, 5], THIRD);
    expect(st.flagged).toEqual([0, 5]);
    expect(st.active).toEqual([0]);
  });

  it("propose les plus gros territoires de l'arrière, jamais ceux du front", () => {
    const s = createState(
      [
        { x: 0, y: 0, owner: PLAYER, troops: 10, capacity: 30 },
        { x: 20, y: 0, owner: PLAYER, troops: 10, capacity: 60 },
        { x: 40, y: 0, owner: PLAYER, troops: 10, capacity: 45 },
        { x: 60, y: 0, owner: PLAYER, troops: 10, capacity: 60 }, // front
        { x: 80, y: 0, owner: ENEMY, troops: 30, capacity: 60 },
      ],
      [[0, 1], [1, 2], [2, 3], [3, 4]],
    );
    expect(suggestFlags(s, PLAYER, 0.4)).toEqual([1, 2]);
    expect(suggestFlags(s, PLAYER)).toEqual([1]); // 5 territoires à 1/10 : un seul
  });
});

describe("renforts automatiques", () => {
  const flags = (...ids: number[]) => () => ids;

  it("envoie l'arrière coché vers le front une fois le seuil atteint, sans perte", () => {
    const s = chain(3, 4); // plafond 1
    s.bases[0].troops = 25;
    makeAutoReinforce(PLAYER, () => 20, flags(0), THIRD)(s, 1);
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0].path).toEqual([1, 2]);
    expect(s.squads[0].count).toBe(24);
    expect(s.bases[0].troops).toBeCloseTo(1);
  });

  it("n'envoie rien depuis un territoire non coché", () => {
    const s = chain(3, 4);
    s.bases[0].troops = 25;
    makeAutoReinforce(PLAYER, () => 20, flags(), THIRD)(s, 1);
    expect(s.squads).toHaveLength(0);
  });

  it("n'envoie rien sous le seuil", () => {
    const s = chain(3, 4);
    s.bases[0].troops = 15;
    makeAutoReinforce(PLAYER, () => 20, flags(0), THIRD)(s, 1);
    expect(s.squads).toHaveLength(0);
  });

  it("ne fait rien quand il est désactivé (seuil 0)", () => {
    const s = chain(3, 50);
    makeAutoReinforce(PLAYER, () => 0, flags(0), THIRD)(s, 1);
    expect(s.squads).toHaveLength(0);
  });

  it("ne choisit jamais d'attaquer", () => {
    const s = chain(3, 50); // le front est plein : il ne sert qu'à recevoir
    makeAutoReinforce(PLAYER, () => 10, flags(2), THIRD)(s, 1);
    expect(s.squads).toHaveLength(0);
    expect(s.bases[3].owner).toBe(ENEMY);
  });

  it("respecte la cadence d'une seconde", () => {
    const s = chain(3, 40);
    const auto = makeAutoReinforce(PLAYER, () => 10, flags(0), THIRD);
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
        { x: 60, y: 0, owner: PLAYER, troops: 40, capacity: 60 },
        { x: 99, y: 0, owner: NEUTRAL, troops: 5, capacity: 30 },
      ],
      [[0, 1], [1, 2]],
    );
    makeAutoReinforce(PLAYER, () => 10, flags(0), THIRD)(s, 1);
    expect(s.squads).toHaveLength(0);
  });

  it("traverse plusieurs territoires alliés pour rejoindre le front le plus proche", () => {
    const s = chain(6, 2); // front = 5, plafond 2
    s.bases[0].troops = 30;
    makeAutoReinforce(PLAYER, () => 20, flags(0), THIRD)(s, 1);
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0].path).toEqual([1, 2, 3, 4, 5]);
  });
});
