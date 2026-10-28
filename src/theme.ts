/**
 * Source unique du style. Le canvas lit ces constantes, le CSS lit les variables
 * `--*` posées par `applyTheme()`. Voir docs/STYLE.md.
 */

export interface Tone {
  /** remplissage du territoire */
  fill: string;
  /** disques, flux de troupes, contours */
  dark: string;
}

/** Un camp = une couleur, jamais réutilisée pour autre chose (0 = neutre). */
export const OWNER: Record<number, Tone> = {
  0: { fill: "#e0d9c6", dark: "#8f8672" },
  1: { fill: "#6bb6ff", dark: "#1d5fae" },
  2: { fill: "#ff8a73", dark: "#a8301f" },
  3: { fill: "#ffcf66", dark: "#a86d00" },
  4: { fill: "#c99cf0", dark: "#6b2f9e" },
};

export const SEA = {
  top: "#e8eef4",
  bottom: "#cddae6",
  foam: "rgba(255,255,255,0.85)",
  wave: "rgba(120,150,180,0.25)",
};

export const INK = "#2b2a3a";
export const GOLD = "#ffc83d";

export const FONT_DISPLAY = '"Lilita One", "Fredoka", system-ui, sans-serif';
export const FONT_BODY = '"Fredoka", system-ui, sans-serif';

/** Variables CSS de l'habillage (rubans, boutons, panneaux). */
export const UI: Record<string, string> = {
  ink: INK,
  "ink-soft": "#555a7a",
  "lav-50": "#f3f5fd",
  "lav-100": "#e3e7f8",
  "lav-300": "#b4bfe8",
  "lav-500": "#6f80c4",
  "blue-500": "#3f74e0",
  "blue-700": "#2a4fa8",
  "green-400": "#3fb248",
  "green-600": "#26842e",
  "green-800": "#175a1f",
  "gold-300": "#ffd866",
  "gold-500": "#f5a91a",
  "gold-700": "#a86a00",
  "red-500": "#e5483c",
  "red-700": "#a82a22",
  "night-900": "#1c2140",
  "sea-top": SEA.top,
  "sea-bottom": SEA.bottom,
};

export function applyTheme(): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(UI)) root.style.setProperty(`--${k}`, v);
  root.style.setProperty("--font-display", FONT_DISPLAY);
  root.style.setProperty("--font-body", FONT_BODY);
  for (const [id, tone] of Object.entries(OWNER)) {
    root.style.setProperty(`--owner-${id}`, tone.fill);
    root.style.setProperty(`--owner-${id}-dark`, tone.dark);
  }
}
