/** Parcel size as shown anywhere on the site. Sizes are kept to a tenth of an acre, so a sliver below that is said in words, not as 0. */
export function formatAcres(acres: number): string {
  if (acres < 0.1) return 'under 0.1 acres';
  return `${acres} ${acres === 1 ? 'acre' : 'acres'}`;
}
