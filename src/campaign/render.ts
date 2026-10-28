import { type View, drawSea } from "../render";
import { FACTION, FONT_BODY, GOLD, INK } from "../theme";
import type { CampaignState } from "./campaign";
import { MAP, PROVINCES, type ProvinceId } from "./france";

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

export function drawCampaign(
  ctx: CanvasRenderingContext2D,
  view: View,
  c: CampaignState,
  selected: ProvinceId | null,
  attackable: readonly ProvinceId[],
  goal: readonly ProvinceId[],
  time: number,
): void {
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
    const tone = FACTION[c.owner[p.id]] ?? FACTION.neutral;
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
  if (c.status === "playing") {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.1 + 0.5 * Math.sin(time * 4);
    for (const id of attackable) for (const ring of PROVINCES[id].shapes) (ctx.beginPath(), trace(ctx, ring), ctx.stroke());
  }
  if (selected) {
    for (const ring of PROVINCES[selected].shapes) {
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

  // noms, avec un halo blanc pour rester lisibles ; étoile sur les provinces de l'objectif
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 2.5px ${FONT_BODY}`;
  const goalSet = new Set(goal);
  for (const p of MAP.provinces) {
    const lines = labelLines(p.name);
    lines.forEach((line, i) => {
      const y = p.y + (i - (lines.length - 1) / 2) * 2.7;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeText(line, p.x, y);
      ctx.fillStyle = INK;
      ctx.fillText(line, p.x, y);
    });
    if (goalSet.has(p.id)) star(ctx, p.x, p.y - 2.7 * (lines.length / 2) - 2, 1.9);
  }
  ctx.restore();
}
