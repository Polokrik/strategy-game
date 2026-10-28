/** 0 = neutre, 1 = joueur, 2+ = IA */
export type OwnerId = number;

export const NEUTRAL: OwnerId = 0;
export const PLAYER: OwnerId = 1;

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
  to: number;
  x: number;
  y: number;
}

export interface GameState {
  bases: Base[];
  squads: Squad[];
  time: number;
  nextSquadId: number;
  /** null tant que la partie est en cours */
  winner: OwnerId | null;
}
