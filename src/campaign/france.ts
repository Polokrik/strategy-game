import { AGGRESSIVE, DEFENSIVE, OPPORTUNIST, type Personality } from "../engine/ai";
import geo from "../data/france.json";

/**
 * Données de la campagne « histoire de France ». La géométrie vient de src/data/france.json (générée par
 * tools/build-france.py) ; l'histoire ci-dessous est écrite à la main, de mémoire : les dates et notes sont à
 * vérifier avant toute publication (seules quelques-unes ont été recoupées : Dauphiné 1349, Franche-Comté 1678,
 * Orléanais 987).
 */

export type ProvinceId = string;
export type FactionId = "crown" | "plantagenets" | "flandre" | "empire" | "toulouse" | "bourgogne" | "champagne" | "neutral";

/** Accorde le verbe avec un nom de camp : « Les Plantagenêts attaquent », « Le comté de Flandre attaque ». */
export const agree = (name: string, singular: string, plural: string): string => (name.startsWith("Les ") ? plural : singular);

export const CROWN: FactionId = "crown";
export const NEUTRAL_FACTION: FactionId = "neutral";

export interface Province {
  id: ProvinceId;
  name: string;
  /** point d'ancrage (nom, sélection), à l'intérieur de la province */
  x: number;
  y: number;
  area: number;
  shapes: [number, number][][];
  neighbors: ProvinceId[];
}

export const MAP = {
  width: geo.width,
  height: geo.height,
  provinces: geo.provinces as Province[],
  seaLinks: geo.seaLinks as [ProvinceId, ProvinceId][],
};

export const PROVINCES: Record<ProvinceId, Province> = Object.fromEntries(MAP.provinces.map((p) => [p.id, p]));

/** Taille de la bataille : 1 petite province, 2 moyenne, 3 grande. */
export type Tier = 1 | 2 | 3;
export const tierOf = (id: ProvinceId): Tier => {
  const a = PROVINCES[id].area;
  return a < 120 ? 1 : a < 215 ? 2 : 3;
};

export interface History {
  /** année du rattachement à la Couronne, dans l'histoire */
  joined: number;
  note: string;
}

export const HISTORY: Record<ProvinceId, History> = {
  "ile-de-france": { joined: 987, note: "Domaine royal d'origine des Capétiens." },
  orleanais: { joined: 987, note: "Dans le domaine royal depuis Hugues Capet." },
  berry: { joined: 1101, note: "Vicomté de Bourges acquise par Philippe Ier." },
  picardie: { joined: 1185, note: "L'Amiénois et le Vermandois reviennent à Philippe Auguste." },
  normandie: { joined: 1204, note: "Conquise par Philippe Auguste sur Jean sans Terre." },
  "anjou-touraine": { joined: 1204, note: "L'Anjou et la Touraine sont pris aux Plantagenêts." },
  maine: { joined: 1204, note: "Conquis avec l'Anjou." },
  poitou: { joined: 1224, note: "Pris en 1204, confirmé par Louis VIII en 1224." },
  auvergne: { joined: 1213, note: "Conquise par Philippe Auguste ; réunie pour de bon en 1531." },
  saintonge: { joined: 1242, note: "Victoire de Taillebourg, sous Saint Louis." },
  languedoc: { joined: 1271, note: "Héritage du comté de Toulouse, après la croisade des Albigeois." },
  champagne: { joined: 1284, note: "Mariage de Philippe le Bel avec Jeanne de Navarre." },
  lyonnais: { joined: 1312, note: "Traité de Vienne : Lyon passe à la Couronne." },
  dauphine: { joined: 1349, note: "Humbert II cède le Dauphiné ; le fils du roi devient le dauphin." },
  limousin: { joined: 1370, note: "Reconquis sur les Anglais." },
  guyenne: { joined: 1453, note: "Fin de la guerre de Cent Ans (Castillon)." },
  gascogne: { joined: 1453, note: "Fin de la guerre de Cent Ans (Castillon)." },
  bourgogne: { joined: 1477, note: "À la mort de Charles le Téméraire." },
  provence: { joined: 1481, note: "Legs de Charles du Maine à Louis XI." },
  bretagne: { joined: 1532, note: "Union perpétuelle du duché de Bretagne à la France." },
  alsace: { joined: 1648, note: "Traités de Westphalie ; Strasbourg en 1681." },
  "flandre-artois": { joined: 1659, note: "Artois cédé par le traité des Pyrénées ; la Flandre wallonne suit (1668-1678)." },
  "franche-comte": { joined: 1678, note: "Conquise par Louis XIV (traité de Nimègue)." },
  lorraine: { joined: 1766, note: "À la mort de Stanislas Leszczynski." },
  corse: { joined: 1768, note: "Cédée par Gênes (traité de Versailles)." },
  savoie: { joined: 1860, note: "Traité de Turin." },
};

