import { FIGHT_FLASH } from "./engine/sim";
import { type Base, type GameState, NEUTRAL, type Point } from "./engine/types";
import { FONT_BODY, GOLD, INK, OWNER, SEA } from "./theme";

export interface View {
  /** taille du canvas en pixels */
  w: number;
  h: number;
  scale: number;
  offX: number;
  offY: number;
}

/** Aperçu pendant le glisser. */
export type Preview =
  | { kind: "free"; from: Base; x: number; y: number }
  | { kind: "route"; from: Base; points: Point[] }
  | { kind: "blocked"; from: Base; at: Base };

const tone = (owner: number) => OWNER[owner] ?? OWNER[NEUTRAL];

/** Nombre de disques d'un territoire selon sa capacité : 1 hameau, 2 village, 3 capitale. */
export const tier = (b: Base): 1 | 2 | 3 => (b.capacity >= 60 ? 3 : b.capacity >= 45 ? 2 : 1);

let seaCache: { key: string; canvas: HTMLCanvasElement } | null = null;

/** La mer ne change jamais : on la dessine une fois par taille d'écran. */
export function drawSea(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const key = `${w}x${h}`;
  if (!seaCache || seaCache.key !== key) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, SEA.top);
    grad.addColorStop(1, SEA.bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // petites vagues, placées une fois pour toutes
    g.strokeStyle = SEA.wave;
    g.lineWidth = Math.max(1.5, w / 240);
    g.lineCap = "round";
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const step = w / 7;
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + step * 0.15, y - step * 0.12, x + step * 0.3, y);
      g.quadraticCurveTo(x + step * 0.45, y + step * 0.12, x + step * 0.6, y);
      g.stroke();
    }
    seaCache = { key, canvas: c };
  }
  ctx.drawImage(seaCache.canvas, 0, 0);
}

interface Decor {
  kind: "tree" | "hill";
  x: number;
  y: number;
}
const decorCache = new WeakMap<GameState, Decor[][]>();

function inside(poly: Point[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Quelques arbres et collines par territoire, placés une fois (graine = id du territoire), loin du marqueur. */
function decorOf(s: GameState): Decor[][] {
  let all = decorCache.get(s);
  if (all) return all;
  all = s.bases.map((b) => {
    const poly = s.shapes[b.id];
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    let seed = (b.id + 1) * 7919;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out: Decor[] = [];
    for (let tries = 0; tries < 60 && out.length < 3; tries++) {
      const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs));
      const y = Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys));
      const ok =
        [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(([dx, dy]) => inside(poly, x + dx, y + dy)) &&
        Math.hypot(x - b.x, y - b.y) > 11 &&
        out.every((d) => Math.hypot(d.x - x, d.y - y) > 7);
      if (ok) out.push({ kind: rnd() < 0.7 ? "tree" : "hill", x, y });
    }
    return out;
  });
  decorCache.set(s, all);
  return all;
}

function drawDecor(ctx: CanvasRenderingContext2D, d: Decor): void {
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.55;
  ctx.strokeStyle = "rgba(43,42,58,0.7)";
  if (d.kind === "tree") {
    ctx.fillStyle = "#8a5a2b";
    ctx.fillRect(d.x - 0.5, d.y + 1, 1, 1.6);
    for (const [dy, w, c] of [[0.6, 3, "#3f9c4a"], [-1.4, 2.4, "#58b85c"]] as const) {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y + dy - 3);
      ctx.lineTo(d.x + w, d.y + dy + 1.4);
      ctx.lineTo(d.x - w, d.y + dy + 1.4);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(d.x - 4, d.y + 2.2);
    ctx.lineTo(d.x, d.y - 3.2);
    ctx.lineTo(d.x + 4, d.y + 2.2);
    ctx.closePath();
    ctx.fillStyle = "#b9b2a0";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d.x - 1.3, d.y - 1.1);
    ctx.lineTo(d.x, d.y - 3.2);
    ctx.lineTo(d.x + 1.3, d.y - 1.1);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
}

