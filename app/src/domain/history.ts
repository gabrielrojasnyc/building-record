/** The first day of the case history, inclusive. The city's dataset is sparse before it. */
export const HISTORY_START = '2023-11-01';
/** The month the history starts, YYYY-MM. */
export const HISTORY_START_MONTH = HISTORY_START.slice(0, 7);

/** How the start reads on screen. */
export const HISTORY_START_SHORT = 'Nov 2023';
export const HISTORY_START_LONG = 'November 2023';
export const HISTORY_START_DAY = 'November 1, 2023';

const austinCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar date in Austin, YYYY-MM-DD, which is what the pull date means, not the UTC date. */
export function austinCalendarDate(moment: Date): string {
  return austinCalendar.format(moment);
}
