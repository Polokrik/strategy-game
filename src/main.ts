import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/lilita-one/400.css";

import {
  type CampaignState,
  DANGER_LABELS,
  INCOME,
  type Mission,
  type Threat,
  type TurnEvent,
  type TurnReport,
  attackerTroops,
  autoSlotCost,
  battleLevel,
  buyAutoSlot,
  canBuyAutoSlot,
  canAttack,
  canFortify,
  dangerOf,
  defenseLevel,
  defenseOf,
  deserialize,
  fortCost,
  fortOf,
  fortify,
  goalOf,
  newCampaign,
  passTurn,
  playAttack,
  playDefense,
  provincesOf,
  scenarioOf,
  serialize,
  targets,
  threatOn,
  threatsOnCrown,
  winChance,
  yearOf,
} from "./campaign/campaign";
import { CROWN, type FactionId, FACTIONS, HISTORY, MAP, PROVINCES, type ProvinceId, SCENARIOS, START_OWNERS, agree, tierOf } from "./campaign/france";
import { CAMPAIGN_WORLD, drawCampaign, provinceAt } from "./campaign/render";
import { AUTO_THRESHOLDS, autoStatus, makeAutoReinforce, suggestFlags } from "./engine/auto";
import { LEVELS, type LevelDef, WORLD_H, WORLD_W, makeLevelAis } from "./engine/level";
import { findPath, send, step } from "./engine/sim";
import { type Base, type GameState, PLAYER } from "./engine/types";
import { heroSvg, launchConfetti } from "./hero";
import { type AutoMark, type Preview, type View, drawScene, shares } from "./render";
import { FACTION, applyTheme } from "./theme";

const FIXED_DT = 1 / 60;
/** Un toucher compte pour un territoire s'il tombe à moins de cette distance (unités monde) de son centre. */
const TOUCH_RANGE = 19;
const KEY_DONE = "conquete.done";
const KEY_AUTO = "conquete.auto";
const KEY_CAMPAIGN = "conquete.campagne"; // ancienne sauvegarde unique, reprise dans son scénario
const KEY_JOURNAL = "conquete.journal";
const keyOf = (scenario: string): string => `${KEY_CAMPAIGN}.${scenario}`;
const KEY_DIFFICULTY = "conquete.difficulte";
const DIFFICULTIES: [string, number][] = [
  ["Zen", 0.8],
  ["Facile", 1],
  ["Normal", 1.25],
  ["Dur", 1.5],
  ["Cruel", 1.8],
];
/** Durée d'une attaque dans l'animation de fin de tour. */
const PHASE_SECONDS = 1.6;

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

type Mode = "menu" | "game" | "result" | "campaign" | "chronicle" | "pick";

let state: GameState | null = null;
let currentDef: LevelDef = LEVELS[0];
let ais: ((s: GameState, dt: number) => void)[] = [];
let auto: ((s: GameState, dt: number) => void) | null = null;
let running = false;
let paused = false;
let mode: Mode = "menu";
let tab: "chapters" | "campaign" = "chapters";
let selected = 0; // chapitre choisi dans le menu
let current = 0; // chapitre en cours
let autoThreshold = 0;
let autoOn = false; // renforts activés pour cette bataille (grisé au départ)
let autoFlags: number[] = []; // territoires cochés pour les renforts, dans l'ordre
let drag: { from: Base; x: number; y: number } | null = null;
let view: View = { w: 1, h: 1, scale: 1, offX: 0, offY: 0 };

// campagne
let camp: CampaignState | null = null; // la partie en cours (sauvegardée)
let preview: CampaignState | null = null; // la carte montrée derrière le menu
let campSelected: ProvinceId | null = null;
/** La bataille de campagne en cours : une attaque, ou la défense d'une province menacée. */
let battle: { kind: "attack" | "defend"; target: ProvinceId; threat?: Threat } | null = null;
/** Compte rendu d'une bataille terminée, en attendant que le joueur revienne sur la carte. */
let pending: { report: TurnReport; before: Record<ProvinceId, FactionId> } | null = null;
/** L'animation de fin de tour : les attaques défilent une à une sur la carte. */
let phase: { report: TurnReport; i: number; start: number; view: Record<ProvinceId, FactionId> } | null = null;
/** « Fais ton histoire » : l'écran où l'on choisit sa province de départ. */
let picking: { scenario: string; start: ProvinceId | null } | null = null;
let pickBoard: CampaignState | null = null;
let scenarioPick = 0;
let difficulty = 1.25;
/** Ordres donnés pendant la bataille en cours (instants en secondes de jeu) : sert à régler la difficulté sur le vrai rythme du joueur. */
let orderTimes: number[] = [];

