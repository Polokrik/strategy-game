import { INK } from "./theme";

/** Un sprite en pixel art : une ligne de texte par rangée, un caractère par pixel (« . » = vide). */
export type Art = readonly string[];
export type Palette = Record<string, string>;

const cache = new Map<string, HTMLCanvasElement>();

/** Rend un sprite une fois par (dessin, couleurs) ; le canvas renvoyé fait un pixel par caractère. */
export function sprite(art: Art, palette: Palette): HTMLCanvasElement {
  const key = art.join("|") + JSON.stringify(palette);
  let c = cache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = art[0].length;
    c.height = art.length;
    const g = c.getContext("2d")!;
    art.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = palette[row[x]];
        if (!color) continue;
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
    });
    cache.set(key, c);
  }
  return c;
}

/** Pose un sprite centré en bas sur (x, y), à `px` unités monde par pixel, sans lissage. */
export function blit(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, px: number, flip = false): void {
  const w = img.width * px;
  const h = img.height * px;
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, y - h, w, h);
    ctx.restore();
  } else ctx.drawImage(img, x - w / 2, y - h, w, h);
}

/** Couleurs communes : o = contour, s = peau, e = œil, n = cheval, m = métal, k = bois. */
export const BASE_PALETTE: Palette = { o: INK, s: "#ffd2a8", e: INK, n: "#c98a4b", m: "#8d93a8", k: "#8a5a2b", g: "#ffe9a3", d: "#5b3a1c" };

/** Le minion à pied, deux pas de marche. h = casque (couleur foncée du camp), b = corps (couleur claire). */
export const MINION: Art[] = [
  ["..ooooo..", ".ohhhhho.", "ohhhhhhho", "ossssssso", "osessseso", "ossssssso", ".obbbbbo.", ".obbbbbo.", "..oo.oo.."],
  ["..ooooo..", ".ohhhhho.", "ohhhhhhho", "ossssssso", "osessseso", "ossssssso", ".obbbbbo.", ".obbbbbo.", ".oo...oo."],
];

/** Le cavalier, deux foulées. */
export const RIDER: Art[] = [
  ["....ooo......", "...ohhho.....", "...oseso..oo.", "...obbbo.onno", ".ooobbboonnno", "onnnnnnnnnno.", "onnnnnnnnno..", ".onnnnnnno...", ".on.o..on.o..", ".oo.....oo..."],
  ["....ooo......", "...ohhho.....", "...oseso..oo.", "...obbbo.onno", ".ooobbboonnno", "onnnnnnnnnno.", "onnnnnnnnno..", ".onnnnnnno...", "..ono.ono....", "..oo...oo...."],
];

/** Le canon, tiré en tête de colonne par un camp qui a l'artillerie. */
export const CANNON: Art = ["......oooo", "..oooommmo", ".ommmmmmo.", ".oooooooo.", ".okko.okko", "..oo...oo."];

/** Le pavois des arbalétriers, posé à côté des bâtiments d'un camp qui en a. */
export const SHIELD: Art = ["ooooo", "obgbo", "obgbo", "obgbo", ".obo.", "..o.."];

/** Bâtiments par palier : r = toit (foncé du camp), w = mur (clair du camp), f = fanion. */
export const BUILDINGS: Record<1 | 2 | 3, Art> = {
  1: ["....ooo....", "...orrro...", "..orrrrro..", ".orrrrrrro.", "ooooooooooo", ".owwwwwwwo.", ".owwdddwwo.", ".owwdddwwo.", ".ooooooooo."],
  2: [
    "..ooo........",
    ".orrro..ooo..",
    "orrrrroorrro.",
    "ooooooorrrrro",
    ".owwwoooooooo",
    ".owgwowwwwwo.",
    ".owwwowgwgwo.",
    ".owwwowwwwwo.",
    ".owdwowwdwwo.",
    ".owdwowwdwwo.",
    ".ooooooooooo.",
  ],
  3: [
    ".......off.....",
    ".......offf....",
    ".......o.......",
    "ooo.ooooooo.ooo",
    "oro.orrrrro.oro",
    "owooowwgwwooowo",
    "owwwwwwwwwwwwwo",
    "owgwwwwwwwwwgwo",
    "owwwwwdddwwwwwo",
    "owwwwwdddwwwwwo",
    "ooooooooooooooo",
  ],
};
