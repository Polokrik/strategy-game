import { makeAi } from "./engine/ai";
import { LEVELS, WORLD_H, WORLD_W } from "./engine/level";
import { FIGHT_FLASH, findPath, send, step } from "./engine/sim";
import { type Base, type GameState, NEUTRAL, PLAYER } from "./engine/types";

const COLORS: Record<number, string> = {
  [NEUTRAL]: "#8a8f98",
  [PLAYER]: "#3b82f6",
  2: "#ef4444",
  3: "#f59e0b",
  4: "#a855f7",
};
const FIXED_DT = 1 / 60;
const STORAGE_KEY = "conquete.done";

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let state: GameState | null = null;
let ais: ((s: GameState, dt: number) => void)[] = [];
let running = false;
let current = 0;
let drag: { from: Base; x: number; y: number } | null = null;
let scale = 1;
let offX = 0;
let offY = 0;

function loadDone(): number[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function markDone(i: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...loadDone(), i])]));
  } catch {
    /* stockage indisponible : on perd juste les coches */
  }
}

const radius = (b: Base) => 4 + b.capacity / 12;
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function show(screen: "menu" | "intro" | "overlay" | "game"): void {
  $("menu").hidden = screen !== "menu";
  $("intro").hidden = screen !== "intro";
  $("overlay").hidden = screen !== "overlay";
  $("hud").hidden = screen !== "game" && screen !== "overlay";
}

function showMenu(): void {
  running = false;
  state = null;
  const done = loadDone();
  $("chapters").replaceChildren(
    ...LEVELS.map((l, i) => {
      const b = document.createElement("button");
      const mark = document.createElement("span");
      mark.textContent = done.includes(i) ? "✓" : "";
      mark.className = "done";
      b.append(`${i + 1}. ${l.title}`, mark);
      b.addEventListener("click", () => openIntro(i));
      return b;
    }),
  );
  show("menu");
}

function openIntro(i: number): void {
  current = i;
  $("intro-chapter").textContent = `Chapitre ${i + 1}`;
  $("intro-title").textContent = LEVELS[i].title;
  $("intro-notion").textContent = LEVELS[i].notion;
  show("intro");
}

function start(): void {
  const def = LEVELS[current];
  state = def.build();
  ais = def.ais.map((a) => makeAi({ owner: a.owner, ...a.personality }));
  drag = null;
  running = true;
  show("game");
}

function showResult(): void {
  if (!state) return;
  const won = state.winner === PLAYER;
  if (won) markDone(current);
  $("result").textContent = won ? "Victoire" : "Défaite";
  $("detail").textContent = `Durée : ${fmtTime(state.time)}`;
  $("next").hidden = !won || current + 1 >= LEVELS.length;
  show("overlay");
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  scale = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
  offX = (canvas.width - WORLD_W * scale) / 2;
  offY = (canvas.height - WORLD_H * scale) / 2;
}

function toWorld(e: PointerEvent): { x: number; y: number } {
  const dpr = window.devicePixelRatio || 1;
  return { x: (e.clientX * dpr - offX) / scale, y: (e.clientY * dpr - offY) / scale };
}

/** Base (pas un carrefour) la plus proche du point, avec une zone de toucher généreuse. */
function baseAt(x: number, y: number): Base | null {
  let best: Base | null = null;
  let bestD = Infinity;
  for (const b of state!.bases) {
    if (b.junction) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < radius(b) * 1.5 && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

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
$("next").addEventListener("click", () => openIntro(current + 1));
$("to-menu").addEventListener("click", showMenu);
$("back").addEventListener("click", showMenu);
window.addEventListener("resize", resize);

function drawRoutes(s: GameState): void {
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  s.links.forEach((vs, a) =>
    vs.forEach((b) => {
      if (b < a) return;
      ctx.moveTo(s.bases[a].x, s.bases[a].y);
      ctx.lineTo(s.bases[b].x, s.bases[b].y);
    }),
  );
  ctx.stroke();

  // carrefours : petits losanges, là où les routes se rejoignent
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (const b of s.bases) {
    if (!b.junction) continue;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - 2);
    ctx.lineTo(b.x + 2, b.y);
    ctx.lineTo(b.x, b.y + 2);
    ctx.lineTo(b.x - 2, b.y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Aperçu du chemin pendant le glisser : surbrillance de la route, ou croix rouge si impossible. */
function drawDragPreview(s: GameState, d: NonNullable<typeof drag>): void {
  const hover = baseAt(d.x, d.y);
  if (!hover || hover === d.from) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(d.from.x, d.from.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const route = findPath(s, d.from.id, hover.id, PLAYER);
  if (!route) {
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(hover.x - 3, hover.y - 3);
    ctx.lineTo(hover.x + 3, hover.y + 3);
    ctx.moveTo(hover.x + 3, hover.y - 3);
    ctx.lineTo(hover.x - 3, hover.y + 3);
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(d.from.x, d.from.y);
  for (const id of route.path) ctx.lineTo(s.bases[id].x, s.bases[id].y);
  ctx.stroke();
}

function draw(): void {
  ctx.fillStyle = "#0f1420";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state) return;
  const s = state;
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  drawRoutes(s);
  if (drag) drawDragPreview(s, drag);

  for (const b of s.bases) {
    if (b.junction) continue;
    const r = radius(b);
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[b.owner];
    ctx.fill();
    if (drag && drag.from === b) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${r * 0.9}px system-ui, sans-serif`;
    ctx.fillText(String(Math.floor(b.troops)), b.x, b.y);
  }

  for (const q of s.squads) {
    ctx.beginPath();
    ctx.arc(q.x, q.y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[q.owner];
    ctx.fill();
    ctx.strokeStyle = "#0f1420";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 3px system-ui, sans-serif";
    ctx.fillText(String(q.count), q.x, q.y - 3.2);
  }

  for (const f of s.fights) {
    const age = (s.time - f.t) / FIGHT_FLASH;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 2.5 + age * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (running && state && acc >= FIXED_DT) {
    for (const ai of ais) ai(state, FIXED_DT);
    step(state, FIXED_DT);
    acc -= FIXED_DT;
    if (state.winner !== null) {
      running = false;
      showResult();
    }
  }
  if (!running) acc = 0;
  if (state) $("timer").textContent = fmtTime(state.time);
  draw();
  requestAnimationFrame(frame);
}

resize();
showMenu();
requestAnimationFrame(frame);
