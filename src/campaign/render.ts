import { type View, drawSea } from "../render";
import { FACTION, FONT_BODY, GOLD, INK } from "../theme";
import type { CampaignState, Threat, TurnEvent } from "./campaign";
import { type FactionId, MAP, PROVINCES, type ProvinceId } from "./france";

/** Marge autour de la carte, en unités monde (la Corse touche le bord droit). */
const MARGIN = 4;
export const CAMPAIGN_WORLD = { w: MAP.width + 2 * MARGIN, h: MAP.height + 2 * MARGIN };

type Ring = readonly (readonly [number, number])[];

function trace(ctx: CanvasRenderingContext2D, ring: Ring): void {
  ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function inside(ring: Ring, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Province sous le point (coordonnées de la carte, sans marge) ; à défaut, la plus proche si le toucher est tout près. */
export function provinceAt(x: number, y: number): ProvinceId | null {
  for (const p of MAP.provinces) if (p.shapes.some((ring) => inside(ring, x, y))) return p.id;
  let best: ProvinceId | null = null;
  let bestD = 4;
  for (const p of MAP.provinces) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) (best = p.id), (bestD = d);
  }
  return best;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** Césures choisies à la main quand la coupe au premier trait d'union ne tient pas. */
const LABEL_BREAKS: Record<string, string[]> = { "Île-de-France": ["Île-de-", "France"] };

/** Les noms composés se coupent au trait d'union pour tenir dans les petites provinces. */
const labelLines = (name: string): string[] =>
  LABEL_BREAKS[name] ?? (name.length > 9 && name.includes("-") ? name.replace("-", "-\n").split("\n") : [name]);

/* ---------- flèches d'attaque ---------- */

type Pt = [number, number];

/** Point de la courbe d'une attaque (arc léger, pour que deux sens opposés ne se superposent pas). */
function arcPoint(a: Pt, b: Pt, t: number): Pt {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cx = mx - dy * 0.16;
  const cy = my + dx * 0.16;
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]];
}

const anchor = (id: ProvinceId): Pt => [PROVINCES[id].x, PROVINCES[id].y];