function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null; // stockage indisponible : on perd juste la mémoire
  }
}
function loadDone(): number[] {
  try {
    return JSON.parse(store(KEY_DONE) ?? "[]");
  } catch {
    return [];
  }
}
const markDone = (i: number) => store(KEY_DONE, JSON.stringify([...new Set([...loadDone(), i])]));
/** Une sauvegarde par scénario : chaque campagne garde sa propre partie. */
const saves: Record<string, CampaignState | null> = {};
const saveCampaign = () => camp && ((saves[camp.scenario] = camp), store(keyOf(camp.scenario), serialize(camp)));
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/* ---------- mise en page du canvas ---------- */

const onCampaignMap = () => mode === "campaign" || mode === "chronicle" || mode === "pick" || (mode === "menu" && tab === "campaign");

/** Zone du canvas laissée à la carte, en pixels CSS, selon ce que l'interface recouvre. */
function mapInsets(): { top: number; bottom: number } {
  if (mode === "menu") return { top: 74, bottom: $("menu-bottom").getBoundingClientRect().height + 20 };
  if (mode === "campaign") {
    const bottom = phase ? 70 : $("camp-panel").getBoundingClientRect().height + 20;
    return { top: 112, bottom };
  }
  if (mode === "pick") return { top: 74, bottom: $("camp-panel").getBoundingClientRect().height + 20 };
  return { top: 62, bottom: $("dock").hidden ? 18 : $("dock").getBoundingClientRect().height + 24 };
}

function layout(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const world = onCampaignMap() ? CAMPAIGN_WORLD : { w: WORLD_W, h: WORLD_H };
  const { top, bottom } = mapInsets();
  const areaH = Math.max(80, window.innerHeight - top - bottom) * dpr;
  const scale = Math.min(canvas.width / world.w, areaH / world.h);
  view = {
    w: canvas.width,
    h: canvas.height,
    scale,
    offX: (canvas.width - world.w * scale) / 2,
    offY: top * dpr + (areaH - world.h * scale) / 2,
  };
}

function toWorld(e: PointerEvent): { x: number; y: number } {
  const dpr = window.devicePixelRatio || 1;
  return { x: (e.clientX * dpr - view.offX) / view.scale, y: (e.clientY * dpr - view.offY) / view.scale };
}

/** Territoire le plus proche du point (donc celui qui le contient), dans la limite d'une zone de toucher généreuse. */
function baseAt(x: number, y: number): Base | null {
  let best: Base | null = null;
  let bestD = TOUCH_RANGE;
  for (const b of state!.bases) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/* ---------- écrans ---------- */

function setMode(next: Mode): void {
  mode = next;
  $("menu").hidden = next !== "menu";
  $("hud").hidden = next !== "game";
  $("overlay").hidden = next !== "result";
  $("chronicle").hidden = next !== "chronicle";
  $("camp-hud").hidden = next !== "campaign";
  $("pick-hud").hidden = next !== "pick";
  $("camp-panel").hidden = !(next === "pick" || (next === "campaign" && phase === null));
  $("camp-banner").hidden = next !== "campaign" || phase === null;
  $("missions").hidden = true;
  $("dock").hidden = !(next === "game" && currentDef.auto);
  if (next !== "game") setPaused(false);
}

function showMenu(): void {
  running = false;
  drag = null;
  battle = null;
  phase = null;
  setMode("menu");
  renderMenu();
  layout();
}

function renderMenu(): void {
  const isCampaign = tab === "campaign";
  $("tab-chapters").setAttribute("aria-selected", String(!isCampaign));
  $("tab-campaign").setAttribute("aria-selected", String(isCampaign));
  $("pane-chapters").hidden = isCampaign;
  $("pane-campaign").hidden = !isCampaign;
  if (isCampaign) renderCampaignMenu();
  else renderChapters();
}

function renderChapters(): void {
  state = LEVELS[selected].build();
  const done = loadDone();
  $("track").replaceChildren(
    ...LEVELS.map((l, i) => {
      const li = document.createElement("li");
      if (done.includes(i)) li.className = "done";
      const b = document.createElement("button");
      b.className = `node${done.includes(i) ? " done" : ""}`;
      b.textContent = done.includes(i) ? "✓" : String(i + 1);
      b.setAttribute("aria-label", `Chapitre ${i + 1} : ${l.title}${done.includes(i) ? ", terminé" : ""}`);
      if (i === selected) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => {
        selected = i;
        showMenu();
      });
      li.append(b);
      return li;
    }),
  );
  $("m-eyebrow").textContent = `Chapitre ${selected + 1}`;
  $("m-title").textContent = LEVELS[selected].title;
  $("m-notion").textContent = LEVELS[selected].notion;
}

function segmented(host: HTMLElement, items: string[], pressed: number, onPick: (i: number) => void): void {
  host.replaceChildren(
    ...items.map((label, i) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("aria-pressed", String(i === pressed));
      b.addEventListener("click", () => onPick(i));
      return b;
    }),
  );
}

