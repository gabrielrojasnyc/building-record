import type { Category, Complex } from './types';

export type Period = 'cases12' | 'cases';
export type CategoryFilter = Category | 'all';

export interface View {
  period: Period;
  category: CategoryFilter;
  repeatOffendersOnly: boolean;
  order: 'fewest' | 'most';
}

export type Bounds = [west: number, south: number, east: number, north: number];

export const DEFAULT_VIEW: View = {
  period: 'cases12',
  category: 'all',
  repeatOffendersOnly: false,
  order: 'fewest',
};

const PERIODS: readonly Period[] = ['cases12', 'cases'];
const CATEGORIES: readonly CategoryFilter[] = ['all', 'structure', 'property', 'landuse', 'permit'];
const ORDERS: readonly View['order'][] = ['fewest', 'most'];

export function countFor(complex: Complex, view: View): number {
  const counts = complex[view.period];
  if (view.category === 'all') {
    return counts.structure + counts.property + counts.landuse + counts.permit;
  }
  return counts[view.category];
}

function isInBounds(complex: Complex, [west, south, east, north]: Bounds): boolean {
  return complex.lon >= west && complex.lon <= east && complex.lat >= south && complex.lat <= north;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function complexesInView(all: Complex[], bounds: Bounds, view: View): Complex[] {
  const direction = view.order === 'fewest' ? 1 : -1;

  return all
    .filter((complex) => isInBounds(complex, bounds))
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
  return {
    period: pick(params.get('period'), PERIODS, DEFAULT_VIEW.period),
    category: pick(params.get('category'), CATEGORIES, DEFAULT_VIEW.category),
    repeatOffendersOnly: params.get('ro') === '1',
    order: pick(params.get('order'), ORDERS, DEFAULT_VIEW.order),
  };
}

export function viewToSearchParams(view: View): URLSearchParams {
  const params = new URLSearchParams();
  if (view.period !== DEFAULT_VIEW.period) params.set('period', view.period);
  if (view.category !== DEFAULT_VIEW.category) params.set('category', view.category);
  if (view.repeatOffendersOnly) params.set('ro', '1');
  if (view.order !== DEFAULT_VIEW.order) params.set('order', view.order);
  return params;
}
