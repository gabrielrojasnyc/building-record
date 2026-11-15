/** The day the city's case data becomes dense, which is why no period reaches back further than 3 years. */
export const HISTORY_START = '2023-11-01';

/** How that day reads on screen. */
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
