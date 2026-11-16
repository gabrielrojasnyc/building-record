import {
  ADDRESS_SEARCH_MIN_CHARACTERS,
  ADDRESS_SEARCH_MOST_SUGGESTIONS,
  formatAddress,
} from "@/domain/address";
import type { Complex } from "@/domain/types";

export interface AddressMatch {
  /** The address, which stays the unique label even when the complex has a name. */
  label: string;
  /** The complex's name, shown first when it has one. Null for an unnamed complex and for any other address. */
  name: string | null;
  lon: number;
  lat: number;
  complexId: string | null;
}

export interface AddressSearchResult {
  matches: AddressMatch[];
  /** True when the city was asked for other addresses and could not answer. */
  cityUnavailable: boolean;
}

const ADDRESS_ENDPOINT = "https://data.austintexas.gov/resource/9s7j-tygf.json";
const PRIMARY_ADDRESS_TYPE = "1";

interface AddressRow {
  full_street_name?: string;
  the_geom?: { coordinates?: [number, number] };
}

/**
 * Makes text safe inside a SoQL `like '...'` literal: quotes double, and the escape character
 * and the wildcards `%` and `_` take a backslash so they match themselves. The city's SoQL
 * honors that backslash, checked against the live dataset on 2026-11-14.
 */
export function escapeSoql(text: string): string {
  return text.replace(/'/g, "''").replace(/[\\%_]/g, "\\$&");
}

/** How well a complex matches the text, best first: its name or address starts with it, its words are started by the text's words, it holds the text, or it does but for one slip. */
const RANKS = ["starts", "words", "contains", "slip"] as const;
type Rank = (typeof RANKS)[number];

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Only a word of letters this long is forgiven a slip. A number never is: one digit off is another address. */
const SHORTEST_FORGIVEN = 4;

/** True when the two differ by at most one slip: a letter wrong, missing or extra, or two neighbors swapped. */
function withinOneSlip(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at++;
  if (a.length === b.length) {
    if (a.slice(at + 1) === b.slice(at + 1)) return true;
    return (
      a[at] === b[at + 1] &&
      a[at + 1] === b[at] &&
      a.slice(at + 2) === b.slice(at + 2)
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(at) === long.slice(at + 1);
}

/** True when `typed` is how `word` starts, give or take one slip. */
function nearlyStarts(word: string, typed: string): boolean {
  if (typed.length < SHORTEST_FORGIVEN || /\d/.test(typed)) return false;
  return [typed.length - 1, typed.length, typed.length + 1].some(
    (length) =>
      length <= word.length && withinOneSlip(typed, word.slice(0, length)),
  );
}

/**
 * How a complex matches the text. A name or address that starts with it or holds it is matched as before,
 * by the first of the two that does. Otherwise every word of the text must start a word of the name or the
 * address, in any order, so "palms avalon" and "northgate 9001" find their building; and failing that,
 * with one slip forgiven in a word.
 */
function matchOf(
  complex: Complex,
  needle: string,
): { rank: Rank; matched: string } | null {
  const texts = complex.name
    ? [complex.name.text, complex.address]
    : [complex.address];
  const starting = texts.find((text) => text.toLowerCase().startsWith(needle));
  if (starting) return { rank: "starts", matched: starting };

  const typed = wordsOf(needle);
  const words = texts.flatMap(wordsOf);
  const [title] = texts;
  const started = (part: string) => words.some((word) => word.startsWith(part));
  if (typed.length > 0 && typed.every(started))
    return { rank: "words", matched: title };

  const containing = texts.find((text) => text.toLowerCase().includes(needle));
  if (containing) return { rank: "contains", matched: containing };

  const nearly = (part: string) =>
    started(part) || words.some((word) => nearlyStarts(word, part));
  return typed.length > 0 && typed.every(nearly)
    ? { rank: "slip", matched: title }
    : null;
}

/**
 * Names and addresses rank by one rule: the better match first, and equal matches alphabetical by the text
 * that matched.
 */
function matchComplexes(text: string, complexes: Complex[]): AddressMatch[] {
  const needle = text.toLowerCase();
  const found = complexes.flatMap((complex) => {
    const match = matchOf(complex, needle);
    return match ? [{ complex, ...match }] : [];
  });
  // A slip is only forgiven when nothing matches the text as typed. Beside a real match it would be noise.
  const asTyped = found.filter(({ rank }) => rank !== "slip");
  return (asTyped.length > 0 ? asTyped : found)
    .sort(
      (a, b) =>
        RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) ||
        a.matched.localeCompare(b.matched),
    )
    .map(({ complex: { id, address, name, lon, lat } }) => ({
      label: address,
      name: name?.text ?? null,
      lon,
      lat,
      complexId: id,
    }));
}

async function matchCity(text: string, limit: number, fetchImpl: typeof fetch): Promise<AddressMatch[]> {
  const query = new URLSearchParams({
    $select: "full_street_name,the_geom",
    $where: `address_type='${PRIMARY_ADDRESS_TYPE}' AND upper(full_street_name) like upper('${escapeSoql(text)}%')`,
    $order: "full_street_name",
    $limit: String(limit),
  });
  const response = await fetchImpl(`${ADDRESS_ENDPOINT}?${query}`);
  if (!response.ok) throw new Error(`City address search failed with ${response.status}`);

  const rows: AddressRow[] = await response.json();
  return rows.flatMap(({ full_street_name, the_geom }) => {
    const point = the_geom?.coordinates;
    if (!full_street_name || !point) return [];
    return [{ label: formatAddress(full_street_name), name: null, lon: point[0], lat: point[1], complexId: null }];
  });
}

/** Matching complexes alone, with no wait: they are already in the browser. At most 6. */
export function searchComplexes(text: string, complexes: Complex[]): AddressMatch[] {
  const trimmed = text.trim();
  if (trimmed.length < ADDRESS_SEARCH_MIN_CHARACTERS) return [];
  return matchComplexes(trimmed, complexes).slice(0, ADDRESS_SEARCH_MOST_SUGGESTIONS);
}

/** Complexes first (matched locally), then other city addresses (dataset 9s7j-tygf). At most 6. Never rejects. */
export async function searchAddresses(
  text: string,
  complexes: Complex[],
  fetchImpl: typeof fetch = fetch,
): Promise<AddressSearchResult> {
  const trimmed = text.trim();
  if (trimmed.length < ADDRESS_SEARCH_MIN_CHARACTERS) return { matches: [], cityUnavailable: false };

  const fromComplexes = matchComplexes(trimmed, complexes).slice(0, ADDRESS_SEARCH_MOST_SUGGESTIONS);
  const cityRoom = ADDRESS_SEARCH_MOST_SUGGESTIONS - fromComplexes.length;
  if (cityRoom === 0) return { matches: fromComplexes, cityUnavailable: false };

  try {
    const listed = new Set(fromComplexes.map((match) => match.label));
    const fromCity = await matchCity(trimmed, ADDRESS_SEARCH_MOST_SUGGESTIONS, fetchImpl);
    const matches = [...fromComplexes, ...fromCity.filter((match) => !listed.has(match.label))].slice(0, ADDRESS_SEARCH_MOST_SUGGESTIONS);
    return { matches, cityUnavailable: false };
  } catch {
    return { matches: fromComplexes, cityUnavailable: true };
  }
}
