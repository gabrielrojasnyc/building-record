import { isInsideOutline, outlineBbox, ringCenter } from "@/domain/outline";
import type { Outline } from "@/domain/types";

/** Each shape carries its height `h` in metres. */
export type BuildingShapes = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { h: number }
>;

export const FALLBACK_HEIGHT_M = 9;

const FOOTPRINTS = "https://data.austintexas.gov/resource/3qcc-8uhz.json";
/** Past this the map stops waiting for the city and stands up the buildings in its own tiles instead. */
const GIVE_UP_AFTER_MS = 4_000;
const MAX_ROWS = 3000;
const FEET_TO_METRES = 0.3048;
const MIN_PLAUSIBLE_FEET = 6;
const MAX_PLAUSIBLE_FEET = 600;

interface FootprintRow {
  the_geom?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  max_height?: string;
}

/** The city stores feet as text and marks unknown heights with `-9999999999`; anything implausible gets the fallback. */
export function heightInMetres(maxHeightFeet: unknown): number {
  const feet = Number(maxHeightFeet);
  const plausible = feet > MIN_PLAUSIBLE_FEET && feet < MAX_PLAUSIBLE_FEET;
  return plausible ? feet * FEET_TO_METRES : FALLBACK_HEIGHT_M;
}

function outerRing(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): GeoJSON.Position[] | undefined {
  return geometry.type === "Polygon"
    ? geometry.coordinates[0]
    : geometry.coordinates[0]?.[0];
}

/** Spaces stay `%20`, not URLSearchParams' `+`, so the clauses read back exactly as written. */
function toQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

/**
 * The city's surveyed footprints (dataset 3qcc-8uhz) whose center lies inside the outline. Rejects when the city
 * cannot be read, and when it has not answered in full within 4 seconds, so a slow city never holds up the fallback.
 */
export async function loadFootprints(
  outline: Outline,
  fetchImpl: typeof fetch = fetch,
): Promise<BuildingShapes> {
  const request = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      request.abort();
      reject(
        new Error(
          `The footprints dataset did not answer within ${GIVE_UP_AFTER_MS / 1000} seconds`,
        ),
      );
    }, GIVE_UP_AFTER_MS);
  });
  try {
    return await Promise.race([
      readFootprints(outline, fetchImpl, request.signal),
      gaveUp,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readFootprints(
  outline: Outline,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<BuildingShapes> {
  const [west, south, east, north] = outlineBbox(outline);
  const query = toQueryString({
    $select: "the_geom,max_height",
    $where: `within_box(the_geom, ${north}, ${west}, ${south}, ${east})`,
    $limit: String(MAX_ROWS),
  });

  const response = await fetchImpl(`${FOOTPRINTS}?${query}`, { signal });
  if (!response.ok)
    throw new Error(`The footprints dataset responded ${response.status}`);

  const rows = (await response.json()) as FootprintRow[];
  const features: BuildingShapes["features"] = [];
  for (const { the_geom: geometry, max_height } of rows) {
    const ring = geometry && outerRing(geometry);
    if (!geometry || !ring?.length) continue;
    const [lon, lat] = ringCenter(ring as [number, number][]);
    if (!isInsideOutline(lon, lat, outline)) continue;
    features.push({
      type: "Feature",
      geometry,
      properties: { h: heightInMetres(max_height) },
    });
  }
  return { type: "FeatureCollection", features };
}
