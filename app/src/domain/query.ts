import { OUTCOMES, type Outcome } from './outcomes';
import type { Period } from './periods';
import type { Category, Complex, Tally } from './types';

export type CategoryFilter = Category | 'all';

export interface View {
  period: Period;
  category: CategoryFilter;
  repeatOffendersOnly: boolean;
  order: 'fewest' | 'most';
}

export type Corner = [lon: number, lat: number];
/** The ground the map shows inside its padding: the four screen corners unprojected, in order around the edge. */
export type ViewArea = [Corner, Corner, Corner, Corner];

export const DEFAULT_VIEW: View = {
  period: 'm12',
  category: 'all',
  repeatOffendersOnly: false,
  order: 'fewest',
};

/** How the longer periods read in the address bar. 12 months is the default, so it never appears there. */
const PERIOD_PARAMS: readonly [Period, string][] = [
  ['y2', '2y'],
  ['y3', '3y'],
];
const CATEGORIES: readonly Category[] = ['structure', 'property', 'landuse', 'permit'];
const CATEGORY_FILTERS: readonly CategoryFilter[] = ['all', ...CATEGORIES];
const ORDERS: readonly View['order'][] = ['fewest', 'most'];

const sumOf = (split: Record<Outcome, number>) => OUTCOMES.reduce((sum, outcome) => sum + split[outcome], 0);

/** Complaints in one period's tally by outcome, for one category or all of them. A category with no entry counts as none. */
function splitOf(tally: Tally | undefined, category: CategoryFilter): Record<Outcome, number> {
  const split = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<Outcome, number>;
  for (const counted of category === 'all' ? CATEGORIES : [category]) {
    for (const outcome of OUTCOMES) split[outcome] += tally?.[counted]?.[outcome] ?? 0;
  }
  return split;
}

/** Complaints in a tally, every category and outcome together. */
export function complaintTotal(tally: Tally): number {
  return sumOf(splitOf(tally, 'all'));
}

/** The view's complaints by outcome, every outcome present. A period with no entry in the tally counts as none. */
export function outcomeSplit(complex: Complex, view: View): Record<Outcome, number> {
  const tally: Tally | undefined = complex.tally[view.period];
  return splitOf(tally, view.category);
}

/** The view's complaints. Duplicates are never in a tally, so never in this count. */
export function countFor(complex: Complex, view: View): number {
  return sumOf(outcomeSplit(complex, view));
}

/** How far from an edge, as a cross product in square degrees, a point still counts as on it. */
const ON_EDGE = 1e-12;

function isOnEdge(lon: number, lat: number, [ax, ay]: Corner, [bx, by]: Corner): boolean {
  const cross = (bx - ax) * (lat - ay) - (by - ay) * (lon - ax);
  if (Math.abs(cross) > ON_EDGE) return false;
  return lon >= Math.min(ax, bx) && lon <= Math.max(ax, bx) && lat >= Math.min(ay, by) && lat <= Math.max(ay, by);
}

/** Whether a point is inside the area or on its edge. Ray casting, so any simple quadrilateral works, in either winding. */
export function isInViewArea(lon: number, lat: number, area: ViewArea): boolean {
  let inside = false;
  for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
    const [xi, yi] = area[i];
    const [xj, yj] = area[j];
    if (isOnEdge(lon, lat, area[j], area[i])) return true;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function complexesInView(all: Complex[], area: ViewArea, view: View): Complex[] {
  const direction = view.order === 'fewest' ? 1 : -1;

  return all
    .filter((complex) => isInViewArea(complex.lon, complex.lat, area))
    .filter((complex) => !view.repeatOffendersOnly || complex.repeatOffender !== null)
    .map((complex) => ({ complex, count: countFor(complex, view) }))
    .sort(
      (a, b) =>
        direction * (a.count - b.count) ||
        b.complex.acres - a.complex.acres ||
        compareText(a.complex.address, b.complex.address) ||
        compareText(a.complex.id, b.complex.id),
    )
    .map(({ complex }) => complex);
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

export function viewFromSearchParams(params: URLSearchParams): View {
  const period = PERIOD_PARAMS.find(([, value]) => value === params.get('period'))?.[0];
  return {
    period: period ?? DEFAULT_VIEW.period,
    category: pick(params.get('category'), CATEGORY_FILTERS, DEFAULT_VIEW.category),
    repeatOffendersOnly: params.get('ro') === '1',
    order: pick(params.get('order'), ORDERS, DEFAULT_VIEW.order),
  };
}

export function viewToSearchParams(view: View): URLSearchParams {
  const params = new URLSearchParams();
  const period = PERIOD_PARAMS.find(([key]) => key === view.period)?.[1];
  if (period) params.set('period', period);
  if (view.category !== DEFAULT_VIEW.category) params.set('category', view.category);
  if (view.repeatOffendersOnly) params.set('ro', '1');
  if (view.order !== DEFAULT_VIEW.order) params.set('order', view.order);
  return params;
}
