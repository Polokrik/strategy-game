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

/** Arbalétrier : le fantassin, chapel de fer et arbalète en travers. */
function crossbowSvg(): string {
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="106" rx="32" ry="9" fill="rgba(43,42,58,.18)"/>
    <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <ellipse cx="56" cy="88" rx="25" ry="19" fill="${BLUE}"/>
      <circle cx="56" cy="54" r="22" fill="${SKIN}"/>
      <path d="M28 50 Q56 22 84 50 Z" fill="#9aa0b4"/>
      <line x1="24" y1="50" x2="88" y2="50" stroke-width="5"/>
      <line x1="50" y1="84" x2="106" y2="72" stroke="#8a5a2b" stroke-width="5"/>
      <path d="M96 52 Q112 72 100 94" fill="none" stroke="#8a5a2b" stroke-width="4"/>
      <line x1="96" y1="52" x2="100" y2="94" stroke-width="1.5"/>
    </g>
    <circle cx="48" cy="60" r="2.8" fill="${INK}"/><circle cx="64" cy="60" r="2.8" fill="${INK}"/>
    <path d="M50 69 H62" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

/** Canon : fût de bronze sur affût à roues, boulets au pied. */
function cannonSvg(): string {
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="106" rx="40" ry="8" fill="rgba(43,42,58,.18)"/>
    <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <path d="M30 78 L92 44 L100 58 L42 92 Z" fill="#c9a23f"/>
      <path d="M88 42 L102 36 L108 54 L98 60 Z" fill="#a8842c"/>
      <path d="M24 84 L60 84 L70 98 L20 98 Z" fill="#8a5a2b"/>
      <circle cx="44" cy="92" r="15" fill="#c98a4b"/>
      <circle cx="44" cy="92" r="4" fill="${INK}"/>
      <path d="M44 77 V107 M29 92 H59" stroke-width="2"/>
      <circle cx="84" cy="100" r="6" fill="#55586b"/><circle cx="96" cy="100" r="6" fill="#55586b"/><circle cx="90" cy="90" r="6" fill="#55586b"/>
    </g>
  </svg>`;
}

/** Les cartes, dans l'ordre des époques (ERAS). Une carte sans dessin serait une silhouette « ? » à concevoir. */
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
  {
    id: "crossbow",
    name: "Arbalétriers",
    from: ERAS[2].from,
    blurb: "Arrivés avec le Grand royaume. Postés sur les murs, ils font payer cher chaque assaut contre vos territoires.",
    stats: [{ label: "Défense des territoires", value: "×1,25" }],
    draw: crossbowSvg,
  },
  {
    id: "artillery",
    name: "Artillerie",
    from: ERAS[3].from,
    blurb: "Arrivée avec la France. Les canons ouvrent les murailles : vos assauts frappent plus fort.",
    stats: [{ label: "Force des assauts", value: "×1,25" }],
    draw: cannonSvg,
  },
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
