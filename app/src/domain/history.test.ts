import { describe, expect, it } from 'vitest';
import { HISTORY_START, HISTORY_START_DAY, HISTORY_START_LONG, austinCalendarDate } from './history';

describe('the history start', () => {
  it('is November 1, 2023, in every form the site shows it', () => {
    const start = new Date(`${HISTORY_START}T12:00:00Z`);
    const reads = (options: Intl.DateTimeFormatOptions) => start.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });

    expect(HISTORY_START).toBe('2023-11-01');
    expect(HISTORY_START_LONG).toBe(reads({ month: 'long', year: 'numeric' }));
    expect(HISTORY_START_DAY).toBe(reads({ month: 'long', day: 'numeric', year: 'numeric' }));
  });
});

describe('austinCalendarDate', () => {
  it('gives the date in Austin, which trails UTC in the evening', () => {
    expect(austinCalendarDate(new Date('2026-11-15T03:30:00Z'))).toBe('2026-11-14');
    expect(austinCalendarDate(new Date('2026-11-14T15:00:00Z'))).toBe('2026-11-14');
  });
});
