import { describe, expect, it } from 'vitest';
import { austinCalendarDate } from './history';

describe('austinCalendarDate', () => {
  it('gives the date in Austin, which trails UTC in the evening', () => {
    expect(austinCalendarDate(new Date('2026-11-15T03:30:00Z'))).toBe('2026-11-14');
    expect(austinCalendarDate(new Date('2026-11-14T15:00:00Z'))).toBe('2026-11-14');
  });
});
