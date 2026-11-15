import type { LevelDef } from "../engine/level";
import type { View } from "../render";
import { battleFor, contextOf } from "./battle";
import { formatYear, stepAt } from "./calendar";
import { WORLD_MARGIN, WORLD_SIZE, drawWorld, regionAt, toneOf } from "./render";
import { available, canAttack, capacityOf, chanceOf, deserialize, endTurn, newWorld, playerAttack, serialize, targetsOf } from "./rules";
import { REGIONS, type RegionId, THEATRE, type WorldState, regionsOf, societyName, troopsOf } from "./state";

const KEY = "conquete.monde";
const $ = (id: string) => document.getElementById(id)!;

/** Ce que l'écran Monde demande au reste du jeu : il ne connaît ni les chapitres ni la campagne France. */
export interface WorldHost {
  /** lance une bataille en temps réel et rappelle avec son issue (se retirer compte pour une défaite) */
  playBattle(def: LevelDef, done: (won: boolean) => void): void;
  /** montre la carte du monde (après une bataille ou à l'ouverture) */
  show(): void;
  layout(): void;
}

export interface WorldScreen {
  saved(): WorldState | null;
  /** reprend la partie sauvegardée, ou ouvre le choix de la région de départ */
  open(fresh: boolean): void;
  draw(ctx: CanvasRenderingContext2D, base: View, preview: boolean): void;
  down(e: PointerEvent): void;
  move(e: PointerEvent, base: View): void;
  up(e: PointerEvent, base: View): void;
  wheel(e: WheelEvent): void;
  describeSave(): string;
}