/** Flèche d'`from` vers `to`, tracée jusqu'à la part `progress` (0 à 1), avec sa pointe. */
function arrow(ctx: CanvasRenderingContext2D, from: ProvinceId, to: ProvinceId, color: string, width: number, progress = 1, dash = 0): void {
  const a = anchor(from);
  const b = anchor(to);
  const steps = 24;
  const last = Math.max(1, Math.round(steps * progress));
  const trace = () => {
    ctx.beginPath();
    for (let i = 0; i <= last; i++) {
      const [x, y] = arcPoint(a, b, i / steps);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dash ? [2.2, 1.8] : []);
  ctx.lineDashOffset = -dash;
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 1.2;
  trace();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  trace();
  ctx.stroke();
  ctx.setLineDash([]);
  // pointe
  const [hx, hy] = arcPoint(a, b, last / steps);
  const [px, py] = arcPoint(a, b, Math.max(0, last - 1) / steps);
  const ang = Math.atan2(hy - py, hx - px);
  const s = 2.4 + width;
  ctx.beginPath();
  ctx.moveTo(hx + Math.cos(ang) * 0.6, hy + Math.sin(ang) * 0.6);
  ctx.lineTo(hx - Math.cos(ang) * s + Math.sin(ang) * s * 0.6, hy - Math.sin(ang) * s - Math.cos(ang) * s * 0.6);
  ctx.lineTo(hx - Math.cos(ang) * s - Math.sin(ang) * s * 0.6, hy - Math.sin(ang) * s + Math.cos(ang) * s * 0.6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

/** Pastille d'alerte sur une province de la Couronne qui sera attaquée. */
function warning(ctx: CanvasRenderingContext2D, id: ProvinceId, time: number): void {
  const [ax, ay] = anchor(id);
  const x = ax + 6.5; // à droite du nom, pour ne pas masquer les provinces voisines
  const y = ay + 1.5;
  const r = 2.5 + 0.3 * Math.sin(time * 6);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 1.15, y + r * 0.8);
  ctx.lineTo(x - r * 1.15, y + r * 0.8);
  ctx.closePath();
  ctx.fillStyle = "#e5483c";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.7;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${r * 1.5}px ${FONT_BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", x, y + r * 0.25);
}

/**
 * Résultat d'une attaque : coche si la province change de main, croix si l'attaque est repoussée. La couleur est celle du
 * point de vue du joueur : vert quand c'est bon pour la Couronne, rouge quand c'est mauvais, ambre entre deux autres camps.
 */
function verdict(ctx: CanvasRenderingContext2D, id: ProvinceId, won: boolean, tone: "good" | "bad" | "neutral", pop: number): void {
  const [x, y] = anchor(id);
  const r = 4.4 * pop;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = tone === "good" ? "#3fb248" : tone === "bad" ? "#e5483c" : "#f5a91a";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (won) {
    ctx.moveTo(x - r * 0.45, y);
    ctx.lineTo(x - r * 0.1, y + r * 0.4);
    ctx.lineTo(x + r * 0.5, y - r * 0.35);
  } else {
    ctx.moveTo(x - r * 0.38, y - r * 0.38);
    ctx.lineTo(x + r * 0.38, y + r * 0.38);
    ctx.moveTo(x + r * 0.38, y - r * 0.38);
    ctx.lineTo(x - r * 0.38, y + r * 0.38);
  }
  ctx.stroke();
}

/** Petit château : un niveau de forteresse (jusqu'à 3 côte à côte). */
function fort(ctx: CanvasRenderingContext2D, x: number, y: number, level: number): void {
  const w = 3.4;
  const total = level * w + (level - 1) * 0.8;
  for (let i = 0; i < level; i++) {
    const cx = x - total / 2 + i * (w + 0.8);
    ctx.fillStyle = "#b9b2a0";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.rect(cx, y - 2.2, w, 2.6);
    ctx.fill();
    ctx.stroke();
    for (const dx of [0, w / 2 - 0.4, w - 0.8]) ctx.fillRect(cx + dx, y - 3.2, 0.8, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(cx + w / 2 - 0.35, y - 0.9, 0.7, 1.3);
  }
}

/** Ce que la carte affiche en plus de l'état de la campagne. */
export interface CampaignScene {
  /** propriétaires affichés, si différents de ceux de la campagne (animation de fin de tour) */
  ownerView?: Readonly<Record<ProvinceId, FactionId>>;
  selected: ProvinceId | null;
  attackable: readonly ProvinceId[];
  goal: readonly ProvinceId[];
  /** attaques annoncées, dessinées en flèches (rien pendant l'animation de fin de tour) */
  threats: readonly Threat[];
  /** l'attaque en cours d'animation : `t` de 0 à 1 (la flèche avance puis le verdict apparaît) */
  anim: { event: TurnEvent; t: number } | null;
  time: number;
}

export function drawCampaign(ctx: CanvasRenderingContext2D, view: View, c: CampaignState, scene: CampaignScene): void {
  const owner = scene.ownerView ?? c.owner;
  drawSea(ctx, view.w, view.h);
  ctx.save();
  ctx.translate(view.offX, view.offY);
  ctx.scale(view.scale, view.scale);
  ctx.translate(MARGIN, MARGIN);
  ctx.lineJoin = "round";

  // écume, ombre portée, puis remplissage et contour
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  for (const p of MAP.provinces) for (const ring of p.shapes) (ctx.beginPath(), trace(ctx, ring), ctx.stroke());
  ctx.save();
  ctx.translate(0, 1.2);
  ctx.fillStyle = "rgba(43,42,58,0.22)";
  for (const p of MAP.provinces) for (const ring of p.shapes) (ctx.beginPath(), trace(ctx, ring), ctx.fill());
  ctx.restore();

  for (const p of MAP.provinces) {
    const tone = FACTION[owner[p.id]] ?? FACTION.neutral;
    for (const ring of p.shapes) {
      ctx.beginPath();
      trace(ctx, ring);
      ctx.fillStyle = tone.fill;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 0.45;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // liaisons maritimes
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 0.8;
  ctx.lineCap = "round";
  ctx.setLineDash([0.1, 1.8]);
  ctx.beginPath();
  for (const [a, b] of MAP.seaLinks) {
    ctx.moveTo(PROVINCES[a].x, PROVINCES[a].y);
    ctx.lineTo(PROVINCES[b].x, PROVINCES[b].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // provinces attaquables : halo doré qui pulse
  if (c.status === "playing" && !scene.anim) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.1 + 0.5 * Math.sin(scene.time * 4);
    for (const id of scene.attackable) for (const ring of PROVINCES[id].shapes) (ctx.beginPath(), trace(ctx, ring), ctx.stroke());
  }
  if (scene.selected) {
    for (const ring of PROVINCES[scene.selected].shapes) {
      ctx.beginPath();
      trace(ctx, ring);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  // noms, forteresses, étoile des provinces de l'objectif
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const goalSet = new Set(scene.goal);
  for (const p of MAP.provinces) {
    const lines = labelLines(p.name);
    ctx.font = `700 2.5px ${FONT_BODY}`;
    lines.forEach((line, i) => {
      const y = p.y + (i - (lines.length - 1) / 2) * 2.7;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeText(line, p.x, y);
      ctx.fillStyle = INK;
      ctx.fillText(line, p.x, y);
    });
    const level = c.fort[p.id] ?? 0;
    if (level > 0) fort(ctx, p.x, p.y + (lines.length / 2) * 2.7 + 3.4, level);
    if (goalSet.has(p.id)) star(ctx, p.x, p.y - 2.7 * (lines.length / 2) - 2, 1.9);
  }

  // attaques annoncées : flèches de la couleur de l'attaquant, alerte sur les provinces de la Couronne visées
  if (!scene.anim) {
    for (const t of scene.threats) {
      const aimedAtCrown = owner[t.target] === "crown";
      const tone = FACTION[t.attacker] ?? FACTION.neutral;
      arrow(ctx, t.from, t.target, tone.dark, aimedAtCrown ? 1.5 : 0.9, 1, scene.time * 7);
    }
    for (const t of scene.threats) if (owner[t.target] === "crown") warning(ctx, t.target, scene.time);
  } else {
    const { event, t } = scene.anim;
    const tone = FACTION[event.attacker] ?? FACTION.neutral;
    arrow(ctx, event.from, event.target, tone.dark, 1.9, Math.min(1, t / 0.55));
    const good = (event.attacker === "crown" && event.won) || (event.defender === "crown" && !event.won);
    const bad = (event.defender === "crown" && event.won) || (event.attacker === "crown" && !event.won);
    if (t > 0.55) verdict(ctx, event.target, event.won, good ? "good" : bad ? "bad" : "neutral", Math.min(1, (t - 0.55) / 0.15));
  }
  ctx.restore();
}
