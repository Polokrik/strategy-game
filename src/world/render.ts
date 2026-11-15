import { BUILDINGS, BASE_PALETTE, blit, sprite } from "../pixel";
import { type View, drawSea } from "../render";
import { FACTION, FONT_BODY, GOLD, INK, OWNER, type Tone } from "../theme";
import { capacityOf } from "./rules";
import { REGIONS, type RegionId, type SocietyId, THEATRE, type WorldState } from "./state";

/** Marge autour du théâtre, en unités monde. */
export const WORLD_MARGIN = 4;
export const WORLD_SIZE = { w: THEATRE.width + 2 * WORLD_MARGIN, h: THEATRE.height + 2 * WORLD_MARGIN };

const RIVAL_TONES: Tone[] = [OWNER[2], OWNER[3], OWNER[4], FACTION.empire, FACTION.toulouse, FACTION.champagne];

/** Couleur d'une société : le joueur est toujours bleu ; les autres gardent la couleur de leur rang de départ. */
export function toneOf(w: WorldState, s: SocietyId | null): Tone {
  if (s === null) return OWNER[0];
  if (s === w.player) return OWNER[1];
  return RIVAL_TONES[Math.max(0, w.rivals.indexOf(s)) % RIVAL_TONES.length];
}

export interface WorldScene {
  selected: RegionId | null;
  /** régions que le joueur peut attaquer ce tour */
  attackable: readonly RegionId[];
  /** grossissement courant : les noms n'apparaissent qu'à partir d'un certain zoom */
  zoom: number;
}

function trace(ctx: CanvasRenderingContext2D, shape: [number, number][]): void {
  ctx.beginPath();
  shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Région sous le point (coordonnées du théâtre), ou null en mer. */
export function regionAt(x: number, y: number): RegionId | null {
  for (const r of THEATRE.regions) {
    let inside = false;
    const s = r.shape;
    for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
      if (s[i][1] > y !== s[j][1] > y && x < ((s[j][0] - s[i][0]) * (y - s[i][1])) / (s[j][1] - s[i][1]) + s[i][0]) inside = !inside;
    }
    if (inside) return r.id;
  }
  return null;
}

export function drawWorld(ctx: CanvasRenderingContext2D, view: View, w: WorldState | null, scene: WorldScene): void {
  drawSea(ctx, view.w, view.h);
  ctx.save();
  ctx.translate(view.offX, view.offY);
  ctx.scale(view.scale, view.scale);
  ctx.translate(WORLD_MARGIN, WORLD_MARGIN);
  ctx.lineJoin = "round";

  // liseré de côte : une ombre blanche sous toutes les terres
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2.2;
  for (const r of THEATRE.regions) {
    trace(ctx, r.shape);
    ctx.stroke();
  }
  for (const r of THEATRE.regions) {
    trace(ctx, r.shape);
    ctx.fillStyle = (w ? toneOf(w, w.owner[r.id]) : OWNER[0]).fill;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // traversées maritimes
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 0.7;
  ctx.lineCap = "round";
  ctx.setLineDash([0.1, 1.6]);
  ctx.beginPath();
  for (const [a, b] of THEATRE.seaLinks) {
    ctx.moveTo(REGIONS[a].x, REGIONS[a].y);
    ctx.lineTo(REGIONS[b].x, REGIONS[b].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const id of scene.attackable) {
    trace(ctx, REGIONS[id].shape);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  if (scene.selected) {
    trace(ctx, REGIONS[scene.selected].shape);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  for (const r of [...THEATRE.regions].sort((a, b) => a.y - b.y)) {
    const owner = w ? w.owner[r.id] : null;
    const t = w ? toneOf(w, owner) : OWNER[0];
    const neutral = owner === null;
    const cap = capacityOf(r.id);
    const img = sprite(BUILDINGS[neutral ? 1 : cap < 90 ? 1 : cap < 120 ? 2 : 3], {
      ...BASE_PALETTE,
      r: neutral ? "#a39a84" : t.dark,
      w: "#fbf7ea",
      f: neutral ? "#a39a84" : t.dark,
    });
    blit(ctx, img, r.x, r.y + 0.6, 0.32);
    if (w) {
      const label = String(w.troops[r.id]);
      ctx.font = `700 2.5px ${FONT_BODY}`;
      const width = Math.max(4, ctx.measureText(label).width + 1.6);
      ctx.fillStyle = neutral ? "#fff" : t.dark;
      ctx.fillRect(r.x - width / 2, r.y + 0.9, width, 3);
      ctx.strokeStyle = neutral ? t.dark : "#fff";
      ctx.lineWidth = 0.3;
      ctx.strokeRect(r.x - width / 2, r.y + 0.9, width, 3);
      ctx.fillStyle = neutral ? INK : "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, r.x, r.y + 2.55);
    }
  }
  // les noms passent au-dessus de tout le reste
  for (const r of THEATRE.regions) {
    if (scene.zoom >= 1.5 || r.id === scene.selected) {
      ctx.font = `700 ${scene.zoom >= 1.5 ? 1.7 : 2.3}px ${FONT_BODY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(r.name, r.x, r.y - 4.4);
      ctx.fillStyle = INK;
      ctx.fillText(r.name, r.x, r.y - 4.4);
    }
  }
  ctx.restore();
}