function renderCampaignMenu(): void {
  const sc = SCENARIOS[scenarioPick];
  segmented($("scenarios"), SCENARIOS.map((s) => s.short), scenarioPick, (i) => {
    scenarioPick = i;
    renderMenu();
    layout();
  });
  $("c-title").textContent = sc.title;
  $("c-blurb").textContent = sc.blurb;
  const saved = saves[sc.id]?.status === "playing" ? saves[sc.id]! : null;
  // avec une partie en cours, le réglage la concerne directement (effet dès le prochain tour) ; sinon c'est celui de la nouvelle partie
  const level = saved ? (saved.difficulty ?? 1) : difficulty;
  segmented(
    $("difficulty"),
    DIFFICULTIES.map(([name]) => name),
    DIFFICULTIES.findIndex(([, v]) => v === level),
    (i) => {
      if (saved) {
        saved.difficulty = DIFFICULTIES[i][1];
        camp = saved;
        saveCampaign();
      } else {
        difficulty = DIFFICULTIES[i][1];
        store(KEY_DIFFICULTY, String(difficulty));
      }
      renderMenu();
    },
  );
  $("diff-note").textContent = saved
    ? "Difficulté de cette partie, effet immédiat."
    : "Difficulté de la prochaine partie.";
  const cont = $("c-continue") as HTMLButtonElement;
  cont.disabled = !saved;
  cont.textContent = saved ? `Continuer · tour ${saved.turn + 1}` : "Continuer";
  $("c-eyebrow").textContent = saved ? "Partie en cours" : "Aucune partie en cours";
  // la carte d'aperçu : la partie en cours, sinon le départ du scénario choisi
  state = null;
  preview = saved ?? newCampaign(sc.custom ? "la-france-se-fait" : sc.id, 1);
}

function renderAutoDock(): void {
  $("auto-toggle").setAttribute("aria-pressed", String(autoOn));
  $("auto-opts").hidden = !autoOn;
  $("auto").replaceChildren(
    ...AUTO_THRESHOLDS.filter((t) => t > 0).map((t) => {
      const b = document.createElement("button");
      b.textContent = String(t);
      b.setAttribute("aria-pressed", String(t === autoThreshold));
      b.setAttribute("aria-label", `Renforts automatiques à ${t} troupes`);
      b.addEventListener("click", () => {
        autoThreshold = t;
        store(KEY_AUTO, String(t));
        renderAutoDock();
      });
      return b;
    }),
  );
}

/** Active ou coupe les renforts : à l'activation, les meilleurs territoires de l'arrière sont cochés d'office. */
function toggleAutoMode(): void {
  autoOn = !autoOn;
  if (autoOn) {
    if (autoThreshold === 0) autoThreshold = 20;
    if (state && autoFlags.length === 0) autoFlags = suggestFlags(state, PLAYER, undefined, currentDef?.autoBonus);
  }
  renderAutoDock();
  layout(); // le bandeau change de hauteur
}

/** Lance une bataille : un chapitre, ou celle d'une province de la campagne. */
function launch(def: LevelDef): void {
  currentDef = def;
  state = def.build();
  ais = makeLevelAis(def);
  autoFlags = [];
  autoOn = false;
  orderTimes = [];
  auto = def.auto ? makeAutoReinforce(PLAYER, () => (autoOn ? autoThreshold : 0), () => autoFlags, undefined, def.autoBonus) : null;
  drag = null;
  running = true;
  renderAutoDock();
  setMode("game");
  layout();
}

function startChapter(): void {
  current = selected;
  battle = null;
  launch(LEVELS[current]);
}

/* ---------- pause ---------- */

function setPaused(on: boolean): void {
  paused = on && mode === "game" && running;
  $("pause").hidden = !paused;
  if (paused) {
    $("pause-text").textContent = battle
      ? battle.kind === "attack"
        ? "Se retirer compte pour une défaite : la province n'est pas prise et le tour est perdu."
        : "Se retirer compte pour une défaite : la province tombe."
      : "La partie est en pause.";
    $("pause-quit").textContent = battle ? "Se retirer" : "Quitter";
  }
}

/** Quitter depuis la pause : un chapitre revient au menu ; une bataille de campagne est une défaite. */
function quitBattle(): void {
  if (!battle || !camp) return showMenu();
  finishCampaignBattle(false, state?.time ?? 0, false);
}

/* ---------- résultat d'une bataille ---------- */

