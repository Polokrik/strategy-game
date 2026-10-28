import { describe, expect, it } from "vitest";
import { makeLevelAis } from "../engine/level";
import {
  ACTIVE_MISSIONS,
  AI_MAX_FORT,
  type CampaignState,
  DANGER_LABELS,
  DEFENSE_LOOT,
  FORT_COST,
  FORT_TROOPS,
  LOOT,
  START_GOLD,
  battleLevel,
  canAttack,
  canFortify,
  dangerOf,
  defenseLevel,
  defenseOf,
  deserialize,
  fortify,
  goalReached,
  incomeOf,
  newCampaign,
  passTurn,
  playAttack,
  playDefense,
  pressure,
  provincesOf,
  resolveBattle,
  serialize,
  targets,
  threatOn,
  threatsOnCrown,
  winChance,
  yearOf,
} from "./campaign";
import { AI_FACTIONS, CROWN, FACTIONS, HISTORY, MAP, PROVINCES, SCENARIOS, START_OWNERS, tierOf } from "./france";
import { evaluateMissions } from "./missions";

const fresh = (scenario = "philippe-auguste", seed = 42): CampaignState => newCampaign(scenario, seed);
const clone = (c: CampaignState): CampaignState => JSON.parse(JSON.stringify(c));
/** une campagne sans attaque annoncée ni mission, pour isoler ce qu'on teste */
const quiet = (scenario = "philippe-auguste", seed = 42): CampaignState => {
  const c = fresh(scenario, seed);
  c.threats = [];
  c.missions = [];
  return c;
};

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
    expect([...new Set(MAP.provinces.map((p) => tierOf(p.id)))].sort()).toEqual([1, 2, 3]);
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
  it("la Couronne tient trois provinces en 1180, au tour 0, avec de l'or et trois missions", () => {
    const c = fresh();
    expect(provincesOf(c, CROWN).sort()).toEqual(["berry", "ile-de-france", "orleanais"]);
    expect(c.turn).toBe(0);
    expect(yearOf(c)).toBe(1180);
    expect(c.status).toBe("playing");
    expect(c.gold).toBe(START_GOLD);
    expect(c.missions).toHaveLength(ACTIVE_MISSIONS);
    expect(new Set(c.missions.map((m) => m.kind)).size).toBe(ACTIVE_MISSIONS);
  });

  it("refuse un scénario inconnu", () => {
    expect(() => newCampaign("nimportequoi")).toThrow();
  });

  it("le revenu dépend de la taille des provinces tenues", () => {
    expect(incomeOf(fresh())).toBe(7); // Île-de-France 2 + Orléanais 3 + Berry 2
  });
});

describe("Fais ton histoire", () => {
  it("demande une province de départ valide", () => {
    expect(() => newCampaign("fais-ton-histoire", 1)).toThrow();
    expect(() => newCampaign("fais-ton-histoire", 1, 1, "atlantide")).toThrow();
  });

  it("le joueur commence seul dans la province choisie ; la Couronne d'origine devient indépendante", () => {
    const c = newCampaign("fais-ton-histoire", 1, 1, "bretagne");
    expect(provincesOf(c, CROWN)).toEqual(["bretagne"]);
    for (const id of ["ile-de-france", "orleanais", "berry"]) expect(c.owner[id]).toBe("neutral");
    expect(c.owner.normandie).toBe("plantagenets"); // les autres camps restent en place
    expect(c.status).toBe("playing");
    expect(targets(c).sort()).toEqual([...PROVINCES.bretagne.neighbors].sort());
  });

  it("choisir une province de la Couronne d'origine ne laisse pas un camp sans territoire", () => {
    const c = newCampaign("fais-ton-histoire", 1, 1, "berry");
    expect(provincesOf(c, CROWN)).toEqual(["berry"]);
    expect(provincesOf(c, "neutral")).toContain("ile-de-france");
  });

  it("un camp dont l'unique province est choisie disparaît sans bloquer la campagne", () => {
    const c = newCampaign("fais-ton-histoire", 3, 1, "champagne");
    expect(provincesOf(c, "champagne")).toHaveLength(0);
    for (let i = 0; i < 6 && c.status === "playing"; i++) passTurn(c);
    expect(Object.keys(c.owner)).toHaveLength(26);
  });

  it("l'objectif est la France entière et la sauvegarde se relit", () => {
    const c = newCampaign("fais-ton-histoire", 1, 1, "corse");
    expect(goalReached(c)).toBe(false);
    expect(deserialize(serialize(c))).toEqual(c);
  });
});

