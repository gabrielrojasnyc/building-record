/** Address search waits for this many characters, in the browser and before asking the city. */
export const ADDRESS_SEARCH_MIN_CHARACTERS = 3;

/** As many suggestions as the search lists: the site's own buildings first, then the city's other addresses. */
export const ADDRESS_SEARCH_MOST_SUGGESTIONS = 6;

const UPPERCASE_WORDS = new Set(['IH', 'SH', 'FM', 'RM', 'US', 'NB', 'SB', 'EB', 'WB', 'SVRD']);
const ORDINAL = /^(\d+)(ST|ND|RD|TH)$/;

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

function formatWord(word: string): string {
  if (UPPERCASE_WORDS.has(word)) return word;
  const ordinal = ORDINAL.exec(word);
  if (ordinal) return `${ordinal[1]}${ordinal[2].toLowerCase()}`;
  if (/^\d/.test(word)) return word;
  return word.split('-').map(titleCase).join('-');
}

/** City address strings are upper case. Title-case them, keeping highway and direction codes. */
export function formatAddress(raw: string): string {
  return raw.trim().split(/\s+/).map(formatWord).join(' ');
}

/** Street-type words as the city's address dataset abbreviates them. */
const STREET_TYPE_ABBREVIATIONS: Record<string, string> = {
  AVENUE: 'AVE',
  BOULEVARD: 'BLVD',
  CIRCLE: 'CIR',
  COURT: 'CT',
  COVE: 'CV',
  DRIVE: 'DR',
  HIGHWAY: 'HWY',
  LANE: 'LN',
  PARKWAY: 'PKWY',
  PLACE: 'PL',
  ROAD: 'RD',
  STREET: 'ST',
  TERRACE: 'TER',
  TRAIL: 'TRL',
  WAY: 'WAY',
};

/** Frontage-road directions that can follow the street type. */
const TRAILING_DIRECTIONS = new Set(['NB', 'SB', 'EB', 'WB']);

/**
 * A Repeat Offender registration's address in the address dataset's form: no parenthetical
 * (some list every building number), single spaces, and the street-type word abbreviated when it
 * is the last word or is followed only by a trailing direction such as NB.
 */
export function formatRegisteredAddress(raw: string): string {
  const words = raw.replace(/\([^)]*\)/g, ' ').trim().toUpperCase().split(/\s+/);
  const last = words.length - 1;
  const streetType = words.length > 1 && TRAILING_DIRECTIONS.has(words[last]) ? last - 1 : last;
  words[streetType] = STREET_TYPE_ABBREVIATIONS[words[streetType]] ?? words[streetType];
  return formatAddress(words.join(' '));
}
