import { BALANCED, makeAi } from "./engine/ai";
import { AI_OWNER, WORLD_H, WORLD_W, level1 } from "./engine/level";
import { send, step } from "./engine/sim";
import { type Base, type GameState, NEUTRAL, PLAYER } from "./engine/types";

const COLORS: Record<number, string> = {
  [NEUTRAL]: "#8a8f98",
  [PLAYER]: "#3b82f6",
  [AI_OWNER]: "#ef4444",
};
const FIXED_DT = 1 / 60;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const timerEl = document.getElementById("timer")!;
const overlay = document.getElementById("overlay")!;
const resultEl = document.getElementById("result")!;
const detailEl = document.getElementById("detail")!;

let state: GameState;
let ai: (s: GameState, dt: number) => void;
let drag: { from: Base; x: number; y: number } | null = null;
let scale = 1;
let offX = 0;
let offY = 0;

const radius = (b: Base) => 4 + b.capacity / 12;

function newGame(): void {
  state = level1();
  ai = makeAi({ owner: AI_OWNER, ...BALANCED });
  drag = null;
  overlay.hidden = true;
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

/** Base la plus proche du point, avec une zone de toucher généreuse pour le doigt. */
function baseAt(x: number, y: number): Base | null {
  let best: Base | null = null;
  let bestD = Infinity;
  for (const b of state.bases) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < radius(b) * 1.5 && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

canvas.addEventListener("pointerdown", (e) => {
  if (state.winner !== null) return;
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
  if (!drag) return;
  const p = toWorld(e);
  const target = baseAt(p.x, p.y);
  if (target) send(state, drag.from.id, target.id, PLAYER);
  drag = null;
});
canvas.addEventListener("pointercancel", () => (drag = null));
document.getElementById("replay")!.addEventListener("click", newGame);
window.addEventListener("resize", resize);

function draw(): void {
  ctx.fillStyle = "#0f1420";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (drag) {
    const hover = baseAt(drag.x, drag.y);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(drag.from.x, drag.from.y);
    ctx.lineTo(hover ? hover.x : drag.x, hover ? hover.y : drag.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const b of state.bases) {
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

  for (const q of state.squads) {
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
  ctx.restore();
}

function showResult(): void {
  const won = state.winner === PLAYER;
  resultEl.textContent = won ? "Victoire" : "Défaite";
  const m = Math.floor(state.time / 60);
  const sec = Math.floor(state.time % 60);
  detailEl.textContent = `Durée : ${m}:${String(sec).padStart(2, "0")}`;
  overlay.hidden = false;
}

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= FIXED_DT) {
    if (state.winner === null) {
      ai(state, FIXED_DT);
      step(state, FIXED_DT);
      if (state.winner !== null) showResult();
    }
    acc -= FIXED_DT;
  }
  const t = Math.floor(state.time);
  timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  draw();
  requestAnimationFrame(frame);
}

resize();
newGame();
requestAnimationFrame(frame);
