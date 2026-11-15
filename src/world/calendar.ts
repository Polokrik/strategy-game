/**
 * Calendrier de la campagne Monde. La durée d'un tour dépend de la période, jamais de la partie (taille du
 * territoire, progrès du joueur). Les dates sont tenues en année astronomique pour que l'arithmétique soit
 * juste : 1 = 1 apr. J.-C., 0 = 1 av. J.-C., -2999 = 3000 av. J.-C. L'affichage, lui, n'a pas d'année zéro.
 */

export const fromBCE = (year: number): number => 1 - year;

/** Durée d'un tour, en années, jusqu'à l'année `until` exclue. PROPOSITION (rapport R1), à réviser après test. */
export const PERIODS: readonly { until: number; step: number }[] = [
  { until: fromBCE(1000), step: 50 },
  { until: 500, step: 25 },
  { until: 1500, step: 10 },
  { until: 1800, step: 5 },
  { until: 1900, step: 2 },
  { until: Infinity, step: 1 },
];

export const START_YEAR = fromBCE(3000);

const periodAt = (year: number) => PERIODS.find((p) => year < p.until)!;

/** Années que couvre le tour qui commence à `year`. */
export const stepAt = (year: number): number => nextYear(year) - year;

/** Date du tour suivant : un tour ne saute jamais par-dessus un changement de période, il s'y arrête. */
export function nextYear(year: number): number {
  const p = periodAt(year);
  return Math.min(year + p.step, p.until);
}

export function formatYear(year: number): string {
  return year <= 0 ? `${1 - year} av. J.-C.` : year < 1000 ? `${year} apr. J.-C.` : String(year);
}

/** Nombre de tours pour aller de `from` à `to`. */
export function turnsBetween(from: number, to: number): number {
  let n = 0;
  for (let y = from; y < to; y = nextYear(y)) n++;
  return n;
}
