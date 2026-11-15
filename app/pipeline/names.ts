import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isInsideOutline } from "@/domain/outline";
import type { ComplexName, Outline } from "@/domain/types";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
/** Overpass answers 406 without both of these headers. */
const OVERPASS_HEADERS = {
  "User-Agent": "austin-building-record (names snapshot)",
  Accept: "application/json",
};
/** South, west, north, east: Austin and its surroundings. */
const BOUNDING_BOX = "(30.05,-98.05,30.55,-97.50)";

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 60;

export const NAMES_SNAPSHOT_PATH = fileURLToPath(
  new URL("./snapshots/apartment-names.json", import.meta.url),
);

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
  name.length >= MIN_NAME_LENGTH &&
  name.length <= MAX_NAME_LENGTH &&
  !/^\d/.test(name);

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Named apartment features inside the Austin box, by center point, sorted by name then longitude. */
export async function fetchApartmentNames(
  fetchImpl: typeof fetch = fetch,
): Promise<NamedPlace[]> {
  const response = await fetchImpl(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: {
      ...OVERPASS_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!response.ok)
    throw new Error(
      `Overpass answered ${response.status} ${response.statusText}`.trim(),
    );

  const { elements } = (await response.json()) as {
    elements: OverpassElement[];
  };
  const places = elements.flatMap(({ center, tags }): NamedPlace[] => {
    const name = tags?.name?.trim();
    if (!name || !center || !isPlausibleName(name)) return [];
    return [{ name, lon: roundTo6(center.lon), lat: roundTo6(center.lat) }];
  });
  return places.sort((a, b) => compareText(a.name, b.name) || a.lon - b.lon);
}

/** The committed snapshot, or null when it is missing or unreadable. The build must not fail over names. */
export async function readNamesSnapshot(
  path: string = NAMES_SNAPSHOT_PATH,
): Promise<NamesSnapshot | null> {
  try {
    const parsed = JSON.parse(
      await readFile(path, "utf8"),
    ) as Partial<NamesSnapshot>;
    if (typeof parsed.fetchedAt !== "string" || !Array.isArray(parsed.places))
      return null;
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
  const cleaned = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(DESIGNATOR, "")
    .trim();
  if (
    cleaned.length < MIN_NAME_LENGTH ||
    /^\d/.test(cleaned) ||
    /\bno name\b/i.test(cleaned)
  )
    return null;
  return cleaned;
}

export const TITLE_REVIEW_PATH = fileURLToPath(
  new URL("./snapshots/title-review.json", import.meta.url),
);

/** What a person has checked by hand, keyed by parcel ID. Committed, so every change to it is a reviewed diff. */
export interface TitleReview {
  /** City registration names approved as titles, each exactly as the city's registration gives it. */
  cityTitles: Record<string, string>;
  /** Parcels that show no name from either source, each with one line on why. */
  withheld: Record<string, string>;
}

const isTextRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

/**
 * The committed title review. Unlike the names snapshot, a missing or malformed file stops the build:
 * it is what keeps an unchecked or withheld name off the site, so building without it would publish them.
 */
export async function readTitleReview(
  path: string = TITLE_REVIEW_PATH,
): Promise<TitleReview> {
  let parsed: Partial<Record<keyof TitleReview, unknown>>;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `The title review ${path} could not be read: ${(error as Error).message}. Refusing to write.`,
    );
  }
  for (const field of ["cityTitles", "withheld"] as const) {
    if (!isTextRecord(parsed[field])) {
      throw new Error(
        `The title review ${path} needs "${field}" as an object of parcel IDs to text. Refusing to write.`,
      );
    }
  }
  return {
    cityTitles: parsed.cityTitles as Record<string, string>,
    withheld: parsed.withheld as Record<string, string>,
  };
}

/** Words that say what kind of place it is, or join words, rather than which place. */
const WORDS_THAT_NAME_NO_PLACE = new Set([
  "the",
  "a",
  "at",
  "of",
  "on",
  "in",
  "and",
  "apartments",
  "apartment",
  "apts",
  "homes",
  "home",
  "townhomes",
  "austin",
]);

/** Short forms a sign and a registration write differently, read as the word they stand for. */
const SAME_WORD: ReadonlyMap<string, string> = new Map([["mt", "mount"]]);

/** A name's words in lower case, apostrophes and periods dropped, other punctuation splitting words. */
function placeWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "" && !WORDS_THAT_NAME_NO_PLACE.has(word))
    .map((word) => SAME_WORD.get(word) ?? word);
}

/**
 * True when every word one name has left is found in the other, so "Menlo at Mueller" agrees with "Menlo
 * Apartments", or when the two are the same once spaces are removed, so "Parkside" agrees with "Park Side".
 * A name with no word left, such as "Austin Apartments", says nothing about which place it is and agrees with none.
 */
export function namesAgree(a: string, b: string): boolean {
  const [wordsA, wordsB] = [placeWords(a), placeWords(b)];
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const within = (words: string[], other: string[]) =>
    words.every((word) => other.includes(word));
  return (
    within(wordsA, wordsB) ||
    within(wordsB, wordsA) ||
    wordsA.join("") === wordsB.join("")
  );
}

export interface NameChoice {
  name: ComplexName | null;
  /** A city registration name that would be the title once a person approves it in the title review. */
  awaitingReview: string | null;
}

const NO_NAME: NameChoice = { name: null, awaitingReview: null };

/**
 * A complex's name, or none. Exactly one distinct OpenStreetMap apartment name inside the outline names
 * it, unless the city's registration names the place something else: two sources that disagree name
 * nothing, so a wrong one is never guessed. With no OpenStreetMap name, the registration name serves
 * only when a person approved that exact name for one of the complex's parcels, and never when it reads
 * as a company. A withheld parcel shows no name at all. Every candidate is cleaned first, so
 * "Foo (Building 1)" and "Foo (Building 2)" are one name.
 */
export function chooseName(
  complex: {
    outline: Outline;
    parcelIds: string[];
    registeredName: string | null;
  },
  places: NamedPlace[],
  review: TitleReview,
): NameChoice {
  const { outline, parcelIds, registeredName } = complex;
  if (parcelIds.some((id) => Object.hasOwn(review.withheld, id)))
    return NO_NAME;

  const namesInside = new Set(
    places.flatMap(({ name, lon, lat }) => {
      const cleaned = cleanPlaceName(name);
      return cleaned && isInsideOutline(lon, lat, outline) ? [cleaned] : [];
    }),
  );
  if (namesInside.size > 1) return NO_NAME;

  const cleanedCityName = registeredName
    ? cleanPlaceName(registeredName)
    : null;
  const cityName =
    cleanedCityName && !looksLikeLegalEntity(cleanedCityName)
      ? cleanedCityName
      : null;

  if (namesInside.size === 1) {
    const [openStreetMapName] = namesInside;
    if (cityName && !namesAgree(openStreetMapName, cityName)) return NO_NAME;
    return {
      name: { text: openStreetMapName, source: "openstreetmap" },
      awaitingReview: null,
    };
  }

  if (!cityName || !registeredName) return NO_NAME;
  const approved = parcelIds.some(
    (id) =>
      Object.hasOwn(review.cityTitles, id) &&
      review.cityTitles[id] === registeredName,
  );
  return approved
    ? { name: { text: cityName, source: "city" }, awaitingReview: null }
    : { name: null, awaitingReview: registeredName };
}
