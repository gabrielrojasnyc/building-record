import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isInsideOutline } from '@/domain/outline';
import type { ComplexName, Outline } from '@/domain/types';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
/** Overpass answers 406 without both of these headers. */
const OVERPASS_HEADERS = { 'User-Agent': 'austin-building-record (names snapshot)', Accept: 'application/json' };
/** South, west, north, east: Austin and its surroundings. */
const BOUNDING_BOX = '(30.05,-98.05,30.55,-97.50)';

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 60;

export const NAMES_SNAPSHOT_PATH = fileURLToPath(new URL('./snapshots/apartment-names.json', import.meta.url));

export interface NamedPlace {
  name: string;
  lon: number;
  lat: number;
}

export interface NamesSnapshot {
  /** Austin calendar date the places were fetched, YYYY-MM-DD. */
  fetchedAt: string;
  places: NamedPlace[];
}

/**
 * Apartment buildings, and residential areas tagged as apartments. Plain `landuse=residential`
 * is left out on purpose: its names are mostly subdivisions, which are not complex names.
 */
const QUERY = `[out:json][timeout:180];
(
  way["name"]["building"="apartments"]${BOUNDING_BOX};
  relation["name"]["building"="apartments"]${BOUNDING_BOX};
  way["name"]["landuse"="residential"]["residential"="apartments"]${BOUNDING_BOX};
  relation["name"]["landuse"="residential"]["residential"="apartments"]${BOUNDING_BOX};
);
out center tags;`;

interface OverpassElement {
  center?: { lat: number; lon: number };
  tags?: { name?: string };
}

/** Six decimals is about 10 cm, finer than any name needs, and keeps the committed file small. */
const roundTo6 = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

const isPlausibleName = (name: string) =>
  name.length >= MIN_NAME_LENGTH && name.length <= MAX_NAME_LENGTH && !/^\d/.test(name);

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Named apartment features inside the Austin box, by center point, sorted by name then longitude. */
export async function fetchApartmentNames(fetchImpl: typeof fetch = fetch): Promise<NamedPlace[]> {
  const response = await fetchImpl(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { ...OVERPASS_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!response.ok) throw new Error(`Overpass answered ${response.status} ${response.statusText}`.trim());

  const { elements } = (await response.json()) as { elements: OverpassElement[] };
  const places = elements.flatMap(({ center, tags }): NamedPlace[] => {
    const name = tags?.name?.trim();
    if (!name || !center || !isPlausibleName(name)) return [];
    return [{ name, lon: roundTo6(center.lon), lat: roundTo6(center.lat) }];
  });
  return places.sort((a, b) => compareText(a.name, b.name) || a.lon - b.lon);
}

/** The committed snapshot, or null when it is missing or unreadable. The build must not fail over names. */
export async function readNamesSnapshot(path: string = NAMES_SNAPSHOT_PATH): Promise<NamesSnapshot | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<NamesSnapshot>;
    if (typeof parsed.fetchedAt !== 'string' || !Array.isArray(parsed.places)) return null;
    return { fetchedAt: parsed.fetchedAt, places: parsed.places };
  } catch {
    return null;
  }
}

const LEGAL_ENTITY_WORDS =
  /\b(llc|lp|llp|inc|ltd|trust|holdings|partners|partnership|properties|investments)\b/i;

/** True for owner-style names such as "1830 W Rundberg Db Llc", which are not what the sign says. */
export function looksLikeLegalEntity(name: string): boolean {
  return LEGAL_ENTITY_WORDS.test(name) || /^\d/.test(name.trim());
}

const DESIGNATOR = /\s*[,(-]?\s*\b(?:building|bldg|phase)\b.*$/i;

/**
 * A candidate title from a raw name: whitespace collapsed, a trailing building or phase designator
 * removed, and null when what is left is too short, starts with a digit or is the "No Name" placeholder.
 * A trailing letter or number with no designator word before it stays.
 */
export function cleanPlaceName(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, ' ').trim().replace(DESIGNATOR, '').trim();
  if (cleaned.length < MIN_NAME_LENGTH || /^\d/.test(cleaned) || /\bno name\b/i.test(cleaned)) return null;
  return cleaned;
}

/**
 * A complex's name, or null. Exactly one distinct OpenStreetMap apartment name inside the outline
 * names it; two or more different names name nothing, so a wrong one is never guessed. With none,
 * the city's Repeat Offender registration name serves unless it reads as a company. Every candidate
 * is cleaned first, so "Foo (Building 1)" and "Foo (Building 2)" are one name.
 */
export function chooseName(outline: Outline, places: NamedPlace[], repeatOffenderName: string | null): ComplexName | null {
  const namesInside = new Set(
    places.flatMap(({ name, lon, lat }) => {
      const cleaned = cleanPlaceName(name);
      return cleaned && isInsideOutline(lon, lat, outline) ? [cleaned] : [];
    }),
  );
  if (namesInside.size === 1) return { text: [...namesInside][0], source: 'openstreetmap' };
  if (namesInside.size > 1) return null;

  const cityName = repeatOffenderName ? cleanPlaceName(repeatOffenderName) : null;
  if (cityName && !looksLikeLegalEntity(cityName)) return { text: cityName, source: 'city' };
  return null;
}
