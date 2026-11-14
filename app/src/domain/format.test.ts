import { describe, expect, it } from 'vitest';
import { formatAcres } from './format';

describe('formatAcres', () => {
  it('says a sliver parcel is under a tenth of an acre instead of 0 acres', () => {
    expect(formatAcres(0)).toBe('under 0.1 acres');
    expect(formatAcres(0.09)).toBe('under 0.1 acres');
  });

  it('gives the tenth of an acre the data carries', () => {
    expect(formatAcres(0.1)).toBe('0.1 acres');
    expect(formatAcres(20.5)).toBe('20.5 acres');
  });

  it('names one acre in the singular', () => {
    expect(formatAcres(1)).toBe('1 acre');
  });
});