describe("attaques du joueur", () => {
  it("on n'attaque que les provinces voisines des siennes", () => {
    const c = fresh();
    expect(targets(c)).toContain("normandie");
    expect(targets(c)).not.toContain("bretagne");
    expect(canAttack(c, "normandie")).toBe(true);
    expect(canAttack(c, "bretagne")).toBe(false);
    expect(canAttack(c, "berry")).toBe(false);
  });

  it("une conquête rapporte un butin, le revenu, et ouvre de nouvelles cibles", () => {
    const c = quiet();
    const gold = c.gold;
    const r = playAttack(c, "normandie", true, 120);
    expect(c.owner.normandie).toBe(CROWN);
    expect(r.events[0]).toMatchObject({ attacker: CROWN, target: "normandie", won: true, played: true });
    expect(r.reward).toBe(LOOT[3]);
    expect(c.gold).toBe(gold + LOOT[3] + r.income);
    expect(r.income).toBe(incomeOf(c)); // Normandie incluse
    expect(c.turn).toBe(1);
    expect(canAttack(c, "bretagne")).toBe(true);
  });

  it("une défaite ne change rien mais consomme le tour", () => {
    const c = quiet();
    const r = playAttack(c, "normandie", false, 60);
    expect(c.owner.normandie).not.toBe(CROWN);
    expect(r.events[0]).toMatchObject({ won: false, played: true });
    expect(c.turn).toBe(1);
  });

  it("le scénario à objectif gagne quand les cinq provinces sont tenues", () => {
    const c = quiet();
    for (const id of ["normandie", "anjou-touraine", "maine", "poitou"]) c.owner[id] = CROWN;
    expect(goalReached(c)).toBe(false);
    playAttack(c, "picardie", true, 100);
    expect(goalReached(c)).toBe(true);
    expect(c.status).toBe("won");
  });

  it("on ne peut plus attaquer une fois la campagne terminée", () => {
    const c = fresh();
    c.status = "lost";
    expect(canAttack(c, "normandie")).toBe(false);
  });

  it("la chronique garde les derniers événements seulement", () => {
    const c = quiet();
    for (let i = 0; i < 30; i++) playAttack(c, "normandie", false, 10);
    expect(c.log.length).toBeLessThanOrEqual(16);
  });

  it("accorde le verbe avec le camp : « Les Plantagenêts l'emportent », « Le comté de Flandre l'emporte »", () => {
    const c = quiet();
    c.threats = [{ attacker: "plantagenets", from: "normandie", target: "berry" }];
    const lost = playDefense(c, c.threats[0], false, 20);
    expect(lost.lines[0]).toContain("Les Plantagenêts l'emportent malgré ta défense");
    const d = quiet();
    d.threats = [{ attacker: "flandre", from: "picardie", target: "ile-de-france" }];
    expect(playDefense(d, d.threats[0], false, 20).lines[0]).toContain("Le comté de Flandre l'emporte malgré ta défense");
  });

  it("la chronique garde les majuscules des noms propres et contracte les articles", () => {
    expect(playAttack(quiet(), "champagne", true, 90).lines[0]).toContain("prise au comté de Champagne");
    expect(playAttack(quiet(), "normandie", true, 90).lines[0]).toContain("prise aux Plantagenêts");
    expect(playAttack(quiet(), "bourgogne", true, 90).lines[0]).toContain("prise au duché de Bourgogne");
  });
});

