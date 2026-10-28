import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/lilita-one/400.css";

import {
  type CampaignState,
  battleLevel,
  canAttack,
  conquer,
  deserialize,
  endTurn,
  goalOf,
  newCampaign,
  provincesOf,
  repelled,
  scenarioOf,
  serialize,
  targets,
  yearOf,
} from "./campaign/campaign";
import { CROWN, FACTIONS, HISTORY, MAP, PROVINCES, type ProvinceId, SCENARIOS } from "./campaign/france";
import { CAMPAIGN_WORLD, drawCampaign, provinceAt } from "./campaign/render";
import { AUTO_THRESHOLDS, autoStatus, makeAutoReinforce } from "./engine/auto";
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
const KEY_CAMPAIGN = "conquete.campagne";
const KEY_DIFFICULTY = "conquete.difficulte";
const DIFFICULTIES: [string, number][] = [
  ["Facile", 0.8],
  ["Normal", 1],
  ["Difficile", 1.2],
];

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

type Mode = "menu" | "game" | "result" | "campaign" | "chronicle";

let state: GameState | null = null;
let currentDef: LevelDef = LEVELS[0];
let ais: ((s: GameState, dt: number) => void)[] = [];
let auto: ((s: GameState, dt: number) => void) | null = null;
let running = false;
let mode: Mode = "menu";
let tab: "chapters" | "campaign" = "chapters";
let selected = 0; // chapitre choisi dans le menu
let current = 0; // chapitre en cours
let autoThreshold = 0;
let autoFlags: number[] = []; // territoires cochés pour les renforts, dans l'ordre
let drag: { from: Base; x: number; y: number } | null = null;
let view: View = { w: 1, h: 1, scale: 1, offX: 0, offY: 0 };

// campagne
let camp: CampaignState | null = null; // la partie en cours (sauvegardée)
let campSelected: ProvinceId | null = null;
let battleTarget: ProvinceId | null = null; // province attaquée quand une bataille de campagne est en cours
let pendingLines: string[] = []; // chronique à montrer au retour sur la carte
let scenarioPick = 0;
let difficulty = 1;

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
const saveCampaign = () => camp && store(KEY_CAMPAIGN, serialize(camp));
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/* ---------- mise en page du canvas ---------- */

const onCampaignMap = () => mode === "campaign" || mode === "chronicle" || (mode === "menu" && tab === "campaign");

/** Zone du canvas laissée à la carte, en pixels CSS, selon ce que l'interface recouvre. */
function mapInsets(): { top: number; bottom: number } {
  if (mode === "menu") return { top: 74, bottom: $("menu-bottom").getBoundingClientRect().height + 20 };
  if (mode === "campaign") return { top: 62, bottom: $("camp-panel").getBoundingClientRect().height + 20 };
  return { top: 62, bottom: $("dock").hidden ? 18 : 116 };
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
  $("camp-panel").hidden = next !== "campaign";
  $("dock").hidden = !(next === "game" && currentDef.auto);
}

function showMenu(): void {
  running = false;
  drag = null;
  battleTarget = null;
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
  segmented($("scenarios"), SCENARIOS.map((s) => s.title), scenarioPick, (i) => {
    scenarioPick = i;
    renderMenu();
    layout();
  });
  $("c-title").textContent = sc.title;
  $("c-blurb").textContent = sc.blurb;
  segmented(
    $("difficulty"),
    DIFFICULTIES.map(([name]) => name),
    DIFFICULTIES.findIndex(([, v]) => v === difficulty),
    (i) => {
      difficulty = DIFFICULTIES[i][1];
      store(KEY_DIFFICULTY, String(difficulty));
      renderMenu();
    },
  );
  const saved = camp && camp.status === "playing" ? camp : null;
  const cont = $("c-continue") as HTMLButtonElement;
  cont.disabled = !saved;
  cont.textContent = saved ? `Continuer · ${yearOf(saved)}` : "Continuer";
  $("c-eyebrow").textContent = saved ? `Partie en cours · ${scenarioOf(saved).title}` : "Histoire de France";
  // la carte d'aperçu : la partie en cours, sinon le départ du scénario choisi
  state = null;
  preview = saved ?? newCampaign(sc.id, 1);
}
let preview: CampaignState | null = null;