function showResult(): void {
  if (!state) return;
  const s = state;
  const won = s.winner === PLAYER;
  const inCampaign = battle !== null && camp !== null;
  if (inCampaign) finishCampaignBattle(won, s.time, true);
  else if (won) markDone(current);
  $("hero").innerHTML = heroSvg(won);
  $("ribbon").className = `ribbon${won ? "" : " lose"}`;
  const attack = battle?.kind === "attack";
  $("result").textContent = !inCampaign
    ? won
      ? "Victoire !"
      : "Défaite"
    : attack
      ? won
        ? "Province conquise !"
        : "Repoussé"
      : won
        ? "Province défendue !"
        : "Province perdue";
  $("stat-time").textContent = fmtTime(s.time);
  $("stat-land").textContent = `${s.bases.filter((b) => b.owner === PLAYER).length}/${s.bases.length}`;
  const next = $("next");
  next.hidden = inCampaign ? false : !won || current + 1 >= LEVELS.length;
  next.textContent = inCampaign ? "Continuer" : "Chapitre suivant";
  $("replay").hidden = inCampaign;
  $("to-menu").hidden = inCampaign;
  if (won) launchConfetti($("confetti"));
  else $("confetti").replaceChildren();
  setMode("result");
}

/** Applique le résultat d'une bataille de campagne. `showScreen` : passer par l'écran de résultat, sinon retour direct à la carte. */
function finishCampaignBattle(won: boolean, seconds: number, showScreen: boolean): void {
  if (!battle || !camp) return;
  logBattle(won, seconds);
  const before = { ...camp.owner };
  const report =
    battle.kind === "attack" ? playAttack(camp, battle.target, won, seconds) : playDefense(camp, battle.threat!, won, seconds);
  saveCampaign();
  pending = { report, before };
  running = false;
  if (!showScreen) afterBattle();
}

/** Journal de jeu : une ligne par bataille de campagne, gardé en local, à copier pour caler l'équilibrage. */
function logBattle(won: boolean, seconds: number): void {
  if (!camp || !battle) return;
  const gaps = orderTimes.slice(1).map((t, i) => t - orderTimes[i]);
  const entry = {
    scenario: camp.scenario,
    difficulty: camp.difficulty ?? 1,
    turn: camp.turn + 1,
    kind: battle.kind,
    target: battle.target,
    won,
    seconds: Math.round(seconds),
    orders: orderTimes.length,
    gap: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
    auto: autoOn ? autoThreshold : 0,
    cases: camp.autoSlots,
    gold: camp.gold,
  };
  try {
    const all = JSON.parse(store(KEY_JOURNAL) ?? "[]") as unknown[];
    store(KEY_JOURNAL, JSON.stringify([...all, entry].slice(-200)));
  } catch {
    /* journal facultatif */
  }
}

/** De l'écran de résultat à la carte, où les attaques du tour défilent. */
function afterBattle(): void {
  const p = pending;
  pending = null;
  battle = null;
  showCampaign();
  if (p) startPhase(p.report, p.before);
}

/* ---------- campagne ---------- */

function openCampaign(c: CampaignState): void {
  camp = c;
  saveCampaign();
  showCampaign();
}

function showCampaign(): void {
  if (!camp) return showMenu();
  running = false;
  battle = null;
  campSelected = null;
  setMode("campaign");
  renderCampaign();
  layout();
}

const dots = (n: number) => "●".repeat(n) + "○".repeat(5 - n);

function chip(text: string, cls = ""): HTMLElement {
  const el = document.createElement("span");
  el.className = `chip ${cls}`.trim();
  el.textContent = text;
  return el;
}

/** Bandeau du haut : année, or, missions, objectif, attaques annoncées. */
function renderCampaignHud(c: CampaignState): void {
  $("camp-when").textContent = `${yearOf(c)} · tour ${c.turn + 1}`;
  $("gold-n").textContent = String(c.gold);
  $("mission-n").textContent = String(c.missions.length);
  const goal = goalOf(c);
  const held = goal.filter((id) => c.owner[id] === CROWN).length;
  $("camp-goal").textContent =
    scenarioOf(c).goal === "all" ? `${provincesOf(c, CROWN).length}/${MAP.provinces.length} provinces` : `Objectif ${held}/${goal.length} ★`;
  const n = threatsOnCrown(c).length;
  const warn = $("camp-threats");
  warn.hidden = n === 0;
  warn.textContent = `⚠ ${n} attaque${n > 1 ? "s" : ""} annoncée${n > 1 ? "s" : ""}`;
}

