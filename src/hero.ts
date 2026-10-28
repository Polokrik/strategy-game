import { INK } from "./theme";

/** Feuilles d'un laurier doré en arc autour de (120, 128), du côté `side` (-1 gauche, 1 droite). */
function laurel(side: -1 | 1): string {
  let out = "";
  for (let i = 0; i < 9; i++) {
    const phi = ((-5 + i * 14) * Math.PI) / 180; // du bas vers le haut
    const x = 120 + side * 86 * Math.cos(phi);
    const y = 128 - 86 * Math.sin(phi);
    const rot = (Math.atan2(-Math.cos(phi), -side * Math.sin(phi)) * 180) / Math.PI; // le long de l'arc
    out += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="15" ry="6.5" fill="url(#gold)" stroke="#a86a00" stroke-width="2" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return out;
}

/** Mascotte au drapeau : fière en cas de victoire, drapeau en berne sinon. Dessin maison, sans asset. */
export function heroSvg(win: boolean): string {
  const flag = win
    ? `<line x1="150" y1="22" x2="134" y2="150" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/>
       <path d="M150 22 L208 32 L192 50 L207 66 L146 58 Z" fill="#e5483c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
    : `<line x1="152" y1="92" x2="136" y2="156" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/>
       <path d="M152 92 L186 104 L176 116 L186 126 L150 120 Z" fill="#8f8aa8" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  const mouth = win
    ? `<path d="M96 134 Q108 148 120 134" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M98 142 Q108 132 118 142" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg class="hero" viewBox="0 0 240 200" aria-hidden="true">
    <defs>
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe089"/><stop offset="1" stop-color="#f5a91a"/></linearGradient>
      <radialGradient id="glow"><stop offset="0" stop-color="#ffe9a3" stop-opacity=".85"/><stop offset="1" stop-color="#ffe9a3" stop-opacity="0"/></radialGradient>
    </defs>
    ${win ? `<circle cx="120" cy="110" r="100" fill="url(#glow)"/>${laurel(-1)}${laurel(1)}` : ""}
    ${flag}
    <ellipse cx="108" cy="172" rx="46" ry="30" fill="#4c9a3f" stroke="${INK}" stroke-width="3"/>
    <circle cx="108" cy="122" r="34" fill="#ffd2a8" stroke="${INK}" stroke-width="3"/>
    <path d="M70 118 A38 38 0 0 1 146 118 Q108 102 70 118 Z" fill="#4c9a3f" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M64 120 Q108 104 152 120" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="94" cy="128" r="3.6" fill="${INK}"/><circle cx="122" cy="128" r="3.6" fill="${INK}"/>
    ${mouth}
  </svg>`;
}

const CONFETTI_COLORS = ["#ff8a73", "#ffcf66", "#6bb6ff", "#c99cf0", "#5ed35a", "#ffffff"];

export function launchConfetti(host: HTMLElement): void {
  host.replaceChildren();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement("i");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDuration = `${2.8 + Math.random() * 2.4}s`;
    piece.style.animationDelay = `${-Math.random() * 4}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    host.append(piece);
  }
}
