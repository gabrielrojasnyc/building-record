import { formatAddress } from "@/domain/address";
import type { Parcel } from "./parcels";
import { readAll } from "./socrata";

const ADDRESS_DATASET = "9s7j-tygf";
const PRIMARY_ADDRESS_TYPE = "1";
const FALLBACK_RADIUS_METRES = 150;
const GRID_CELL_DEGREES = 0.002;
const METRES_PER_DEGREE_LAT = 111_195;

/** How a parcel's label was chosen. `registered` is a Repeat Offender registration, applied by the caller. */
export type LabelSource = "inside" | "nearby" | "none" | "registered";

export interface ResolvedLabel {
  label: string;
  source: Exclude<LabelSource, "registered">;
}

export interface AddressPoint {
  label: string;
  /** House number. NaN when the city's number is not purely digits. */
  number: number;
  lon: number;
  lat: number;
}

interface AddressRow {
  full_street_name?: string;
  address?: string;
  the_geom?: GeoJSON.Point;
}

export async function loadAddressPoints(
  fetchImpl: typeof fetch = fetch,
): Promise<AddressPoint[]> {
  const rows = await readAll<AddressRow>(
    ADDRESS_DATASET,
    {
      select: "full_street_name,address,the_geom",
      where: `address_type = '${PRIMARY_ADDRESS_TYPE}'`,
    },
    fetchImpl,
  );

  const points: AddressPoint[] = [];
  for (const { full_street_name, address, the_geom } of rows) {
    if (!full_street_name || !the_geom) continue;
    const [lon, lat] = the_geom.coordinates;
    const isNumeric = address !== undefined && /^\d+$/.test(address);
    points.push({
      label: full_street_name,
      number: isNumeric ? Number(address) : Number.NaN,
      lon,
      lat,
    });
  }
  return points;
}

/** Ray casting with the even-odd rule, so a ring inside the first one is a hole. */
function inPolygon(
  lon: number,
  lat: number,
  rings: GeoJSON.Position[][],
): boolean {
  let crossings = 0;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (
        yi > lat !== yj > lat &&
        lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
      )
        crossings++;
    }
  }
  return crossings % 2 === 1;
}

function inParcel(parcel: Parcel, point: AddressPoint): boolean {
  const [west, south, east, north] = parcel.bbox;
  if (
    point.lon < west ||
    point.lon > east ||
    point.lat < south ||
    point.lat > north
  )
    return false;
  return parcel.polygon.coordinates.some((rings) =>
    inPolygon(point.lon, point.lat, rings),
  );
}

/** Equirectangular distance in metres. Accurate to well under a metre at city scale. */
export function metresBetween(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
): number {
  const metresPerDegreeLon =
    METRES_PER_DEGREE_LAT * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(
    (a.lon - b.lon) * metresPerDegreeLon,
    (a.lat - b.lat) * METRES_PER_DEGREE_LAT,
  );
}

/** A label whose text after the house number starts with a fraction, such as `310 1/2 COMAL ST`. */
const isFractional = (point: AddressPoint) =>
  /^\S+\s+\d+\/\d+(\s|$)/.test(point.label);

/**
 * Whole addresses before fractional ones, then the lower house number. Ties on number break by
 * label so the answer does not depend on the order points arrive in.
 */
const isLowerNumbered = (a: AddressPoint, b: AddressPoint) =>
  isFractional(a) !== isFractional(b)
    ? !isFractional(a)
    : a.number < b.number || (a.number === b.number && a.label < b.label);

/**
 * The address point inside the polygon with the lowest street number, a whole address before a
 * fractional one. When none is inside, the
 * parcel ID with the nearest point within 150 m of the centroid, since that address may be a
 * neighbor's. Otherwise the parcel ID alone. Labels that carry the ID are unique by construction.
 */
export function chooseAddress(
  parcel: Parcel,
  points: AddressPoint[],
): ResolvedLabel {
  const numbered = points.filter((point) => Number.isFinite(point.number));

  const inside = numbered.filter((point) => inParcel(parcel, point));
  if (inside.length > 0) {
    const lowest = inside.reduce((best, point) =>
      isLowerNumbered(point, best) ? point : best,
    );
    return { label: formatAddress(lowest.label), source: "inside" };
  }

  let nearest: AddressPoint | null = null;
  let nearestMetres = FALLBACK_RADIUS_METRES;
  for (const point of numbered) {
    const metres = metresBetween(parcel, point);
    const isCloser =
      !nearest || metres < nearestMetres || point.label < nearest.label;
    if (metres <= nearestMetres && isCloser) {
      nearest = point;
      nearestMetres = metres;
    }
  }
  if (!nearest) return { label: `Parcel ${parcel.id}`, source: "none" };
  return {
    label: `Parcel ${parcel.id}, near ${formatAddress(nearest.label)}`,
    source: "nearby",
  };
}

const cellOf = (degrees: number) => Math.floor(degrees / GRID_CELL_DEGREES);

/**
 * Indexes points in a 0.002 degree grid and returns a function that names a parcel from only
 * the points near it. Gives the same answer as chooseAddress over the full list, in a fraction
 * of the time: build once with all points, then call per parcel.
 */
export function buildAddressResolver(
  points: AddressPoint[],
): (parcel: Parcel) => ResolvedLabel {
  const grid = new Map<string, AddressPoint[]>();
  for (const point of points) {
    const key = `${cellOf(point.lon)},${cellOf(point.lat)}`;
    const cell = grid.get(key);
    if (cell) cell.push(point);
    else grid.set(key, [point]);
  }

  return (parcel) => {
    const [west, south, east, north] = parcel.bbox;
    const marginLat = FALLBACK_RADIUS_METRES / METRES_PER_DEGREE_LAT;
    const marginLon = marginLat / Math.cos(parcel.lat * (Math.PI / 180));

    const nearby: AddressPoint[] = [];
    for (let x = cellOf(west - marginLon); x <= cellOf(east + marginLon); x++) {
      for (
        let y = cellOf(south - marginLat);
        y <= cellOf(north + marginLat);
        y++
      ) {
        const cell = grid.get(`${x},${y}`);
        if (cell) nearby.push(...cell);
      }
    }
    return chooseAddress(parcel, nearby);
  };
}