/** Fiche de la province choisie : qui la tient, à quel point c'est dur, ce qu'on peut faire. */
function renderCampaign(): void {
  const c = camp!;
  renderCampaignHud(c);
  const chips = $("cp-chips");
  const main = $("cp-main") as HTMLButtonElement;
  const fortBtn = $("cp-fort") as HTMLButtonElement;
  const id = campSelected;
  chips.replaceChildren();
  fortBtn.hidden = true;
  $("cp-pass").hidden = false;
  const autoBtn = $("cp-auto") as HTMLButtonElement;
  const slotCost = autoSlotCost(c);
  autoBtn.hidden = false;
  autoBtn.innerHTML = `Case auto +1<small>${slotCost === null ? "max" : `${slotCost} or`}</small>`;
  autoBtn.disabled = !canBuyAutoSlot(c);
  main.textContent = "Attaquer";
  main.disabled = true;
  if (!id) {
    $("cp-dot").style.background = FACTION[CROWN].fill;
    $("cp-faction").textContent = FACTIONS[CROWN].name;
    $("cp-name").textContent = "Choisis une province";
    const n = threatsOnCrown(c).length;
    $("cp-note").textContent =
      n > 0
        ? "Les flèches montrent qui attaque qui à la fin du tour. Touche une province menacée pour la défendre, ou une province cerclée d'or pour l'attaquer."
        : "Touche une province cerclée d'or pour l'attaquer, ou passe le tour pour laisser le royaume respirer.";
    return;
  }

  const owner = c.owner[id];
  const fac = FACTIONS[owner];
  const h = HISTORY[id];
  const level = fortOf(c, id);
  $("cp-dot").style.background = (FACTION[owner] ?? FACTION.neutral).fill;
  $("cp-faction").textContent = `${fac.name} · ${provincesOf(c, owner).length} prov.${owner === CROWN ? "" : ` · ${fac.style}`}`;
  $("cp-name").textContent = PROVINCES[id].name;
  const threat = threatOn(c, id);

  if (owner === CROWN) {
    chips.append(chip(`Revenu +${INCOME[tierOf(id)]} or par tour`), chip(`Forteresse ${level}/3`));
    fortBtn.hidden = false;
    const cost = fortCost(c, id);
    fortBtn.innerHTML = `Forteresse<small>${cost === null ? "niveau max" : `${cost} or`}</small>`;
    fortBtn.disabled = !canFortify(c, id);
    if (threat) {
      const play = Math.round(winChance(c, id, "defend") * 100);
      const left = Math.round(winChance(c, id, "auto") * 100);
      chips.append(
        chip(`⚠ ${FACTIONS[threat.attacker].name}, depuis ${PROVINCES[threat.from].name}`, "alert"),
        chip(`En jouant ~${play} %`),
        chip(`Défense auto ~${left} %`, left < 50 ? "alert" : ""),
      );
      main.textContent = "Défendre";
      main.disabled = c.status !== "playing";
      $("cp-note").textContent = `Défense : ${defenseOf(c, id)} troupes contre ${attackerTroops(c, threat.attacker)}. Sans toi, la défense est automatique, et lente.`;
    } else {
      $("cp-note").textContent = `Province de la Couronne, aucune attaque annoncée. ${h ? h.note : ""}`;
    }
    return;
  }

  const attackable = canAttack(c, id);
  if (attackable) {
    const danger = dangerOf(winChance(c, id, "attack"));
    chips.append(
      chip(`${dots(danger)} ${DANGER_LABELS[danger - 1]}`, `danger-${danger}`),
      chip(`Ton armée ${attackerTroops(c, CROWN)}`),
      chip(`Défense ${defenseOf(c, id)}${level ? ` (forteresse ${level})` : ""}`),
    );
    main.disabled = false;
    $("cp-note").textContent = `${h ? `${h.note} (rattachée en ${h.joined}.)` : ""}`;
  } else {
    chips.append(chip(`Défense ${defenseOf(c, id)}${level ? ` (forteresse ${level})` : ""}`), chip("Pas voisine de tes provinces"));
    $("cp-note").textContent = `${h ? `${h.note} (rattachée en ${h.joined}.)` : ""}`;
  }
  if (threat) {
    chips.append(chip(`Attaque : ${FACTIONS[threat.attacker].name}`, "alert"));
  }
}

const SIZE_LABELS = ["Petite province", "Province moyenne", "Grande province"] as const;

function startPicking(): void {
  picking = { scenario: SCENARIOS[scenarioPick].id, start: null };
  pickBoard = newCampaign("la-france-se-fait", 1);
  setMode("pick");
  renderPick();
  layout();
}

/** Fiche de la province de départ envisagée. */
function renderPick(): void {
  const id = picking?.start ?? null;
  const main = $("cp-main") as HTMLButtonElement;
  $("cp-fort").hidden = true;
  $("cp-auto").hidden = true;
  $("cp-pass").hidden = true;
  main.textContent = "Commencer ici";
  main.disabled = id === null;
  const chips = $("cp-chips");
  chips.replaceChildren();
  if (!id) {
    $("cp-dot").style.background = FACTION[CROWN].fill;
    $("cp-faction").textContent = "Fais ton histoire";
    $("cp-name").textContent = "Choisis ta province";
    $("cp-note").textContent = "Touche la province où tout commence. Tous les autres camps seront contre toi, et la Couronne d'origine devient indépendante.";
    return;
  }
  const owner = START_OWNERS[id];
  const h = HISTORY[id];
  $("cp-dot").style.background = (FACTION[owner] ?? FACTION.neutral).fill;
  $("cp-faction").textContent = `${FACTIONS[owner].name} en 1180`;
  $("cp-name").textContent = PROVINCES[id].name;
  chips.append(
    chip(SIZE_LABELS[tierOf(id) - 1]),
    chip(`${PROVINCES[id].neighbors.length} voisines`),
    chip(`Revenu +${INCOME[tierOf(id)]} or par tour`),
  );
  $("cp-note").textContent = h ? `${h.note} (rattachée en ${h.joined}.)` : "";
}

