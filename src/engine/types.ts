/** 0 = neutre, 1 = joueur, 2+ = IA */
export type OwnerId = number;

export const NEUTRAL: OwnerId = 0;
export const PLAYER: OwnerId = 1;

export type Point = [number, number];
/** Frontière (ou traversée maritime) entre deux territoires, par id. */
export type Edge = [number, number];

/** Un territoire ; (x, y) est son centre, là où partent et arrivent les troupes. */
export interface Base {
  id: number;
  x: number;
  y: number;
  owner: OwnerId;
  troops: number;
  capacity: number;
}

export interface Squad {
  id: number;
  owner: OwnerId;
  count: number;
  /** territoire que la troupe vient de quitter */
  from: number;
  /** territoires restants à parcourir ; le dernier est la destination */
  path: number[];
  /** distance déjà parcourue sur la liaison `from` → `path[0]` */
  progress: number;
  x: number;
  y: number;
}

/** Trace d'une interception, pour l'affichage. */
export interface Fight {
  x: number;
  y: number;
  t: number;
}

export interface GameState {
  bases: Base[];
  /** voisins de chaque territoire */
  links: number[][];
  /** contour de chaque territoire, pour l'affichage (vide dans les tests) */
  shapes: Point[][];
  /** liaisons maritimes entre îles, pour l'affichage */
  seaLinks: Edge[];
  squads: Squad[];
  fights: Fight[];
  time: number;
  nextSquadId: number;
  /** multiplicateur de production par camp (1 par défaut) */
  productionMul: Record<OwnerId, number>;
  /** vitesse des troupes en marche (cavalerie des époques avancées) ; 1 par défaut */
  speedMul: Record<OwnerId, number>;
  /** null tant que la partie est en cours */
  winner: OwnerId | null;
}
