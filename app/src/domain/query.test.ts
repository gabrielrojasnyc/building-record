import { describe, expect, it } from 'vitest';
import type { Complex, Counts } from './types';
import {
  DEFAULT_VIEW,
  complexesInView,
  countFor,
  isInViewArea,
  viewFromSearchParams,
  viewToSearchParams,
  type View,
  type ViewArea,
} from './query';

const WORLD: ViewArea = [
  [-180, 90],
  [180, 90],
  [180, -90],
  [-180, -90],
];

/**
 * What a camera pitched toward the north-north-east sees: a far edge wider than the near one,
 * turned off the axes. Corners clockwise from the far left.
 */
const PITCHED: ViewArea = [
  [-97.8, 30.3],
  [-97.7, 30.32],
  [-97.72, 30.22],
  [-97.76, 30.21],
];

const counts = (overrides: Partial<Counts> = {}): Counts => ({
  structure: 0,
  property: 0,
  landuse: 0,
  permit: 0,
  ...overrides,
});

function complex(id: string, overrides: Partial<Complex> = {}): Complex {
  return {
    id,
    parcelIds: [id],
    address: `${id} Main St`,
    name: null,
    lon: -97.74,
    lat: 30.27,
    acres: 1,
    cases12: counts(),
    cases: counts(),
    open: 0,
    lastCase: null,
    repeatOffender: null,
    ...overrides,
  };
}

describe('countFor', () => {
  const c = complex('a', {
    cases12: counts({ structure: 1, property: 2, landuse: 3, permit: 4 }),
    cases: counts({ structure: 10, property: 20, landuse: 30, permit: 40 }),
  });

  it('sums all categories for "all" and one for a single category', () => {
    expect(countFor(c, DEFAULT_VIEW)).toBe(10);
    expect(countFor(c, { ...DEFAULT_VIEW, category: 'landuse' })).toBe(3);
  });

  it('reads the period the view asks for', () => {
    expect(countFor(c, { ...DEFAULT_VIEW, period: 'cases' })).toBe(100);
    expect(countFor(c, { ...DEFAULT_VIEW, period: 'cases', category: 'permit' })).toBe(40);
  });
});

describe('complexesInView ordering', () => {
  const small0 = complex('small0', { acres: 1 });
  const large0 = complex('large0', { acres: 9 });
  const one = complex('one', { acres: 20, cases12: counts({ property: 1 }) });
  const manyLarge = complex('manyLarge', { acres: 5, cases12: counts({ property: 5 }) });

  it('orders fewest first, and among equal counts puts the larger parcel first', () => {
    const ordered = complexesInView([small0, large0, one], WORLD, DEFAULT_VIEW);
    expect(ordered.map((x) => x.id)).toEqual([large0.id, small0.id, one.id]);
  });

  it('orders most first when asked, ties still largest first', () => {
    const tiedSmall = complex('tiedSmall', { acres: 2, cases12: counts({ property: 5 }) });
    const view: View = { ...DEFAULT_VIEW, order: 'most' };
    const ordered = complexesInView([small0, tiedSmall, one, manyLarge, large0], WORLD, view);
    expect(ordered.map((x) => x.id)).toEqual(['manyLarge', 'tiedSmall', 'one', 'large0', 'small0']);
  });

  it('breaks remaining ties by address, then id', () => {
    const b = complex('2', { address: 'B St' });
    const a2 = complex('3', { address: 'A St' });
    const a1 = complex('1', { address: 'A St' });
    const ordered = complexesInView([b, a2, a1], WORLD, DEFAULT_VIEW);
    expect(ordered.map((x) => x.id)).toEqual(['1', '3', '2']);
  });

  it('orders by the count of the selected category and period', () => {
    const a = complex('a', { cases12: counts({ permit: 9 }), cases: counts({ structure: 1 }) });
    const b = complex('b', { cases12: counts({ structure: 2 }), cases: counts({ structure: 5 }) });
    const view: View = { ...DEFAULT_VIEW, period: 'cases', category: 'structure' };
    expect(complexesInView([b, a], WORLD, view).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = [one, small0];
    complexesInView(input, WORLD, DEFAULT_VIEW);
    expect(input.map((x) => x.id)).toEqual(['one', 'small0']);
  });
});

describe('complexesInView filtering', () => {
  it('keeps only Repeat Offender properties when the toggle is on', () => {
    const ro = complex('ro', {
      repeatOffender: { name: 'Example Apartments', units: 100, activeViolations: 2, totalViolations: 5 },
    });
    const plain = complex('plain');
    const view: View = { ...DEFAULT_VIEW, repeatOffendersOnly: true };
    expect(complexesInView([plain, ro], WORLD, view).map((x) => x.id)).toEqual(['ro']);
  });

  it('keeps only complexes inside the area the map shows, not the box around it', () => {
    const inside = complex('inside', { lon: -97.75, lat: 30.27 });
    // Inside the axis-aligned box around PITCHED, outside the area itself.
    const besideNearEdge = complex('besideNearEdge', { lon: -97.79, lat: 30.215 });
    const farAway = complex('farAway', { lon: -97.6, lat: 30.27 });
    expect(complexesInView([besideNearEdge, inside, farAway], PITCHED, DEFAULT_VIEW).map((x) => x.id)).toEqual(['inside']);
  });
});

describe('isInViewArea', () => {
  it('tells a point inside a turned, non-rectangular area from one in its bounding box', () => {
    expect(isInViewArea(-97.75, 30.27, PITCHED)).toBe(true);
    expect(isInViewArea(-97.79, 30.215, PITCHED)).toBe(false);
    expect(isInViewArea(-97.705, 30.23, PITCHED)).toBe(false);
    expect(isInViewArea(-97.75, 30.33, PITCHED)).toBe(false);
  });

  it('counts the corners and edges as inside', () => {
    for (const [lon, lat] of PITCHED) expect(isInViewArea(lon, lat, PITCHED)).toBe(true);
    expect(isInViewArea(-97.75, 30.31, PITCHED)).toBe(true); // halfway along the far edge
    expect(isInViewArea(-97.74, 30.215, PITCHED)).toBe(true); // halfway along the near edge
  });

  it('works whichever way round the corners are listed', () => {
    const counterClockwise = [...PITCHED].reverse() as ViewArea;
    expect(isInViewArea(-97.75, 30.27, counterClockwise)).toBe(true);
    expect(isInViewArea(-97.79, 30.215, counterClockwise)).toBe(false);
  });
});

describe('search params', () => {
  it('round-trips a view through search params and ignores junk values', () => {
    expect(viewFromSearchParams(new URLSearchParams('period=nope&order=most'))).toEqual({
      ...DEFAULT_VIEW,
      order: 'most',
    });
  });

  it('round-trips every non-default field', () => {
    const view: View = { period: 'cases', category: 'permit', repeatOffendersOnly: true, order: 'most' };
    expect(viewFromSearchParams(viewToSearchParams(view))).toEqual(view);
  });

  it('omits default values, so the default view has an empty query string', () => {
    expect(viewToSearchParams(DEFAULT_VIEW).toString()).toBe('');
    expect(viewToSearchParams({ ...DEFAULT_VIEW, order: 'most' }).toString()).toBe('order=most');
  });

  it('ignores unknown names and invalid values field by field', () => {
    const params = new URLSearchParams('foo=bar&category=nope&ro=yes&period=cases');
    expect(viewFromSearchParams(params)).toEqual({ ...DEFAULT_VIEW, period: 'cases' });
  });
});