describe("attaques annoncées", () => {
  const valid = (c: CampaignState) => {
    for (const t of c.threats) {
      expect(AI_FACTIONS).toContain(t.attacker);
      expect(c.owner[t.from], `${t.from} n'est pas à ${t.attacker}`).toBe(t.attacker);
      expect(PROVINCES[t.target].neighbors).toContain(t.from);
      expect(c.owner[t.target]).not.toBe(t.attacker);
    }
    expect(new Set(c.threats.map((t) => t.attacker)).size).toBe(c.threats.length); // une par camp
  };

  it("sont annoncées dès le départ, et à chaque tour, toujours cohérentes", () => {
    const c = fresh("la-france-se-fait", 3);
    valid(c);
    for (let i = 0; i < 12 && c.status === "playing"; i++) {
      passTurn(c);
      valid(c);
    }
  });

  it("on retrouve l'attaque annoncée contre une province", () => {
    const c = quiet();
    c.threats = [{ attacker: "plantagenets", from: "normandie", target: "ile-de-france" }];
    expect(threatOn(c, "ile-de-france")?.attacker).toBe("plantagenets");
    expect(threatOn(c, "berry")).toBeUndefined();
    expect(threatsOnCrown(c)).toHaveLength(1);
  });

  it("passer le tour résout les attaques annoncées sans le joueur", () => {
    const c = quiet();
    c.threats = [
      { attacker: "plantagenets", from: "normandie", target: "ile-de-france" },
      { attacker: "flandre", from: "picardie", target: "ile-de-france" },
    ];
    const r = passTurn(c);
    expect(r.events.length).toBeGreaterThanOrEqual(1);
    expect(r.events.every((e) => !e.played)).toBe(true);
    expect(c.turn).toBe(1);
  });

  it("une attaque dont la cible a changé de main entre-temps tombe à l'eau", () => {
    const c = quiet();
    c.owner["berry"] = "plantagenets";
    c.threats = [{ attacker: "plantagenets", from: "poitou", target: "berry" }];
    expect(passTurn(c).events).toHaveLength(0);
  });
});

describe("défense jouée", () => {
  const threatened = () => {
    const c = quiet();
    c.threats = [{ attacker: "plantagenets", from: "normandie", target: "ile-de-france" }];
    return c;
  };

  it("tenir la province rapporte un butin et ne la résout pas une seconde fois", () => {
    const c = threatened();
    const t = c.threats[0];
    const r = playDefense(c, t, true, 100);
    expect(c.owner["ile-de-france"]).toBe(CROWN);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ target: "ile-de-france", defender: CROWN, won: false, played: true });
    expect(r.reward).toBe(DEFENSE_LOOT);
  });

  it("perdre la défense (ou se retirer) donne la province à l'attaquant", () => {
    const c = threatened();
    const r = playDefense(c, c.threats[0], false, 30);
    expect(c.owner["ile-de-france"]).toBe("plantagenets");
    expect(r.events[0]).toMatchObject({ won: true, played: true });
  });

  it("la bataille de défense met le joueur en bas avec la défense de la province", () => {
    const c = threatened();
    const level = defenseLevel(c, c.threats[0]);
    const s = level.build();
    const mine = s.bases.find((b) => b.owner === 1)!;
    const foe = s.bases.find((b) => b.owner === 2)!;
    expect(mine.troops).toBe(defenseOf(c, "ile-de-france"));
    expect(foe.troops).toBeGreaterThan(20); // l'attaquant arrive avec l'armée de son camp
    expect(level.title).toContain("Île-de-France");
    expect(makeLevelAis(level)).toHaveLength(1);
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
      expect(level.title).toContain(PROVINCES[id].name);
    }
    expect(battleLevel(c, "normandie").build().bases.length).toBeGreaterThan(battleLevel(c, "maine").build().bases.length);
  });

  it("l'armée du joueur grossit avec ses provinces, la défense avec la taille de la province", () => {
    const c = quiet();
    const start = (id: string) => battleLevel(c, id).build().bases.find((b) => b.owner === 1)!.troops;
    const defense = (id: string) => battleLevel(c, id).build().bases.find((b) => b.owner === 2)!.troops;
    expect(start("maine")).toBe(26); // 20 + 2 × 3 provinces
    expect(defense("maine")).toBeLessThan(defense("normandie"));
    c.owner.normandie = CROWN;
    c.owner.maine = CROWN;
    expect(start("poitou")).toBe(30); // 5 provinces
  });

  it("la bataille d'une même province, au même état, est la même", () => {
    const c = fresh();
    const a = battleLevel(c, "normandie").build();
    const b = battleLevel(c, "normandie").build();
    expect(a.bases.map((x) => [x.x, x.y, x.owner, x.troops])).toEqual(b.bases.map((x) => [x.x, x.y, x.owner, x.troops]));
  });

  it("la résolution en accéléré se termine et donne un vainqueur", () => {
    expect(["attacker", "defender"]).toContain(resolveBattle(fresh(), "plantagenets", "crown", "berry", 7));
  });
});

