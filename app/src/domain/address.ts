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