export interface Faction {
  id: FactionId;
  name: string;
  personality: Personality;
  /** multiplicateur de production de ses troupes en bataille : le réglage de difficulté */
  handicap: number;
  /** manière de se battre, affichée au joueur */
  style: "agressifs" | "défensifs" | "opportunistes";
  /** probabilité d'attaquer à chaque tour */
  aggression: number;
  /** poids supplémentaire des cibles qui appartiennent à la Couronne */
  hostility: number;
}

export const FACTIONS: Record<FactionId, Faction> = {
  crown: { id: "crown", name: "La Couronne", personality: DEFENSIVE, style: "défensifs", handicap: 1, aggression: 0, hostility: 0 },
  plantagenets: { id: "plantagenets", name: "Les Plantagenêts", personality: AGGRESSIVE, style: "agressifs", handicap: 0.6, aggression: 0.5, hostility: 3 },
  flandre: { id: "flandre", name: "Le comté de Flandre", personality: OPPORTUNIST, style: "opportunistes", handicap: 0.6, aggression: 0.35, hostility: 1 },
  empire: { id: "empire", name: "Le Saint-Empire", personality: DEFENSIVE, style: "défensifs", handicap: 0.6, aggression: 0.3, hostility: 0 },
  toulouse: { id: "toulouse", name: "Le comté de Toulouse", personality: OPPORTUNIST, style: "opportunistes", handicap: 0.6, aggression: 0.3, hostility: 0 },
  bourgogne: { id: "bourgogne", name: "Le duché de Bourgogne", personality: DEFENSIVE, style: "défensifs", handicap: 0.6, aggression: 0.25, hostility: 1 },
  champagne: { id: "champagne", name: "Le comté de Champagne", personality: DEFENSIVE, style: "défensifs", handicap: 0.6, aggression: 0.25, hostility: 0 },
  neutral: { id: "neutral", name: "Terres indépendantes", personality: DEFENSIVE, style: "défensifs", handicap: 0.5, aggression: 0, hostility: 0 },
};

/** Les camps adverses, dans l'ordre où ils jouent. */
export const AI_FACTIONS: FactionId[] = ["plantagenets", "flandre", "toulouse", "empire", "bourgogne", "champagne"];

/** 1180 : Philippe Auguste monte sur le trône, le domaine royal est minuscule. */
export const START_OWNERS: Record<ProvinceId, FactionId> = {
  "ile-de-france": "crown",
  orleanais: "crown",
  berry: "crown",
  normandie: "plantagenets",
  "anjou-touraine": "plantagenets",
  maine: "plantagenets",
  poitou: "plantagenets",
  saintonge: "plantagenets",
  guyenne: "plantagenets",
  gascogne: "plantagenets",
  limousin: "plantagenets",
  bretagne: "plantagenets",
  "flandre-artois": "flandre",
  picardie: "flandre",
  champagne: "champagne",
  bourgogne: "bourgogne",
  languedoc: "toulouse",
  lorraine: "empire",
  alsace: "empire",
  "franche-comte": "empire",
  savoie: "empire",
  lyonnais: "empire",
  dauphine: "empire",
  provence: "empire",
  auvergne: "neutral",
  corse: "neutral",
};

export interface Scenario {
  id: string;
  title: string;
  blurb: string;
  /** provinces à détenir pour gagner, ou toutes */
  goal: ProvinceId[] | "all";
  startYear: number;
  yearsPerTurn: number;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "philippe-auguste",
    title: "Les conquêtes de Philippe Auguste",
    blurb: "1180. Le domaine royal tient dans trois provinces ; l'empire Plantagenêt en tient neuf. Prends la Normandie, l'Anjou-Touraine, le Maine, le Poitou et la Picardie.",
    goal: ["normandie", "anjou-touraine", "maine", "poitou", "picardie"],
    startYear: 1180,
    yearsPerTurn: 3,
  },
  {
    id: "la-france-se-fait",
    title: "La France se fait",
    blurb: "1180. Reconstruis le royaume province après province, jusqu'à la Corse. Longue campagne : plusieurs sessions.",
    goal: "all",
    startYear: 1180,
    yearsPerTurn: 3,
  },
];
