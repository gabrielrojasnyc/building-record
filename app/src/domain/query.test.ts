import { describe, expect, it } from 'vitest';
import type { Complex, Tally } from './types';
import {
  DEFAULT_VIEW,
  complexesInView,
  countFor,
  isInViewArea,
  outcomeSplit,
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

const NO_OUTCOMES = { violation: 0, fixed: 0, none: 0, other: 0, open: 0 };

function complex(id: string, overrides: Partial<Complex> = {}): Complex {
  return {
    id,
    parcelIds: [id],
    address: `${id} Main St`,
    name: null,
    lon: -97.74,
    lat: 30.27,
    acres: 1,
    open: 0,
    tally: { m12: {}, y2: {}, y3: {} },
    duplicates: { m12: 0, y2: 0, y3: 0 },
    violationsOpen: 0,
    repeatOffender: null,
    ...overrides,
  };
}

/** A complex with `count` complaints in the last 12 months, all of one category and outcome. */
const withComplaints = (id: string, count: number, overrides: Partial<Complex> = {}) =>
  complex(id, { tally: { m12: { property: { none: count } }, y2: {}, y3: {} }, ...overrides });

describe('countFor and outcomeSplit', () => {
  const m12: Tally = { structure: { violation: 1, none: 2 }, property: { fixed: 3 } };
  const y2: Tally = { structure: { violation: 4, none: 5 }, property: { fixed: 6 }, permit: { open: 1 } };
  const y3: Tally = {
    structure: { violation: 10, none: 20, other: 1 },
    property: { fixed: 6 },
    landuse: { other: 2 },
    permit: { open: 1 },
  };
  const c = complex('a', { tally: { m12, y2, y3 }, duplicates: { m12: 50, y2: 60, y3: 70 } });

  it('counts every complaint in the period, all categories together, and never a duplicate', () => {
    expect(countFor(c, DEFAULT_VIEW)).toBe(6);
    expect(countFor(c, { ...DEFAULT_VIEW, period: 'y2' })).toBe(16);
    expect(countFor(c, { ...DEFAULT_VIEW, period: 'y3' })).toBe(40);
  });

  it('counts one category alone when the view asks for it, in each period', () => {
    expect(countFor(c, { ...DEFAULT_VIEW, category: 'structure' })).toBe(3);
    expect(countFor(c, { ...DEFAULT_VIEW, period: 'y2', category: 'structure' })).toBe(9);
    expect(countFor(c, { ...DEFAULT_VIEW, period: 'y3', category: 'landuse' })).toBe(2);
    expect(countFor(c, { ...DEFAULT_VIEW, period: 'y3', category: 'permit' })).toBe(1);
  });

  it('splits the same complaints by outcome, with every outcome present', () => {
    expect(outcomeSplit(c, DEFAULT_VIEW)).toEqual({ ...NO_OUTCOMES, violation: 1, none: 2, fixed: 3 });
    expect(outcomeSplit(c, { ...DEFAULT_VIEW, period: 'y2' })).toEqual({
      ...NO_OUTCOMES,
      violation: 4,
      none: 5,
      fixed: 6,
      open: 1,
    });
    expect(outcomeSplit(c, { ...DEFAULT_VIEW, period: 'y3' })).toEqual({
      violation: 10,
      fixed: 6,
      none: 20,
      other: 3,
      open: 1,
    });
  });

  it('splits one category alone when the view asks for it', () => {
    expect(outcomeSplit(c, { ...DEFAULT_VIEW, period: 'y3', category: 'structure' })).toEqual({
      ...NO_OUTCOMES,
      violation: 10,
      none: 20,
      other: 1,
    });
    expect(outcomeSplit(c, { ...DEFAULT_VIEW, period: 'y2', category: 'permit' })).toEqual({ ...NO_OUTCOMES, open: 1 });
  });

  it('is zero, never undefined or NaN, for a category the tally has no entry for', () => {
    expect(countFor(c, { ...DEFAULT_VIEW, category: 'landuse' })).toBe(0);
    expect(outcomeSplit(c, { ...DEFAULT_VIEW, category: 'landuse' })).toEqual(NO_OUTCOMES);
  });

  it('is zero for a complex with an empty tally, or with no entry at all for the period', () => {
    const empty = complex('empty');
    const missing = complex('missing', { tally: { m12: {} } as Complex['tally'] });
    for (const view of [DEFAULT_VIEW, { ...DEFAULT_VIEW, period: 'y3' as const, category: 'permit' as const }]) {
      expect(countFor(empty, view)).toBe(0);
      expect(outcomeSplit(empty, view)).toEqual(NO_OUTCOMES);
    }
    expect(countFor(missing, { ...DEFAULT_VIEW, period: 'y2' })).toBe(0);
    expect(outcomeSplit(missing, { ...DEFAULT_VIEW, period: 'y3' })).toEqual(NO_OUTCOMES);
  });
});

describe('complexesInView ordering', () => {
  const small0 = complex('small0', { acres: 1 });
  const large0 = complex('large0', { acres: 9 });
  const one = withComplaints('one', 1, { acres: 20 });
  const manyLarge = withComplaints('manyLarge', 5, { acres: 5 });

  it('orders fewest first, and among equal counts puts the larger parcel first', () => {
    const ordered = complexesInView([small0, large0, one], WORLD, DEFAULT_VIEW);
    expect(ordered.map((x) => x.id)).toEqual([large0.id, small0.id, one.id]);
  });

  it('orders most first when asked, ties still largest first', () => {
    const tiedSmall = withComplaints('tiedSmall', 5, { acres: 2 });
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
    const a = complex('a', { tally: { m12: { permit: { none: 9 } }, y2: {}, y3: { structure: { none: 1 } } } });
    const b = complex('b', { tally: { m12: { structure: { none: 2 } }, y2: {}, y3: { structure: { violation: 5 } } } });
    const view: View = { ...DEFAULT_VIEW, period: 'y3', category: 'structure' };
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
  it('defaults to the last 12 months', () => {
    expect(DEFAULT_VIEW.period).toBe('m12');
    expect(viewFromSearchParams(new URLSearchParams('')).period).toBe('m12');
  });

  it('reads 2y and 3y as the 2 and 3 year periods, and writes them back the same way', () => {
    expect(viewFromSearchParams(new URLSearchParams('period=2y')).period).toBe('y2');
    expect(viewFromSearchParams(new URLSearchParams('period=3y')).period).toBe('y3');
    expect(viewToSearchParams({ ...DEFAULT_VIEW, period: 'y2' }).toString()).toBe('period=2y');
    expect(viewToSearchParams({ ...DEFAULT_VIEW, period: 'y3' }).toString()).toBe('period=3y');
  });

  it('falls back to 12 months for junk, for the names the code uses inside, and for the retired cases', () => {
    for (const value of ['nope', 'y2', 'm12', 'cases12', 'cases', '']) {
      expect(viewFromSearchParams(new URLSearchParams({ period: value })).period, value).toBe('m12');
    }
  });

  it('drops the retired period=cases from the query string once the view is written back', () => {
    const view = viewFromSearchParams(new URLSearchParams('period=cases&order=most'));
    expect(viewToSearchParams(view).toString()).toBe('order=most');
  });

  it('ignores junk values field by field', () => {
    expect(viewFromSearchParams(new URLSearchParams('period=nope&order=most'))).toEqual({
      ...DEFAULT_VIEW,
      order: 'most',
    });
  });

  it('round-trips every non-default field', () => {
    for (const period of ['y2', 'y3'] as const) {
      const view: View = { period, category: 'permit', repeatOffendersOnly: true, order: 'most' };
      expect(viewFromSearchParams(viewToSearchParams(view))).toEqual(view);
    }
  });

  it('omits default values, so the default view has an empty query string', () => {
    expect(viewToSearchParams(DEFAULT_VIEW).toString()).toBe('');
    expect(viewToSearchParams({ ...DEFAULT_VIEW, order: 'most' }).toString()).toBe('order=most');
  });

  it('ignores unknown names and invalid values field by field', () => {
    const params = new URLSearchParams('foo=bar&category=nope&ro=yes&period=3y');
    expect(viewFromSearchParams(params)).toEqual({ ...DEFAULT_VIEW, period: 'y3' });
  });
});
