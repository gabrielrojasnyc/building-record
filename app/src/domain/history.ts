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
