/** Address search waits for this many characters, in the browser and before asking the city. */
export const ADDRESS_SEARCH_MIN_CHARACTERS = 3;

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

/**
 * A Repeat Offender registration's address in the address dataset's form: no parenthetical
 * (some list every building number), single spaces, and a trailing street-type word abbreviated.
 */
export function formatRegisteredAddress(raw: string): string {
  const words = raw.replace(/\([^)]*\)/g, ' ').trim().toUpperCase().split(/\s+/);
  const last = words.length - 1;
  words[last] = STREET_TYPE_ABBREVIATIONS[words[last]] ?? words[last];
  return formatAddress(words.join(' '));
}
