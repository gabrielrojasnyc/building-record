import { ADDRESS_SEARCH_MIN_CHARACTERS, formatAddress } from "@/domain/address";
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
const MAX_SUGGESTIONS = 6;

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

/** How a complex matches the text: by the first of its name and address to start with it, else to contain it. */
function matchOf(complex: Complex, needle: string): { starts: boolean; matched: string } | null {
  const texts = complex.name ? [complex.name.text, complex.address] : [complex.address];
  const starting = texts.find((text) => text.toLowerCase().startsWith(needle));
  if (starting) return { starts: true, matched: starting };
  const containing = texts.find((text) => text.toLowerCase().includes(needle));
  return containing ? { starts: false, matched: containing } : null;
}

/** Names and addresses rank by one rule: those that start with the text first, then those that contain it, each alphabetical by the text that matched. */
function matchComplexes(text: string, complexes: Complex[]): AddressMatch[] {
  const needle = text.toLowerCase();
  return complexes
    .flatMap((complex) => {
      const match = matchOf(complex, needle);
      return match ? [{ complex, ...match }] : [];
    })
    .sort((a, b) => {
      if (a.starts !== b.starts) return a.starts ? -1 : 1;
      return a.matched.localeCompare(b.matched);
    })
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

/** Matching complexes alone, for a device with no map to fly to an address. At most 6. */
export function searchComplexes(text: string, complexes: Complex[]): AddressMatch[] {
  const trimmed = text.trim();
  if (trimmed.length < ADDRESS_SEARCH_MIN_CHARACTERS) return [];
  return matchComplexes(trimmed, complexes).slice(0, MAX_SUGGESTIONS);
}

/** Complexes first (matched locally), then other city addresses (dataset 9s7j-tygf). At most 6. Never rejects. */
export async function searchAddresses(
  text: string,
  complexes: Complex[],
  fetchImpl: typeof fetch = fetch,
): Promise<AddressSearchResult> {
  const trimmed = text.trim();
  if (trimmed.length < ADDRESS_SEARCH_MIN_CHARACTERS) return { matches: [], cityUnavailable: false };

  const fromComplexes = matchComplexes(trimmed, complexes).slice(0, MAX_SUGGESTIONS);
  const cityRoom = MAX_SUGGESTIONS - fromComplexes.length;
  if (cityRoom === 0) return { matches: fromComplexes, cityUnavailable: false };

  try {
    const listed = new Set(fromComplexes.map((match) => match.label));
    const fromCity = await matchCity(trimmed, MAX_SUGGESTIONS, fetchImpl);
    const matches = [...fromComplexes, ...fromCity.filter((match) => !listed.has(match.label))].slice(0, MAX_SUGGESTIONS);
    return { matches, cityUnavailable: false };
  } catch {
    return { matches: fromComplexes, cityUnavailable: true };
  }
}