function confirmStart(): void {
  if (!picking?.start) return;
  const { scenario, start } = picking;
  picking = null;
  openCampaign(newCampaign(scenario, undefined, difficulty, start));
}

function selectProvince(id: ProvinceId | null): void {
  campSelected = id;
  renderCampaign();
  layout();
}

function attackOrDefend(): void {
  if (mode === "pick") return confirmStart();
  if (!camp || !campSelected || camp.status !== "playing") return;
  const id = campSelected;
  const threat = threatOn(camp, id);
  if (camp.owner[id] === CROWN && threat) {
    battle = { kind: "defend", target: id, threat };
    launch(defenseLevel(camp, threat));
  } else if (canAttack(camp, id)) {
    battle = { kind: "attack", target: id };
    launch(battleLevel(camp, id));
  }
}

function fortifySelected(): void {
  if (!camp || !campSelected) return;
  if (fortify(camp, campSelected)) {
    saveCampaign();
    renderCampaign();
  }
}

function buyAuto(): void {
  if (camp && buyAutoSlot(camp)) {
    saveCampaign();
    renderCampaign();
  }
}

function passTheTurn(): void {
  if (!camp || camp.status !== "playing") return;
  const before = { ...camp.owner };
  const report = passTurn(camp);
  saveCampaign();
  showCampaign();
  startPhase(report, before);
}

/* ---------- missions ---------- */

function missionProgress(c: CampaignState, m: Mission): string {
  const left = Math.max(0, m.expires - c.turn);
  const when = left <= 1 ? "dernier tour" : `${left} tours restants`;
  if (m.n && m.n > 1) return `${Math.min(m.progress, m.n)}/${m.n} · ${when}`;
  return when;
}

function showMissions(): void {
  if (!camp) return;
  const c = camp;
  $("mission-list").replaceChildren(
    ...(c.missions.length ? c.missions : []).map((m) => {
      const li = document.createElement("li");
      const text = document.createElement("div");
      text.className = "mtext";
      text.textContent = m.text;
      const small = document.createElement("small");
      small.textContent = missionProgress(c, m);
      text.append(small);
      const reward = document.createElement("div");
      reward.className = "reward";
      const coin = document.createElement("i");
      coin.className = "coin";
      reward.append(coin, `${m.reward}`);
      li.append(text, reward);
      return li;
    }),
  );
  $("missions").hidden = false;
}

/* ---------- fin de tour : qui attaque qui ---------- */

function describe(e: TurnEvent, verdictShown: boolean): string {
  const atk = FACTIONS[e.attacker].name;
  const name = PROVINCES[e.target].name;
  const base = e.attacker === CROWN ? `La Couronne attaque ${name}` : `${atk} ${agree(atk, "attaque", "attaquent")} ${name}`;
  if (!verdictShown) return base + "…";
  return `${base} : ${e.won ? (e.defender === CROWN ? "la province tombe !" : "province prise !") : "attaque repoussée"}`;
}

function startPhase(report: TurnReport, before: Record<ProvinceId, FactionId>): void {
  phase = { report, i: 0, start: performance.now(), view: { ...before } };
  if (report.events.length === 0) return endPhase();
  $("camp-panel").hidden = true;
  $("camp-banner").hidden = false;
  layout();
}

function endPhase(): void {
  const report = phase?.report;
  phase = null;
  $("camp-banner").hidden = true;
  $("camp-panel").hidden = false;
  renderCampaign();
  layout();
  if (report) showChronicle(report);
}

function skipPhase(): void {
  if (phase) endPhase();
}

function showChronicle(report: TurnReport): void {
  if (!camp) return;
  $("chr-title").textContent = `Chronique · ${yearOf(camp)}`;
  const lines = report.lines.length ? report.lines : ["Rien à signaler : le royaume retient son souffle."];
  $("chr-lines").replaceChildren(
    ...lines.map((l) => {
      const li = document.createElement("li");
      li.textContent = l;
      return li;
    }),
  );
  setMode("chronicle");
}

