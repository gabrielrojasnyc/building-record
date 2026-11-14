import { isInsideOutline, outlineBbox, ringCenter } from "@/domain/outline";
import type { Outline } from "@/domain/types";

/** Each shape carries its height `h` in metres. */
export type BuildingShapes = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { h: number }>;

export const FALLBACK_HEIGHT_M = 9;

const FOOTPRINTS = "https://data.austintexas.gov/resource/3qcc-8uhz.json";
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

function outerRing(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.Position[] | undefined {
  return geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
}

/** Spaces stay `%20`, not URLSearchParams' `+`, so the clauses read back exactly as written. */
function toQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** The city's surveyed footprints (dataset 3qcc-8uhz) whose center lies inside the outline. Rejects when the city cannot be read. */
export async function loadFootprints(outline: Outline, fetchImpl: typeof fetch = fetch): Promise<BuildingShapes> {
  const [west, south, east, north] = outlineBbox(outline);
  const query = toQueryString({
    $select: "the_geom,max_height",
    $where: `within_box(the_geom, ${north}, ${west}, ${south}, ${east})`,
    $limit: String(MAX_ROWS),
  });

  const response = await fetchImpl(`${FOOTPRINTS}?${query}`);
  if (!response.ok) throw new Error(`The footprints dataset responded ${response.status}`);

  const rows = (await response.json()) as FootprintRow[];
  const features: BuildingShapes["features"] = [];
  for (const { the_geom: geometry, max_height } of rows) {
    const ring = geometry && outerRing(geometry);
    if (!geometry || !ring?.length) continue;
    const [lon, lat] = ringCenter(ring as [number, number][]);
    if (!isInsideOutline(lon, lat, outline)) continue;
    features.push({ type: "Feature", geometry, properties: { h: heightInMetres(max_height) } });
  }
  return { type: "FeatureCollection", features };
}