function renderAutoDock(): void {
  $("auto").replaceChildren(
    ...AUTO_THRESHOLDS.map((t) => {
      const b = document.createElement("button");
      b.textContent = t === 0 ? "Off" : String(t);
      b.setAttribute("aria-pressed", String(t === autoThreshold));
      b.setAttribute("aria-label", t === 0 ? "Renforts automatiques désactivés" : `Renforts automatiques à ${t} troupes`);
      b.addEventListener("click", () => {
        autoThreshold = t;
        store(KEY_AUTO, String(t));
        renderAutoDock();
      });
      return b;
    }),
  );
}

/** Lance une bataille : un chapitre, ou celle d'une province de la campagne. */
function launch(def: LevelDef): void {
  currentDef = def;
  state = def.build();
  ais = makeLevelAis(def);
  autoFlags = [];
  auto = def.auto ? makeAutoReinforce(PLAYER, () => autoThreshold, () => autoFlags) : null;
  drag = null;
  running = true;
  renderAutoDock();
  setMode("game");
  layout();
}

function startChapter(): void {
  current = selected;
  battleTarget = null;
  launch(LEVELS[current]);
}

function showResult(): void {
  if (!state) return;
  const s = state;
  const won = s.winner === PLAYER;
  const inCampaign = battleTarget !== null && camp !== null;
  if (inCampaign) {
    pendingLines = [won ? conquer(camp!, battleTarget!) : repelled(camp!, battleTarget!)];
    if (camp!.status === "playing") pendingLines.push(...endTurn(camp!));
    saveCampaign();
  } else if (won) {
    markDone(current);
  }
  $("hero").innerHTML = heroSvg(won);
  $("ribbon").className = `ribbon${won ? "" : " lose"}`;
  $("result").textContent = won ? (inCampaign ? "Province conquise !" : "Victoire !") : inCampaign ? "Repoussé" : "Défaite";
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

/* ---------- campagne ---------- */

function openCampaign(c: CampaignState): void {
  camp = c;
  saveCampaign();
  showCampaign();
}

function showCampaign(): void {
  if (!camp) return showMenu();
  running = false;
  battleTarget = null;
  campSelected = null;
  setMode("campaign");
  renderCampaign();
  layout();
}

function renderCampaign(): void {
  const c = camp!;
  $("camp-when").textContent = `${yearOf(c)} · tour ${c.turn + 1}`;
  const goal = goalOf(c);
  const held = goal.filter((id) => c.owner[id] === CROWN).length;
  $("camp-goal").textContent = scenarioOf(c).goal === "all" ? `${provincesOf(c, CROWN).length}/${MAP.provinces.length} provinces` : `Objectif ${held}/${goal.length} ★`;

  const id = campSelected;
  const attack = $("cp-attack") as HTMLButtonElement;
  if (!id) {
    $("cp-dot").style.background = FACTION[CROWN].fill;
    $("cp-faction").textContent = FACTIONS[CROWN].name;
    $("cp-name").textContent = "Choisis une province";
    $("cp-note").textContent = "Touche une province cerclée d'or pour l'attaquer, ou passe le tour pour laisser le royaume respirer.";
    attack.disabled = true;
    return;
  }
  const owner = c.owner[id];
  const h = HISTORY[id];
  $("cp-dot").style.background = (FACTION[owner] ?? FACTION.neutral).fill;
  $("cp-faction").textContent = FACTIONS[owner].name;
  $("cp-name").textContent = PROVINCES[id].name;
  const hint = owner === CROWN ? "Province de la Couronne. " : canAttack(c, id) ? "" : "Pas voisine de tes provinces. ";
  $("cp-note").textContent = `${hint}${h ? `${h.note} (rattachée en ${h.joined}.)` : ""}`;
  attack.disabled = !canAttack(c, id);
}

function showChronicle(lines: string[]): void {
  if (!camp) return;
  $("chr-title").textContent = `Chronique · ${yearOf(camp)}`;
  $("chr-lines").replaceChildren(
    ...(lines.length ? lines : ["Rien à signaler : le royaume retient son souffle."]).map((l) => {
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

function attackSelected(): void {
  if (!camp || !campSelected || !canAttack(camp, campSelected)) return;
  battleTarget = campSelected;
  launch(battleLevel(camp, campSelected));
}

function passTurn(): void {
  if (!camp || camp.status !== "playing") return;
  const lines = endTurn(camp);
  saveCampaign();
  showCampaign();
  showChronicle(lines);
}

/* ---------- entrée ---------- */

function toggleAuto(id: number): void {
  if (!state) return;
  const st = autoStatus(state, PLAYER, autoFlags);
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
  if (mode === "campaign" && camp) {
    const p = toWorld(e);
    const margin = (CAMPAIGN_WORLD.w - MAP.width) / 2;
    campSelected = provinceAt(p.x - margin, p.y - margin);
    renderCampaign();
    return;
  }
  if (!running || !state) return;
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
    if (auto) toggleAuto(target.id); // un simple toucher coche ou décoche le territoire
  } else if (target) send(state, drag.from.id, target.id, PLAYER);
  drag = null;
});
canvas.addEventListener("pointercancel", () => (drag = null));
$("play").addEventListener("click", startChapter);
$("replay").addEventListener("click", startChapter);
$("next").addEventListener("click", () => {
  if (battleTarget) {
    showCampaign();
    showChronicle(pendingLines);
    return;
  }
  selected = Math.min(current + 1, LEVELS.length - 1);
  showMenu();
});
$("to-menu").addEventListener("click", showMenu);
$("back").addEventListener("click", () => (battleTarget ? showCampaign() : showMenu()));
$("tab-chapters").addEventListener("click", () => {
  tab = "chapters";
  showMenu();
});
$("tab-campaign").addEventListener("click", () => {
  tab = "campaign";
  showMenu();
});
$("c-continue").addEventListener("click", () => camp && camp.status === "playing" && showCampaign());
$("c-new").addEventListener("click", () => {
  if (camp?.status === "playing" && !window.confirm("Une campagne est en cours. La remplacer par une nouvelle partie ?")) return;
  openCampaign(newCampaign(SCENARIOS[scenarioPick].id, undefined, difficulty));
});
$("camp-back").addEventListener("click", showMenu);
$("cp-attack").addEventListener("click", attackSelected);
$("cp-pass").addEventListener("click", passTurn);
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

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (running && state && acc >= FIXED_DT) {
    for (const ai of ais) ai(state, FIXED_DT);
    auto?.(state, FIXED_DT);
    step(state, FIXED_DT);
    acc -= FIXED_DT;
    if (state.winner !== null) {
      running = false;
      showResult();
    }
  }
  if (!running) acc = 0;

  if (onCampaignMap()) {
    const c = mode === "menu" ? preview : camp;
    if (c) {
      const reachable = mode === "campaign" ? targets(c) : [];
      drawCampaign(ctx, view, c, mode === "campaign" ? campSelected : null, reachable, goalOf(c), now / 1000);
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
  if (shown && running && auto) {
    const st = autoStatus(shown, PLAYER, autoFlags);
    marks = st.flagged.map((id) => ({ id, active: autoThreshold > 0 && st.active.includes(id) }));
    const count = $("auto-count");
    count.textContent = st.cap === 0 ? "dès 6 territoires" : `${st.flagged.length}/${st.cap} territoires`;
    count.classList.toggle("full", st.cap > 0 && st.flagged.length >= st.cap);
  }
  drawScene(ctx, view, shown, drag?.from.id ?? null, shown && running ? previewOf(shown) : null, marks);
  requestAnimationFrame(frame);
}

applyTheme();
autoThreshold = Number(store(KEY_AUTO) ?? 0);
if (!(AUTO_THRESHOLDS as readonly number[]).includes(autoThreshold)) autoThreshold = 0;
difficulty = Number(store(KEY_DIFFICULTY) ?? 1);
if (!DIFFICULTIES.some(([, v]) => v === difficulty)) difficulty = 1;
camp = deserialize(store(KEY_CAMPAIGN));
const finished = loadDone();
const firstTodo = LEVELS.findIndex((_, i) => !finished.includes(i));
selected = firstTodo === -1 ? LEVELS.length - 1 : firstTodo;
showMenu();
requestAnimationFrame(frame);
