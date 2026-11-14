import { formatAddress } from "@/domain/address";
import type { Complex } from "@/domain/types";

export interface AddressMatch {
  label: string;
  lon: number;
  lat: number;
  complexId: string | null;
}

const ADDRESS_ENDPOINT = "https://data.austintexas.gov/resource/9s7j-tygf.json";
const PRIMARY_ADDRESS_TYPE = "1";
const MIN_CHARACTERS = 3;
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

function matchComplexes(text: string, complexes: Complex[]): AddressMatch[] {
  const needle = text.toLowerCase();
  return complexes
    .filter((complex) => complex.address.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aStarts = a.address.toLowerCase().startsWith(needle);
      const bStarts = b.address.toLowerCase().startsWith(needle);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.address.localeCompare(b.address);
    })
    .map(({ id, address, lon, lat }) => ({ label: address, lon, lat, complexId: id }));
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
    return [{ label: formatAddress(full_street_name), lon: point[0], lat: point[1], complexId: null }];
  });
}

/** Matching complexes alone, for a device with no map to fly to an address. At most 6. */
export function searchComplexes(text: string, complexes: Complex[]): AddressMatch[] {
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHARACTERS) return [];
  return matchComplexes(trimmed, complexes).slice(0, MAX_SUGGESTIONS);
}

/** Complexes first (matched locally), then other city addresses (dataset 9s7j-tygf). At most 6. Never rejects. */
export async function searchAddresses(
  text: string,
  complexes: Complex[],
  fetchImpl: typeof fetch = fetch,
): Promise<AddressMatch[]> {
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHARACTERS) return [];

  const fromComplexes = matchComplexes(trimmed, complexes).slice(0, MAX_SUGGESTIONS);
  const cityRoom = MAX_SUGGESTIONS - fromComplexes.length;
  if (cityRoom === 0) return fromComplexes;

  try {
    const listed = new Set(fromComplexes.map((match) => match.label));
    const fromCity = await matchCity(trimmed, MAX_SUGGESTIONS, fetchImpl);
    return [...fromComplexes, ...fromCity.filter((match) => !listed.has(match.label))].slice(0, MAX_SUGGESTIONS);
  } catch {
    return fromComplexes;
  }
}
