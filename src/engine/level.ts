import { createState } from "./sim";
import { NEUTRAL, PLAYER } from "./types";

export const WORLD_W = 100;
export const WORLD_H = 160;
export const AI_OWNER = 2;

/** Carte fixe du prototype : joueur en bas, IA en haut, neutres au milieu. */
export function level1() {
  return createState([
    { x: 50, y: 140, owner: PLAYER, troops: 20, capacity: 60 },
    { x: 50, y: 20, owner: AI_OWNER, troops: 20, capacity: 60 },
    { x: 20, y: 110, owner: NEUTRAL, troops: 8, capacity: 30 },
    { x: 80, y: 110, owner: NEUTRAL, troops: 8, capacity: 30 },
    { x: 15, y: 80, owner: NEUTRAL, troops: 10, capacity: 35 },
    { x: 85, y: 80, owner: NEUTRAL, troops: 10, capacity: 35 },
    { x: 50, y: 80, owner: NEUTRAL, troops: 15, capacity: 45 },
    { x: 20, y: 50, owner: NEUTRAL, troops: 8, capacity: 30 },
    { x: 80, y: 50, owner: NEUTRAL, troops: 8, capacity: 30 },
  ]);
}
