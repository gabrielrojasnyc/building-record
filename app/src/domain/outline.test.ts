import { describe, expect, it } from 'vitest';
import { isInsideOutline, outlineBbox, ringCenter } from './outline';
import type { Outline, Ring } from './types';

const square = (west: number, south: number, size: number): Ring => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
  [west, south],
];

/** A 0.01 degree block with a 0.002 degree courtyard cut out of the middle. */
const withCourtyard: Outline = [[square(-97.75, 30.3, 0.01), square(-97.746, 30.304, 0.002)]];
const secondPolygon: Outline[number] = [square(-97.7, 30.3, 0.01)];

describe('isInsideOutline', () => {
  it('finds a point inside a polygon and outside its courtyard hole', () => {
    expect(isInsideOutline(-97.7485, 30.3015, withCourtyard)).toBe(true);
    expect(isInsideOutline(-97.745, 30.305, withCourtyard)).toBe(false);
    expect(isInsideOutline(-97.76, 30.305, withCourtyard)).toBe(false);
  });

  it('treats a merged complex as inside when the point is in any member polygon', () => {
    const merged: Outline = [...withCourtyard, secondPolygon];
    expect(isInsideOutline(-97.7485, 30.3015, merged)).toBe(true);
    expect(isInsideOutline(-97.695, 30.305, merged)).toBe(true);
    expect(isInsideOutline(-97.72, 30.305, merged)).toBe(false);
  });
});

describe('outlineBbox', () => {
  it('gives the bounding box over every ring', () => {
    const box = outlineBbox([...withCourtyard, secondPolygon]);
    [-97.75, 30.3, -97.69, 30.31].forEach((expected, i) => expect(box[i]).toBeCloseTo(expected, 9));
  });
});

describe('ringCenter', () => {
  it('is the mean of the vertices, not counting the closing vertex twice', () => {
    const [lon, lat] = ringCenter(square(10, 20, 2));
    expect(lon).toBeCloseTo(11);
    expect(lat).toBeCloseTo(21);
  });
});