/** Fin de la campagne : objectif atteint ou Couronne effacée. */
function showCampaignEnd(): void {
  const c = camp!;
  const won = c.status === "won";
  const years = c.turn * scenarioOf(c).yearsPerTurn;
  $("hero").innerHTML = heroSvg(won);
  $("ribbon").className = `ribbon${won ? "" : " lose"}`;
  $("result").textContent = won ? "Objectif atteint !" : "La Couronne s'efface";
  $("stat-time").textContent = `${years} ans`;
  $("stat-land").textContent = `${provincesOf(c, CROWN).length}/${MAP.provinces.length}`;
  $("next").hidden = true;
  $("replay").hidden = true;
  $("to-menu").hidden = false;
  if (won) launchConfetti($("confetti"));
  else $("confetti").replaceChildren();
  setMode("result");
}

function afterChronicle(): void {
  if (camp && camp.status !== "playing") showCampaignEnd();
  else showCampaign();
}

/* ---------- entrée ---------- */

function toggleAuto(id: number): void {
  if (!state) return;
  const st = autoStatus(state, PLAYER, autoFlags, undefined, currentDef?.autoBonus);
  if (autoFlags.includes(id)) {
    autoFlags = autoFlags.filter((f) => f !== id);
  } else if (st.flagged.length < st.cap) {
    autoFlags = [...st.flagged, id];
  } else {
    const el = $("auto-count");
    el.classList.remove("shake");
    void el.offsetWidth; // relance l'animation
    el.classList.add("shake");
  }
}

canvas.addEventListener("pointerdown", (e) => {
  if (mode === "pick" && picking) {
    const p = toWorld(e);
    const margin = (CAMPAIGN_WORLD.w - MAP.width) / 2;
    picking.start = provinceAt(p.x - margin, p.y - margin);
    renderPick();
    layout();
    return;
  }
  if (mode === "campaign" && camp) {
    if (phase) return skipPhase();
    const p = toWorld(e);
    const margin = (CAMPAIGN_WORLD.w - MAP.width) / 2;
    selectProvince(provinceAt(p.x - margin, p.y - margin));
    return;
  }
  if (!running || paused || !state) return;
  const p = toWorld(e);
  const b = baseAt(p.x, p.y);
  if (b && b.owner === PLAYER) {
    drag = { from: b, ...p };
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (drag) Object.assign(drag, toWorld(e));
});
canvas.addEventListener("pointerup", (e) => {
  if (!drag || !state) return;
  const p = toWorld(e);
  const target = baseAt(p.x, p.y);
  if (target && target.id === drag.from.id) {
    if (auto && autoOn) toggleAuto(target.id); // un simple toucher coche ou décoche le territoire
  } else if (target) {
    send(state, drag.from.id, target.id, PLAYER);
    orderTimes.push(state.time);
  }
  drag = null;
});
canvas.addEventListener("pointercancel", () => (drag = null));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mode === "game") setPaused(!paused);
});
$("auto-toggle").addEventListener("click", toggleAutoMode);
$("play").addEventListener("click", startChapter);
$("replay").addEventListener("click", startChapter);
$("next").addEventListener("click", () => {
  if (pending) return afterBattle();
  selected = Math.min(current + 1, LEVELS.length - 1);
  showMenu();
});
$("to-menu").addEventListener("click", showMenu);
$("back").addEventListener("click", () => setPaused(true));
$("pause-btn").addEventListener("click", () => setPaused(true));
$("pause-resume").addEventListener("click", () => setPaused(false));
$("pause-quit").addEventListener("click", quitBattle);
$("tab-chapters").addEventListener("click", () => {
  tab = "chapters";
  showMenu();
});
$("tab-campaign").addEventListener("click", () => {
  tab = "campaign";
  showMenu();
});
$("c-continue").addEventListener("click", () => {
  const saved = saves[SCENARIOS[scenarioPick].id];
  if (saved?.status !== "playing") return;
  camp = saved;
  showCampaign();
});
$("c-journal").addEventListener("click", async () => {
  const text = store(KEY_JOURNAL) ?? "[]";
  const btn = $("c-journal");
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Journal copié ✓";
  } catch {
    window.prompt("Copie ce journal de jeu :", text);
  }
});
$("c-new").addEventListener("click", () => {
  if (saves[SCENARIOS[scenarioPick].id]?.status === "playing" && !window.confirm("Cette campagne est en cours. La remplacer par une nouvelle partie ?")) return;
  if (SCENARIOS[scenarioPick].custom) return startPicking();
  openCampaign(newCampaign(SCENARIOS[scenarioPick].id, undefined, difficulty));
});
$("pick-back").addEventListener("click", showMenu);
$("camp-back").addEventListener("click", showMenu);
$("cp-main").addEventListener("click", attackOrDefend);
$("cp-fort").addEventListener("click", fortifySelected);
$("cp-auto").addEventListener("click", buyAuto);
$("cp-pass").addEventListener("click", passTheTurn);
$("camp-missions").addEventListener("click", showMissions);
$("missions-ok").addEventListener("click", () => ($("missions").hidden = true));
$("camp-threats").addEventListener("click", () => camp && selectProvince(threatsOnCrown(camp)[0]?.target ?? null));
$("chr-ok").addEventListener("click", afterChronicle);
window.addEventListener("resize", layout);