function store(value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(KEY, value);
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function createWorldScreen(host: WorldHost): WorldScreen {
  let world = deserialize(store());
  let picking = false;
  let pick: RegionId | null = null;
  let selected: RegionId | null = null;
  let sent = 0;
  let zoom = 1;
  let center = { x: WORLD_SIZE.w / 2, y: WORLD_SIZE.h / 2 };
  let grab: { x: number; y: number; moved: boolean } | null = null;

  const save = () => world && store(serialize(world));

  /** La vue de base (carte entière) transformée par le zoom et le déplacement du joueur. */
  function viewOf(base: View): View {
    const cx = base.offX + (WORLD_SIZE.w * base.scale) / 2;
    const cy = base.offY + (WORLD_SIZE.h * base.scale) / 2;
    const scale = base.scale * zoom;
    return { ...base, scale, offX: cx - center.x * scale, offY: cy - center.y * scale };
  }

  function setZoom(next: number): void {
    zoom = Math.min(3, Math.max(1, next));
    if (zoom === 1) center = { x: WORLD_SIZE.w / 2, y: WORLD_SIZE.h / 2 };
  }

  const chip = (text: string, cls = ""): HTMLElement => {
    const el = document.createElement("span");
    el.className = `chip ${cls}`.trim();
    el.textContent = text;
    return el;
  };

  function render(): void {
    const main = $("wp-main") as HTMLButtonElement;
    const auto = $("wp-auto") as HTMLButtonElement;
    const end = $("wp-end") as HTMLButtonElement;
    const chips = $("wp-chips");
    const send = $("wp-send");
    chips.replaceChildren();
    send.hidden = true;
    auto.hidden = true;
    $("wp-log").replaceChildren();

    if (picking) {
      $("world-when").textContent = "3000 av. J.-C.";
      $("world-troops").hidden = true;
      $("world-land").hidden = true;
      end.hidden = true;
      main.hidden = false;
      main.textContent = "Commencer ici";
      main.disabled = pick === null;
      $("wp-faction").textContent = THEATRE.name;
      if (!pick) {
        $("wp-name").textContent = "Choisis ta région";
        $("wp-note").textContent = "Touche la région où vit ton peuple. Pas de royaumes ici : des communautés locales, et quelques autres peuples au loin.";
        return;
      }
      const r = REGIONS[pick];
      $("wp-name").textContent = r.name;
      chips.append(chip(`Peut entretenir ${capacityOf(pick)} troupes`), chip(`${r.neighbors.length} voisine${r.neighbors.length > 1 ? "s" : ""}`));
      $("wp-note").textContent = "Une grande région nourrit plus de troupes ; une région aux nombreuses voisines s'étend plus vite, et s'expose davantage.";
      return;
    }

    const w = world!;
    $("world-troops").hidden = false;
    $("world-land").hidden = false;
    $("world-when").textContent = `${formatYear(w.year)} · tour ${w.turn + 1}`;
    $("world-troops").textContent = `${troopsOf(w, w.player)} troupes`;
    $("world-land").textContent = `${regionsOf(w, w.player).length}/${THEATRE.regions.length} régions`;
    end.hidden = false;
    end.disabled = w.status !== "playing";
    end.innerHTML = `Fin du tour<small>+${stepAt(w.year)} ans</small>`;
    main.hidden = true;
    $("wp-log").replaceChildren(
      ...w.log.slice(-3).map((l) => {
        const li = document.createElement("li");
        li.textContent = l;
        return li;
      }),
    );

    if (w.status !== "playing") {
      $("wp-faction").textContent = formatYear(w.year);
      $("wp-name").textContent = w.status === "won" ? "Tout le théâtre est à toi" : "Ton peuple s'est dispersé";
      $("wp-note").textContent = "La partie est finie. Tu peux en commencer une autre depuis le menu.";
      return;
    }
    if (!selected) {
      $("wp-faction").textContent = "Ton peuple";
      $("wp-name").textContent = "Choisis une région";
      $("wp-note").textContent = "Les régions cerclées d'or sont à ta portée. Attaquer n'est pas obligatoire : le temps passe de toute façon à la fin du tour.";
      return;
    }

    const r = REGIONS[selected];
    const owner = w.owner[selected];
    $("wp-faction").textContent = owner === w.player ? "Ton peuple" : societyName(owner);
    $("wp-dot").style.background = toneOf(w, owner).fill;
    $("wp-name").textContent = r.name;
    chips.append(chip(`${w.troops[selected]} troupes`), chip(`capacité ${capacityOf(selected)}`));
    if (owner === w.player) {
      $("wp-note").textContent = "Une de tes régions. Ses troupes se refont à chaque tour, jusqu'à sa capacité.";
      return;
    }
    if (!targetsOf(w, w.player).includes(selected)) {
      $("wp-note").textContent = "Trop loin : tu ne peux attaquer que les régions voisines de ton territoire.";
      return;
    }
    const max = available(w, w.player);
    if (max < 1) {
      $("wp-note").textContent = "Tu n'as plus de troupes à envoyer ce tour.";
      return;
    }
    sent = Math.min(max, Math.max(1, sent || Math.ceil(max / 2)));
    const range = $("wp-range") as HTMLInputElement;
    range.max = String(max);
    range.value = String(sent);
    send.hidden = false;
    const p = Math.round(chanceOf(w, w.player, selected, sent) * 100);
    $("wp-sent").textContent = `${sent} sur ${max}`;
    chips.append(chip(`Chance ${p} %`, p < 50 ? "alert" : p >= 75 ? "good" : ""));
    $("wp-note").textContent = "La chance vient du rapport de forces : c'est celle de la résolution automatique. En jouant la bataille, l'issue dépend de toi.";
    main.hidden = false;
    main.disabled = false;
    main.textContent = "Jouer";
    auto.hidden = false;
    auto.innerHTML = `Résoudre<small>${p} %</small>`;
  }

  function select(id: RegionId | null): void {
    if (picking) pick = id;
    else {
      if (id !== selected) sent = 0;
      selected = id;
    }
    render();
    host.layout();
  }

  function attack(play: boolean): void {
    const w = world;
    if (!w || !selected || !canAttack(w, w.player, selected, sent)) return;
    const target = selected;
    const n = sent;
    if (!play) {
      playerAttack(w, target, n);
      save();
      sent = 0;
      render();
      return;
    }
    host.playBattle(battleFor(contextOf(w, target, n)), (won) => {
      playerAttack(w, target, n, won);
      save();
      sent = 0;
      host.show();
      render();
      host.layout();
    });
  }

  $("wp-main").addEventListener("click", () => {
    if (!picking) return attack(true);
    if (!pick) return;
    world = newWorld(pick);
    picking = false;
    selected = null;
    save();
    render();
    host.layout();
  });
  $("wp-auto").addEventListener("click", () => attack(false));
  $("wp-end").addEventListener("click", () => {
    if (!world || picking) return;
    endTurn(world);
    save();
    sent = 0;
    render();
    host.layout();
  });
  $("wp-range").addEventListener("input", (e) => {
    sent = Number((e.target as HTMLInputElement).value);
    render();
  });
  $("world-plus").addEventListener("click", () => setZoom(zoom + 0.5));
  $("world-minus").addEventListener("click", () => setZoom(zoom - 0.5));

  return {
    saved: () => (world && world.status === "playing" ? world : null),
    describeSave: () => (world && world.status === "playing" ? `${formatYear(world.year)} · ${regionsOf(world, world.player).length} régions` : ""),
    open(fresh) {
      picking = fresh || !world || world.status !== "playing";
      pick = null;
      selected = null;
      setZoom(1);
      host.show();
      render();
      host.layout();
    },
    draw(ctx, base, preview) {
      const w = preview ? world : picking ? null : world;
      drawWorld(ctx, preview ? base : viewOf(base), w, {
        selected: preview ? null : picking ? pick : selected,
        attackable: !preview && !picking && w && w.status === "playing" ? targetsOf(w, w.player) : [],
        zoom: preview ? 1 : zoom,
      });
    },
    down(e) {
      grab = { x: e.clientX, y: e.clientY, moved: false };
    },
    move(e, base) {
      if (!grab) return;
      const dx = e.clientX - grab.x;
      const dy = e.clientY - grab.y;
      if (!grab.moved && Math.hypot(dx, dy) < 8) return;
      grab.moved = true;
      if (zoom > 1) {
        const k = (window.devicePixelRatio || 1) / (base.scale * zoom);
        center.x = Math.min(WORLD_SIZE.w, Math.max(0, center.x - dx * k));
        center.y = Math.min(WORLD_SIZE.h, Math.max(0, center.y - dy * k));
      }
      grab.x = e.clientX;
      grab.y = e.clientY;
    },
    up(e, base) {
      const wasDrag = grab?.moved;
      grab = null;
      if (wasDrag) return;
      const v = viewOf(base);
      const dpr = window.devicePixelRatio || 1;
      const x = (e.clientX * dpr - v.offX) / v.scale - WORLD_MARGIN;
      const y = (e.clientY * dpr - v.offY) / v.scale - WORLD_MARGIN;
      select(regionAt(x, y));
    },
    wheel(e) {
      setZoom(zoom + (e.deltaY < 0 ? 0.25 : -0.25));
    },
  };
}
