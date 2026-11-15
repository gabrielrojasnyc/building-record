/** Parcel size as shown anywhere on the site. Sizes are kept to a tenth of an acre, so a sliver below that is said in words, not as 0. */
export function formatAcres(acres: number): string {
  if (acres < 0.1) return 'under 0.1 acres';
  return `${acres} ${acres === 1 ? 'acre' : 'acres'}`;
}

/** A count as shown anywhere on the site, with a thousands separator: 1,234. */
export function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

/** A calendar date from the data, YYYY-MM-DD or YYYY-MM, formatted in UTC so no time zone can shift the day. */
export function formatDate(isoDate: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day = 1] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    ...options,
    timeZone: 'UTC',
  });
}
