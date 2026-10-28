import { ERAS } from "./campaign/state";
import { INK } from "./theme";

/** Une unité de l'escouade : se débloque par la taille du royaume (les époques), jamais par achat. */
export interface UnitCard {
  id: string;
  name: string;
  /** provinces à tenir pour la débloquer ; null : disponible d'office */
  from: number | null;
  /** ce que l'unité change en bataille ; absent : pas encore conçue (silhouette verrouillée) */
  stats?: { label: string; value: string }[];
  blurb?: string;
  draw?: () => string;
}

const BLUE = "#6bb6ff";
const BLUE_DARK = "#1d5fae";
const SKIN = "#ffd2a8";

/** Fantassin : tête ronde, casque, sans asset (dessin maison comme la mascotte). */
function infantrySvg(): string {
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="104" rx="30" ry="10" fill="rgba(43,42,58,.18)"/>
    <ellipse cx="60" cy="88" rx="26" ry="20" fill="${BLUE}" stroke="${INK}" stroke-width="3"/>
    <circle cx="60" cy="56" r="24" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
    <path d="M34 54 A26 26 0 0 1 86 54 Q60 42 34 54 Z" fill="${BLUE_DARK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="51" cy="60" r="3" fill="${INK}"/><circle cx="69" cy="60" r="3" fill="${INK}"/>
    <path d="M52 69 Q60 76 68 69" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

/** Cavalier : cheval de profil, chevalier au heaume à plumet et fanion. */
function cavalrySvg(): string {
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="58" cy="108" rx="40" ry="8" fill="rgba(43,42,58,.18)"/>
    <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <path d="M36 90 L34 106 M48 92 L48 106 M72 92 L74 106 M84 90 L88 105" fill="none" stroke-width="5"/>
      <path d="M86 52 L98 40 L108 58 L100 68 L92 66 Z" fill="#c98a4b"/>
      <ellipse cx="60" cy="78" rx="30" ry="16" fill="#c98a4b"/>
      <path d="M32 72 Q22 80 26 92" fill="none" stroke-width="4"/>
      <path d="M80 70 L90 56 L96 62 L90 76 Z" fill="#c98a4b"/>
      <path d="M52 66 Q60 60 70 66 L68 78 L54 78 Z" fill="${BLUE}"/>
      <circle cx="61" cy="52" r="11" fill="${SKIN}"/>
      <path d="M50 52 A11 11 0 0 1 72 52 Z" fill="${BLUE_DARK}"/>
      <path d="M61 41 Q58 32 66 30" fill="none" stroke="#e5483c" stroke-width="4"/>
      <line x1="76" y1="68" x2="76" y2="26" stroke="#8a5a2b" stroke-width="3"/>
      <path d="M76 26 L98 32 L76 40 Z" fill="#e5483c"/>
    </g>
    <circle cx="102" cy="52" r="2.4" fill="${INK}"/>
  </svg>`;
}

/** Les cartes, dans l'ordre : les trois premières suivent ERAS ; les suivantes sont des silhouettes à concevoir. */
export const UNITS: UnitCard[] = [
  {
    id: "infantry",
    name: "Fantassins",
    from: null,
    blurb: "La troupe de base du royaume : ni rapide ni chère, elle tient les frontières.",
    stats: [{ label: "Vitesse", value: "×1" }],
    draw: infantrySvg,
  },
  {
    id: "cavalry",
    name: "Cavaliers",
    from: ERAS[1].from,
    blurb: "Arrivés avec l'époque Royaume. Ils traversent les provinces plus vite et surprennent les camps adverses.",
    stats: [{ label: "Vitesse", value: "×1,3" }],
    draw: cavalrySvg,
  },
  { id: "next-1", name: "Grand royaume", from: 12 },
  { id: "next-2", name: "France", from: 20 },
];

export const unlocked = (u: UnitCard, reach: number): boolean => u.from === null || reach >= u.from;

/** Dessine la galerie : une carte par unité (silhouette et « ? » tant qu'elle est verrouillée). */
export function renderSquad(grid: HTMLElement, detail: HTMLElement, stage: HTMLElement, reach: number, selected: string, onPick: (id: string) => void): void {
  grid.replaceChildren(
    ...UNITS.map((u) => {
      const open = unlocked(u, reach);
      const b = document.createElement("button");
      b.className = `unit${open ? "" : " locked"}${u.id === selected ? " sel" : ""}`;
      b.setAttribute("aria-pressed", String(u.id === selected));
      const art = u.draw ? u.draw() : `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="56" r="30" fill="currentColor"/></svg>`;
      b.innerHTML = `<span class="art">${art}${open ? "" : `<i class="mark">${u.draw ? "🔒" : "?"}</i>`}</span><span class="nm">${open ? u.name : u.from === null ? "" : `${u.from} prov.`}</span>`;
      b.addEventListener("click", () => onPick(u.id));
      return b;
    }),
  );
  const u = UNITS.find((x) => x.id === selected) ?? UNITS[0];
  const open = unlocked(u, reach);
  const big = u.draw ? u.draw() : `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="56" r="30" fill="currentColor"/></svg>`;
  stage.className = open ? "" : "locked";
  stage.innerHTML = `${big}${open ? "" : `<i class="mark">?</i>`}`;
  const rows = (u.stats ?? []).map((s) => `<li><span>${s.label}</span><b>${s.value}</b></li>`).join("");
  detail.innerHTML = open
    ? `<h2>${u.name}</h2><p>${u.blurb ?? "Pas encore conçue : cette époque réserve une unité à venir."}</p>${rows ? `<ul class="stats">${rows}</ul>` : ""}`
    : `<h2>${u.draw ? u.name : "Joue plus pour l'obtenir"}</h2><p>${
        u.from === null ? "" : `Tiens ${u.from} provinces dans la campagne choisie pour ${u.draw ? "débloquer cette unité" : "l'époque « " + u.name + " »"}. Tu en tiens ${reach}.`
      }</p>`;
}