/* ---------- affichage ---------- */

function previewOf(s: GameState): Preview | null {
  if (!drag) return null;
  const hover = baseAt(drag.x, drag.y);
  if (!hover || hover === drag.from) return { kind: "free", from: drag.from, x: drag.x, y: drag.y };
  const route = findPath(s, drag.from.id, hover.id, PLAYER);
  if (!route) return { kind: "blocked", from: drag.from, at: hover };
  return { kind: "route", from: drag.from, points: route.path.map((id) => [s.bases[id].x, s.bases[id].y]) };
}

let shareKey = "";
function updateShare(s: GameState): void {
  const parts = shares(s);
  const key = parts.map((p) => `${p.owner}:${p.count}`).join("|");
  if (key === shareKey) return;
  shareKey = key;
  $("share").replaceChildren(
    ...parts.map((p) => {
      const span = document.createElement("span");
      span.style.flexGrow = String(p.count);
      span.style.background = `var(--owner-${p.owner})`;
      return span;
    }),
  );
}

/** Fait avancer l'animation de fin de tour et retourne l'attaque affichée. */
function stepPhase(now: number): { event: TurnEvent; t: number } | null {
  if (!phase) return null;
  const events = phase.report.events;
  const t = (now - phase.start) / 1000 / PHASE_SECONDS;
  const event = events[phase.i];
  $("camp-banner").textContent = describe(event, t > 0.55);
  if (t >= 1) {
    if (event.won) phase.view[event.target] = event.attacker;
    phase.i++;
    phase.start = now;
    if (phase.i >= events.length) {
      endPhase();
      return null;
    }
  }
  return { event, t: Math.min(1, t) };
}

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (running && !paused && state && acc >= FIXED_DT) {
    for (const ai of ais) ai(state, FIXED_DT);
    auto?.(state, FIXED_DT);
    step(state, FIXED_DT);
    acc -= FIXED_DT;
    if (state.winner !== null) {
      running = false;
      showResult();
    }
  }
  if (!running || paused) acc = 0;

  if (onCampaignMap()) {
    const c = mode === "menu" ? preview : mode === "pick" ? pickBoard : camp;
    if (c) {
      const live = mode === "campaign" && !phase;
      const anim = mode === "campaign" ? stepPhase(now) : null;
      drawCampaign(ctx, view, c, {
        ownerView: phase?.view,
        selected: mode === "pick" ? (picking?.start ?? null) : live ? campSelected : null,
        attackable: live ? targets(c) : [],
        goal: mode === "pick" ? [] : goalOf(c),
        threats: live ? c.threats : [],
        anim,
        time: now / 1000,
      });
    }
    requestAnimationFrame(frame);
    return;
  }

  if (state && mode === "game") {
    $("timer").textContent = fmtTime(state.time);
    updateShare(state);
  }
  const shown = mode === "result" ? null : state;
  let marks: AutoMark[] = [];
  if (shown && running && auto && autoOn) {
    const st = autoStatus(shown, PLAYER, autoFlags, undefined, currentDef?.autoBonus);
    marks = shown.bases
      .filter((b) => b.owner === PLAYER)
      .map((b) => ({ id: b.id, flagged: st.flagged.includes(b.id), active: st.active.includes(b.id) }));
    const count = $("auto-count");
    count.textContent = `${st.flagged.length}/${st.cap} cases`;
    count.classList.toggle("full", st.flagged.length >= st.cap);
  }
  drawScene(ctx, view, shown, drag?.from.id ?? null, shown && running && !paused ? previewOf(shown) : null, marks);
  requestAnimationFrame(frame);
}

applyTheme();
autoThreshold = Number(store(KEY_AUTO) ?? 0);
if (!(AUTO_THRESHOLDS as readonly number[]).includes(autoThreshold)) autoThreshold = 0;
difficulty = Number(store(KEY_DIFFICULTY) ?? 1.25);
if (!DIFFICULTIES.some(([, v]) => v === difficulty)) difficulty = 1.25;
for (const sc of SCENARIOS) saves[sc.id] = deserialize(store(keyOf(sc.id)));
const legacy = deserialize(store(KEY_CAMPAIGN));
if (legacy && !saves[legacy.scenario]) saves[legacy.scenario] = legacy;
camp = null;
const finished = loadDone();
const firstTodo = LEVELS.findIndex((_, i) => !finished.includes(i));
selected = firstTodo === -1 ? LEVELS.length - 1 : firstTodo;
showMenu();
requestAnimationFrame(frame);