function tracePolygon(ctx: CanvasRenderingContext2D, poly: Point[]): void {
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function drawTerritories(ctx: CanvasRenderingContext2D, s: GameState, selected: number | null): void {
  ctx.lineJoin = "round";
  // écume autour des terres, puis ombre portée
  ctx.strokeStyle = SEA.foam;
  ctx.lineWidth = 3.4;
  for (const poly of s.shapes) {
    tracePolygon(ctx, poly);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(0, 1.4);
  ctx.fillStyle = "rgba(43,42,58,0.22)";
  for (const poly of s.shapes) {
    tracePolygon(ctx, poly);
    ctx.fill();
  }
  ctx.restore();

  for (const b of s.bases) {
    const t = tone(b.owner);
    tracePolygon(ctx, s.shapes[b.id]);
    ctx.fillStyle = t.fill;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (b.owner === NEUTRAL) for (const d of decorOf(s)[b.id]) drawDecor(ctx, d);
    if (b.id === selected) {
      tracePolygon(ctx, s.shapes[b.id]);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
}

function drawSeaLinks(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.setLineDash([0.1, 2.2]);
  ctx.beginPath();
  for (const [a, b] of s.seaLinks) {
    ctx.moveTo(s.bases[a].x, s.bases[a].y);
    ctx.lineTo(s.bases[b].x, s.bases[b].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Positions des disques d'un amas : le principal au centre, les autres en grappe, comme des quartiers. */
const CLUSTER: [number, number, number][] = [
  [5.6, 7.2, -3.4],
  [3.4, 3.8, 6.2],
];

function drawMarker(ctx: CanvasRenderingContext2D, b: Base): void {
  const t = tone(b.owner);
  const neutral = b.owner === NEUTRAL;
  const n = tier(b);
  const disc = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = neutral ? "#fff" : t.dark;
    ctx.fill();
    ctx.strokeStyle = neutral ? t.dark : "#fff";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  };
  for (let i = 0; i < n - 1; i++) {
    const [r, dx, dy] = CLUSTER[i];
    disc(b.x + dx * (i ? -1 : 1), b.y + dy * (i ? 1 : -1) * 0.8, r * 0.62);
  }
  disc(b.x, b.y, 5.6);
  ctx.fillStyle = neutral ? INK : "#fff";
  ctx.font = `700 6.2px ${FONT_BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.floor(b.troops)), b.x, b.y + 0.3);
}

/** Territoire coché pour les renforts automatiques. */
export interface AutoMark {
  id: number;
  /** vrai : il envoie ses renforts (vert) ; faux : en attente, au front ou seuil sur Off (gris) */
  active: boolean;
}

/** Pastille à chevrons : ce territoire envoie ses renforts tout seul (vert) ou est en attente (gris). */
function drawAutoBadge(ctx: CanvasRenderingContext2D, b: Base, active: boolean): void {
  const x = b.x + 6.6;
  const y = b.y - 6.6;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = active ? "#3fb248" : "#9aa0b4";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 0.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const dx of [-0.9, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x + dx - 0.8, y - 1.3);
    ctx.lineTo(x + dx + 0.6, y);
    ctx.lineTo(x + dx - 0.8, y + 1.3);
    ctx.stroke();
  }
}

/** Les troupes forment un flux de points : leur nombre se lit à l'œil, et deux flux qui se rencontrent s'annulent à la vue. */
function drawSquads(ctx: CanvasRenderingContext2D, s: GameState): void {
  for (const q of s.squads) {
    const t = tone(q.owner);
    const next = s.bases[q.path[0]];
    const len = Math.hypot(next.x - q.x, next.y - q.y) || 1;
    const dx = (next.x - q.x) / len;
    const dy = (next.y - q.y) / len;
    const dots = Math.min(14, Math.max(2, Math.ceil(q.count / 2.5)));
    for (let i = dots - 1; i >= 0; i--) {
      const back = i * 1.95;
      const side = (i % 2 ? 1 : -1) * 0.95;
      const x = q.x - dx * back - dy * side;
      const y = q.y - dy * back + dx * side;
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 2.2 : 1.7, 0, Math.PI * 2);
      ctx.fillStyle = t.dark;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }
    ctx.font = `700 4px ${FONT_BODY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#fff";
    ctx.strokeText(String(q.count), q.x + dy * 3.6 - dx * 1.5, q.y - dx * 3.6 - dy * 1.5);
    ctx.fillStyle = INK;
    ctx.fillText(String(q.count), q.x + dy * 3.6 - dx * 1.5, q.y - dx * 3.6 - dy * 1.5);
  }
}

/** Interception : une étoile de bande dessinée. */
function drawFights(ctx: CanvasRenderingContext2D, s: GameState): void {
  for (const f of s.fights) {
    const age = (s.time - f.t) / FIGHT_FLASH;
    const r = 3.2 + age * 4;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(age * 0.6);
    ctx.globalAlpha = 1 - age * age;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const rad = i % 2 ? r * 0.55 : r;
      const a = (i / 16) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, p: Preview): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p.kind === "blocked") {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    const { x, y } = p.at;
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 3.5);
    ctx.lineTo(x + 3.5, y + 3.5);
    ctx.moveTo(x + 3.5, y - 3.5);
    ctx.lineTo(x - 3.5, y + 3.5);
    ctx.stroke();
    ctx.strokeStyle = "#e5483c";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    return;
  }
  const pts: Point[] = p.kind === "free" ? [[p.from.x, p.from.y], [p.x, p.y]] : [[p.from.x, p.from.y], ...p.points];
  const trace = () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  if (p.kind === "free") ctx.setLineDash([2, 2.2]);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  trace();
  ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.6;
  trace();
  ctx.stroke();
  ctx.setLineDash([]);
  if (p.kind === "route") {
    // pointe de flèche sur le dernier tronçon
    const [ax, ay] = pts[pts.length - 2];
    const [bx, by] = pts[pts.length - 1];
    const a = Math.atan2(by - ay, bx - ax);
    ctx.beginPath();
    ctx.moveTo(bx - Math.cos(a) * 7 + Math.sin(a) * 3.4, by - Math.sin(a) * 7 - Math.cos(a) * 3.4);
    ctx.lineTo(bx - Math.cos(a) * 2, by - Math.sin(a) * 2);
    ctx.lineTo(bx - Math.cos(a) * 7 - Math.sin(a) * 3.4, by - Math.sin(a) * 7 + Math.cos(a) * 3.4);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  view: View,
  s: GameState | null,
  selected: number | null,
  preview: Preview | null,
  autoMarks: readonly AutoMark[] = [],
): void {
  drawSea(ctx, view.w, view.h);
  if (!s) return;
  ctx.save();
  ctx.translate(view.offX, view.offY);
  ctx.scale(view.scale, view.scale);
  drawTerritories(ctx, s, selected);
  drawSeaLinks(ctx, s);
  if (preview) drawPreview(ctx, preview);
  for (const b of s.bases) drawMarker(ctx, b);
  for (const m of autoMarks) drawAutoBadge(ctx, s.bases[m.id], m.active);
  drawSquads(ctx, s);
  drawFights(ctx, s);
  ctx.restore();
}

/** Parts de territoires par camp, pour la barre du haut (neutre inclus). */
export function shares(s: GameState): { owner: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const b of s.bases) counts.set(b.owner, (counts.get(b.owner) ?? 0) + 1);
  return [...counts]
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => (a.owner === NEUTRAL ? 1 : b.owner === NEUTRAL ? -1 : a.owner - b.owner));
}