describe("forteresses", () => {
  it("coûtent de l'or et ajoutent des troupes à la défense de la province", () => {
    const c = quiet();
    c.gold = 500;
    const before = defenseOf(c, "berry");
    expect(canFortify(c, "berry")).toBe(true);
    expect(fortify(c, "berry")).toContain("forteresse de niveau 1");
    expect(c.gold).toBe(500 - FORT_COST[0]);
    expect(defenseOf(c, "berry")).toBe(before + FORT_TROOPS);
    fortify(c, "berry");
    fortify(c, "berry");
    expect(c.fort.berry).toBe(3);
    expect(c.gold).toBe(500 - FORT_COST[0] - FORT_COST[1] - FORT_COST[2]);
  });

  it("refusent au niveau maximum, sans assez d'or, ou hors des provinces de la Couronne", () => {
    const c = quiet();
    c.gold = 10;
    expect(canFortify(c, "berry")).toBe(false);
    expect(fortify(c, "berry")).toBeNull();
    c.gold = 999;
    expect(canFortify(c, "normandie")).toBe(false);
    c.fort.berry = 3;
    expect(canFortify(c, "berry")).toBe(false);
  });

  it("les camps adverses se fortifient d'eux-mêmes au contact de la Couronne, jusqu'à un plafond", () => {
    const c = quiet();
    c.turn = 2;
    passTurn(c); // le tour 3 est un multiple de 3
    const forts = Object.entries(c.fort).filter(([id, lvl]) => lvl > 0 && c.owner[id] !== CROWN);
    expect(forts.length).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) passTurn(c);
    for (const [id, lvl] of Object.entries(c.fort)) if (c.owner[id] !== CROWN) expect(lvl).toBeLessThanOrEqual(AI_MAX_FORT);
  });
});

describe("missions", () => {
  const give = (c: CampaignState, m: Partial<CampaignState["missions"][number]> & Pick<CampaignState["missions"][number], "kind">) => {
    c.missions.push({ id: c.nextMissionId++, text: m.kind, reward: 50, progress: 0, since: c.turn, expires: c.turn + 8, ...m });
  };

  it("« prendre une province » se termine à la conquête et verse la récompense", () => {
    const c = quiet();
    give(c, { kind: "take", target: "normandie", reward: 80 });
    const gold = c.gold;
    const r = playAttack(c, "normandie", true, 100);
    expect(r.completed).toHaveLength(1);
    expect(c.gold).toBe(gold + LOOT[3] + r.income + 80);
    expect(c.missions.find((m) => m.kind === "take" && m.target === "normandie")).toBeUndefined();
  });

  it("« tenir N provinces », « défendre », « gagner vite » et « construire des forteresses »", () => {
    const c = quiet();
    give(c, { kind: "hold", n: 3, reward: 10 });
    give(c, { kind: "fast", reward: 10 });
    give(c, { kind: "defend", n: 1, reward: 10 });
    give(c, { kind: "fortress", n: 2, progress: 2, reward: 10 });
    const held = { attacker: "flandre" as const, from: "picardie", target: "ile-de-france", defender: CROWN, won: false, played: true };
    const r = evaluateMissions(c, [held], { kind: "defend", won: true, seconds: 80 });
    expect(r.completed.map((m) => m.kind).sort()).toEqual(["defend", "fast", "fortress", "hold"]);
  });

  it("une défense automatique ne compte pas pour la mission « défendre en personne »", () => {
    const c = quiet();
    give(c, { kind: "defend", n: 1 });
    const auto = { attacker: "flandre" as const, from: "picardie", target: "ile-de-france", defender: CROWN, won: false, played: false };
    expect(evaluateMissions(c, [auto], undefined).completed).toHaveLength(0);
  });

  it("construire une forteresse fait avancer la mission « construire 2 forteresses »", () => {
    const c = quiet();
    c.gold = 999;
    give(c, { kind: "fortress", n: 2 });
    fortify(c, "berry");
    expect(c.missions[0].progress).toBe(1);
    fortify(c, "orleanais");
    expect(evaluateMissions(c, [], undefined).completed).toHaveLength(1);
  });

  it("« gagner vite » exige de gagner en moins de 90 secondes", () => {
    const c = quiet();
    give(c, { kind: "fast" });
    expect(evaluateMissions(c, [], { kind: "attack", won: true, seconds: 95 }).completed).toHaveLength(0);
    expect(evaluateMissions(c, [], { kind: "attack", won: false, seconds: 30 }).completed).toHaveLength(0);
    expect(evaluateMissions(c, [], { kind: "defend", won: true, seconds: 60 }).completed).toHaveLength(1);
  });

  it("une mission dont le délai est passé disparaît sans pénalité", () => {
    const c = quiet();
    give(c, { kind: "take", target: "normandie", expires: 1 });
    c.turn = 1;
    const gold = c.gold;
    const r = evaluateMissions(c, [], undefined);
    expect(r.expired).toHaveLength(1);
    expect(c.gold).toBe(gold);
  });

  it("la liste se remplit toujours, avec des types différents", () => {
    const c = fresh("la-france-se-fait", 8);
    for (let i = 0; i < 15 && c.status === "playing"; i++) {
      passTurn(c);
      if (c.status !== "playing") break;
      expect(c.missions).toHaveLength(ACTIVE_MISSIONS);
      expect(new Set(c.missions.map((m) => m.kind)).size).toBe(ACTIVE_MISSIONS);
    }
  });
});

