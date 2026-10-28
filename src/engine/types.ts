/** 0 = neutre, 1 = joueur, 2+ = IA */
export type OwnerId = number;

export const NEUTRAL: OwnerId = 0;
export const PLAYER: OwnerId = 1;

/** Un nœud de la carte : une base capturable, ou un carrefour (`junction`) où les troupes passent. */
export interface Base {
  id: number;
  x: number;
  y: number;
  owner: OwnerId;
  troops: number;
  capacity: number;
  junction?: boolean;
}

export interface Squad {
  id: number;
  owner: OwnerId;
  count: number;
  /** nœuds restants à parcourir ; le dernier est la destination */
  path: number[];
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
  /** voisins de chaque nœud (routes) */
  links: number[][];
  squads: Squad[];
  fights: Fight[];
  time: number;
  nextSquadId: number;
  /** multiplicateur de production par camp (1 par défaut) */
  productionMul: Record<OwnerId, number>;
  /** null tant que la partie est en cours */
  winner: OwnerId | null;
}
