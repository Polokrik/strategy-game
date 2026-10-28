import { describe, expect, it } from "vitest";
import {
  type CampaignState,
  battleLevel,
  canAttack,
  conquer,
  deserialize,
  endTurn,
  goalReached,
  newCampaign,
  pressure,
  provincesOf,
  resolveBattle,
  serialize,
  targets,
  yearOf,
} from "./campaign";
import { AI_FACTIONS, CROWN, FACTIONS, HISTORY, MAP, PROVINCES, SCENARIOS, START_OWNERS, tierOf } from "./france";
import { makeLevelAis } from "../engine/level";

const fresh = (scenario = "philippe-auguste", seed = 42): CampaignState => newCampaign(scenario, seed);
const clone = (c: CampaignState): CampaignState => JSON.parse(JSON.stringify(c));

describe("données de la carte", () => {
  it("26 provinces, voisinages symétriques entre provinces existantes", () => {
    expect(MAP.provinces).toHaveLength(26);
    for (const p of MAP.provinces) {
      for (const n of p.neighbors) {
        expect(PROVINCES[n], `${p.id} -> ${n}`).toBeDefined();
        expect(PROVINCES[n].neighbors).toContain(p.id);
      }
    }
  });

  it("la carte est d'un seul tenant (traversée maritime comprise)", () => {
    const seen = new Set(["ile-de-france"]);
    const queue = ["ile-de-france"];
    while (queue.length) for (const n of PROVINCES[queue.pop()!].neighbors) if (!seen.has(n)) (seen.add(n), queue.push(n));
    expect(seen.size).toBe(26);
  });

  it("chaque province a une histoire, un camp de départ valide et des contours", () => {
    for (const p of MAP.provinces) {
      expect(HISTORY[p.id], p.id).toBeDefined();
      expect(FACTIONS[START_OWNERS[p.id]], p.id).toBeDefined();
      expect(p.shapes.length).toBeGreaterThan(0);
      for (const ring of p.shapes) expect(ring.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("les trois tailles de bataille existent et le point d'ancrage est dans le cadre", () => {
    const tiers = new Set(MAP.provinces.map((p) => tierOf(p.id)));
    expect([...tiers].sort()).toEqual([1, 2, 3]);
    for (const p of MAP.provinces) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(MAP.width + 0.01);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(MAP.height + 0.01);
    }
  });

  it("les objectifs des scénarios désignent des provinces existantes", () => {
    for (const s of SCENARIOS) if (s.goal !== "all") for (const id of s.goal) expect(PROVINCES[id], id).toBeDefined();
  });
});

describe("départ de campagne", () => {
  it("la Couronne tient trois provinces en 1180, au tour 0", () => {
    const c = fresh();
    expect(provincesOf(c, CROWN).sort()).toEqual(["berry", "ile-de-france", "orleanais"]);
    expect(c.turn).toBe(0);
    expect(yearOf(c)).toBe(1180);
    expect(c.status).toBe("playing");
  });

  it("refuse un scénario inconnu", () => {
    expect(() => newCampaign("nimportequoi")).toThrow();
  });
});

describe("attaques du joueur", () => {
  it("on n'attaque que les provinces voisines des siennes", () => {
    const c = fresh();
    const t = targets(c);
    expect(t).toContain("normandie");
    expect(t).toContain("auvergne");
    expect(t).not.toContain("bretagne"); // pas voisine d'une province de la Couronne
    expect(t).not.toContain("ile-de-france"); // déjà à nous
    expect(canAttack(c, "normandie")).toBe(true);
    expect(canAttack(c, "bretagne")).toBe(false);
    expect(canAttack(c, "berry")).toBe(false);
  });

  it("une conquête ouvre de nouvelles cibles", () => {
    const c = fresh();
    conquer(c, "normandie");
    expect(c.owner.normandie).toBe(CROWN);
    expect(canAttack(c, "bretagne")).toBe(true);
  });

  it("le scénario à objectif gagne quand les cinq provinces sont tenues", () => {
    const c = fresh();
    for (const id of ["normandie", "anjou-touraine", "maine", "poitou"]) conquer(c, id);
    expect(goalReached(c)).toBe(false);
    expect(c.status).toBe("playing");
    conquer(c, "picardie");
    expect(goalReached(c)).toBe(true);
    expect(c.status).toBe("won");
  });

  it("on ne peut plus attaquer une fois la campagne terminée", () => {
    const c = fresh();
    c.status = "lost";
    expect(canAttack(c, "normandie")).toBe(false);
  });

  it("la chronique garde les derniers événements seulement", () => {
    const c = fresh();
    for (let i = 0; i < 30; i++) conquer(c, "normandie");
    expect(c.log.length).toBeLessThanOrEqual(14);
  });
});

describe("batailles", () => {
  it("la bataille jouée est un chapitre valide : joueur, défenseur, taille selon la province", () => {
    const c = fresh();
    for (const id of ["maine", "poitou", "normandie"]) {
      const level = battleLevel(c, id);
      const s = level.build();
      expect(s.bases.some((b) => b.owner === 1)).toBe(true);
      expect(s.bases.some((b) => b.owner === 2)).toBe(true);
      expect(level.auto).toBe(true);
      expect(level.ais).toHaveLength(1);
      expect(level.title).toContain(PROVINCES[id].name);
      expect(makeLevelAis(level)).toHaveLength(1);
    }
    // les grandes provinces donnent de plus grandes cartes que les petites
    expect(battleLevel(c, "normandie").build().bases.length).toBeGreaterThan(battleLevel(c, "maine").build().bases.length);
  });

  it("l'armée du joueur grossit avec ses provinces, la défense avec la taille de la province", () => {
    const c = fresh();
    const start = (id: string) => battleLevel(c, id).build().bases.find((b) => b.owner === 1)!.troops;
    const defense = (id: string) => battleLevel(c, id).build().bases.find((b) => b.owner === 2)!.troops;
    expect(start("maine")).toBe(26); // 20 + 2 × 3 provinces
    expect(defense("maine")).toBeLessThan(defense("normandie"));
    conquer(c, "normandie");
    conquer(c, "maine");
    expect(start("poitou")).toBe(30); // 5 provinces
  });

  it("la bataille d'une même province, au même état, est la même", () => {
    const c = fresh();
    const a = battleLevel(c, "normandie").build();
    const b = battleLevel(c, "normandie").build();
    expect(a.bases.map((x) => [x.x, x.y, x.owner, x.troops])).toEqual(b.bases.map((x) => [x.x, x.y, x.owner, x.troops]));
  });

  it("la résolution en accéléré se termine et donne un vainqueur", () => {
    const c = fresh();
    const r = resolveBattle(c, "plantagenets", "crown", "berry", 7);
    expect(["attacker", "defender"]).toContain(r);
  });
});

describe("rattrapage", () => {
  it("la résistance monte avec la taille de l'empire, jusqu'à un plafond", () => {
    const c = fresh();
    expect(pressure(c)).toBe(1);
    for (const id of ["normandie", "maine", "poitou", "picardie", "champagne", "bourgogne"]) conquer(c, id);
    const mid = pressure(c);
    expect(mid).toBeGreaterThan(1);
    for (const id of Object.keys(c.owner)) c.owner[id] = CROWN;
    expect(pressure(c)).toBe(1.25);
    expect(mid).toBeLessThan(1.25);
  });

  it("la difficulté choisie multiplie la résistance", () => {
    const easy = newCampaign("philippe-auguste", 1, 0.8);
    const hard = newCampaign("philippe-auguste", 1, 1.2);
    expect(pressure(easy)).toBeCloseTo(0.8);
    expect(pressure(hard)).toBeCloseTo(1.2);
    expect(battleLevel(easy, "normandie").ais[0].handicap!).toBeLessThan(battleLevel(hard, "normandie").ais[0].handicap!);
  });

  it("une ancienne sauvegarde sans difficulté se lit comme normale", () => {
    const c = fresh();
    delete c.difficulty;
    expect(deserialize(serialize(c))).not.toBeNull();
    expect(pressure(c)).toBe(1);
  });

  it("la bataille du joueur tient compte de la résistance", () => {
    const c = fresh();
    const base = battleLevel(c, "normandie").ais[0].handicap!;
    for (const id of ["maine", "poitou", "picardie", "champagne", "bourgogne", "auvergne"]) conquer(c, id);
    expect(battleLevel(c, "normandie").ais[0].handicap!).toBeGreaterThan(base);
  });
});

describe("fin de tour", () => {
  it("fait avancer l'année de 3 ans", () => {
    const c = fresh();
    endTurn(c);
    expect(c.turn).toBe(1);
    expect(yearOf(c)).toBe(1183);
  });

  it("est reproductible : même état, même hasard, mêmes événements", () => {
    const a = fresh("la-france-se-fait", 99);
    const b = clone(a);
    const la = endTurn(a);
    const lb = endTurn(b);
    expect(la).toEqual(lb);
    expect(a.owner).toEqual(b.owner);
  });

  it("conserve les 26 provinces et n'en déplace que d'une frontière à l'autre", () => {
    const c = fresh("la-france-se-fait", 5);
    for (let t = 0; t < 8 && c.status === "playing"; t++) {
      const before = clone(c);
      endTurn(c);
      expect(Object.keys(c.owner)).toHaveLength(26);
      for (const id of Object.keys(c.owner)) {
        if (c.owner[id] === before.owner[id]) continue;
        const attacker = c.owner[id];
        const touches = PROVINCES[id].neighbors.some((n) => before.owner[n] === attacker);
        expect(touches, `${id} ne touche pas ${attacker}`).toBe(true);
      }
    }
  });

  it("la chronique garde les majuscules des noms propres et contracte les articles", () => {
    expect(conquer(fresh(), "champagne")).toContain("prise au comté de Champagne");
    expect(conquer(fresh(), "normandie")).toContain("prise aux Plantagenêts");
    expect(conquer(fresh(), "bourgogne")).toContain("prise au duché de Bourgogne");
    for (let seed = 1; seed <= 6; seed++) {
      const lines = endTurn(fresh("la-france-se-fait", seed)).join(" ");
      expect(lines).not.toMatch(/comté de champagne|duché de bourgogne|comté de flandre|comté de toulouse/);
    }
  });

  it("seuls les camps adverses attaquent", () => {
    const c = fresh();
    const lines = endTurn(c);
    for (const l of lines) expect(l).not.toContain("la Couronne l'emporte");
    expect(AI_FACTIONS).not.toContain(CROWN);
  });

  it("la campagne est perdue quand la Couronne n'a plus de province", () => {
    const c = fresh();
    for (const id of provincesOf(c, CROWN)) c.owner[id] = "plantagenets";
    endTurn(c);
    expect(c.status).toBe("lost");
  });
});

describe("sauvegarde", () => {
  it("se relit à l'identique", () => {
    const c = fresh();
    conquer(c, "normandie");
    endTurn(c);
    expect(deserialize(serialize(c))).toEqual(c);
  });

  it("rejette une sauvegarde absente, illisible ou périmée", () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize("{pas du json")).toBeNull();
    const c = fresh();
    delete (c.owner as Record<string, string>).corse;
    expect(deserialize(serialize(c))).toBeNull();
    expect(deserialize(JSON.stringify({ ...fresh(), scenario: "inconnu" }))).toBeNull();
  });
});
