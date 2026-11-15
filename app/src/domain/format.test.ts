import { describe, expect, it } from 'vitest';
import { formatAcres, formatCount, formatDate } from './format';

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

describe('formatCount', () => {
  it('separates thousands, the same way everywhere a count is shown', () => {
    expect(formatCount(7)).toBe('7');
    expect(formatCount(1234)).toBe('1,234');
  });
});

describe('formatDate', () => {
  it('keeps the calendar day the data gives, whatever the time zone', () => {
    const day = { month: 'short', day: 'numeric', year: 'numeric' } as const;
    expect(formatDate('2026-11-07', day)).toBe('Nov 7, 2026');
    expect(formatDate('2023-11-14', { ...day, month: 'long' })).toBe('November 14, 2023');
    expect(formatDate('2025-09', { month: 'short', year: 'numeric' })).toBe('Sep 2025');
  });
});
