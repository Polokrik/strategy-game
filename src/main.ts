import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/lilita-one/400.css";

import { AUTO_THRESHOLDS, makeAutoReinforce } from "./engine/auto";
import { LEVELS, WORLD_H, WORLD_W, makeLevelAis } from "./engine/level";
import { findPath, send, step } from "./engine/sim";
import { type Base, type GameState, PLAYER } from "./engine/types";
import { heroSvg, launchConfetti } from "./hero";
import { type Preview, type View, drawScene, shares } from "./render";
import { applyTheme } from "./theme";

const FIXED_DT = 1 / 60;
/** Un toucher compte pour un territoire s'il tombe à moins de cette distance (unités monde) de son centre. */
const TOUCH_RANGE = 19;
const KEY_DONE = "conquete.done";
const KEY_AUTO = "conquete.auto";

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let state: GameState | null = null;
let ais: ((s: GameState, dt: number) => void)[] = [];
let auto: ((s: GameState, dt: number) => void) | null = null;
let running = false;
let mode: "menu" | "game" | "result" = "menu";
let selected = 0; // chapitre choisi dans le menu
let current = 0; // chapitre en cours
let autoThreshold = 0;
let drag: { from: Base; x: number; y: number } | null = null;
let view: View = { w: 1, h: 1, scale: 1, offX: 0, offY: 0 };

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
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/* ---------- mise en page du canvas ---------- */

/** Zone du canvas laissée à la carte, en pixels CSS, selon ce que l'interface recouvre. */
function mapInsets(): { top: number; bottom: number } {
  if (mode === "menu") return { top: 74, bottom: $("menu-bottom").getBoundingClientRect().height + 20 };
  return { top: 62, bottom: $("dock").hidden ? 18 : 78 };
}

function layout(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const { top, bottom } = mapInsets();
  const areaH = Math.max(80, window.innerHeight - top - bottom) * dpr;
  const scale = Math.min(canvas.width / WORLD_W, areaH / WORLD_H);
  view = {
    w: canvas.width,
    h: canvas.height,
    scale,
    offX: (canvas.width - WORLD_W * scale) / 2,
    offY: top * dpr + (areaH - WORLD_H * scale) / 2,
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

function setMode(next: typeof mode): void {
  mode = next;
  $("menu").hidden = next !== "menu";
  $("hud").hidden = next !== "game";
  $("overlay").hidden = next !== "result";
  $("dock").hidden = !(next === "game" && LEVELS[current].auto);
}

function showMenu(): void {
  running = false;
  drag = null;
  setMode("menu");
  state = LEVELS[selected].build();
  renderMenu();
  layout();
}

function renderMenu(): void {
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

function start(): void {
  current = selected;
  const def = LEVELS[current];
  state = def.build();
  ais = makeLevelAis(def);
  auto = def.auto ? makeAutoReinforce(PLAYER, () => autoThreshold) : null;
  drag = null;
  running = true;
  renderAutoDock();
  setMode("game");
  layout();
}

function showResult(): void {
  if (!state) return;
  const s = state;
  const won = s.winner === PLAYER;
  if (won) markDone(current);
  $("hero").innerHTML = heroSvg(won);
  $("ribbon").className = `ribbon${won ? "" : " lose"}`;
  $("result").textContent = won ? "Victoire !" : "Défaite";
  $("stat-time").textContent = fmtTime(s.time);
  $("stat-land").textContent = `${s.bases.filter((b) => b.owner === PLAYER).length}/${s.bases.length}`;
  $("next").hidden = !won || current + 1 >= LEVELS.length;
  if (won) launchConfetti($("confetti"));
  else $("confetti").replaceChildren();
  setMode("result");
}

/* ---------- entrée ---------- */

canvas.addEventListener("pointerdown", (e) => {
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
  if (target) send(state, drag.from.id, target.id, PLAYER);
  drag = null;
});
canvas.addEventListener("pointercancel", () => (drag = null));
$("play").addEventListener("click", start);
$("replay").addEventListener("click", start);
$("next").addEventListener("click", () => {
  selected = Math.min(current + 1, LEVELS.length - 1);
  showMenu();
});
$("to-menu").addEventListener("click", showMenu);
$("back").addEventListener("click", showMenu);
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
  if (state && mode === "game") {
    $("timer").textContent = fmtTime(state.time);
    updateShare(state);
  }
  const shown = mode === "result" ? null : state;
  drawScene(ctx, view, shown, drag?.from.id ?? null, shown && running ? previewOf(shown) : null);
  requestAnimationFrame(frame);
}

applyTheme();
autoThreshold = Number(store(KEY_AUTO) ?? 0);
if (!(AUTO_THRESHOLDS as readonly number[]).includes(autoThreshold)) autoThreshold = 0;
const finished = loadDone();
const firstTodo = LEVELS.findIndex((_, i) => !finished.includes(i));
selected = firstTodo === -1 ? LEVELS.length - 1 : firstTodo;
showMenu();
requestAnimationFrame(frame);