describe("lisibilité", () => {
  it("les chances de gagner sont des estimations stables entre 0 et 1", () => {
    const c = fresh();
    const a = winChance(c, "maine", "attack", 4);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
    expect(winChance(c, "maine", "attack", 4)).toBe(a);
  });

  it("une province qu'on ne défend pas n'a pas de risque de défense", () => {
    expect(winChance(fresh(), "berry", "defend")).toBe(1);
  });

  it("la difficulté se range en 5 niveaux, du plus facile au plus dur", () => {
    expect([1, 0.9, 0.7, 0.5, 0.3, 0.1, 0].map((p) => dangerOf(p))).toEqual([1, 1, 2, 3, 4, 5, 5]);
    expect(DANGER_LABELS).toHaveLength(5);
  });
});

describe("rattrapage", () => {
  it("la résistance monte avec la taille de l'empire, jusqu'à un plafond", () => {
    const c = quiet();
    expect(pressure(c)).toBe(1);
    for (const id of ["normandie", "maine", "poitou", "picardie", "champagne", "bourgogne"]) c.owner[id] = CROWN;
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
});

describe("fin de tour", () => {
  it("fait avancer l'année de 3 ans, verse le revenu", () => {
    const c = quiet();
    const gold = c.gold;
    const r = passTurn(c);
    expect(c.turn).toBe(1);
    expect(yearOf(c)).toBe(1183);
    expect(r.income).toBe(7);
    expect(c.gold).toBe(gold + 7);
  });

  it("est reproductible : même état, même hasard, mêmes événements", () => {
    const a = fresh("la-france-se-fait", 99);
    const b = clone(a);
    expect(passTurn(a)).toEqual(passTurn(b));
    expect(a.owner).toEqual(b.owner);
    expect(a.threats).toEqual(b.threats);
  });

  it("conserve les 26 provinces et n'en déplace que d'une frontière à l'autre", () => {
    const c = fresh("la-france-se-fait", 5);
    for (let t = 0; t < 8 && c.status === "playing"; t++) {
      const before = clone(c);
      passTurn(c);
      expect(Object.keys(c.owner)).toHaveLength(26);
      for (const id of Object.keys(c.owner)) {
        if (c.owner[id] === before.owner[id]) continue;
        const attacker = c.owner[id];
        expect(PROVINCES[id].neighbors.some((n) => before.owner[n] === attacker), `${id} ne touche pas ${attacker}`).toBe(true);
      }
    }
  });

  it("la campagne est perdue quand la Couronne n'a plus de province", () => {
    const c = quiet();
    for (const id of provincesOf(c, CROWN)) c.owner[id] = "plantagenets";
    passTurn(c);
    expect(c.status).toBe("lost");
    expect(c.threats).toHaveLength(0);
  });
});

describe("sauvegarde", () => {
  it("se relit à l'identique", () => {
    const c = fresh();
    playAttack(c, "normandie", true, 100);
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

  it("complète une sauvegarde d'une ancienne version (sans or, menaces, forteresses ni missions)", () => {
    const old = clone(fresh()) as Partial<CampaignState>;
    delete old.threats;
    delete old.fort;
    delete old.gold;
    delete old.missions;
    delete old.nextMissionId;
    const c = deserialize(JSON.stringify(old))!;
    expect(c).not.toBeNull();
    expect(c.gold).toBe(0);
    expect(c.threats).toEqual([]);
    expect(c.fort).toEqual({});
    expect(c.missions).toHaveLength(ACTIVE_MISSIONS);
  });
});
