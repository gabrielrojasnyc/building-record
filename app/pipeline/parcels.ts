import { readAll } from './socrata';

const LAND_USE_DATASET = '7vsm-dvxg';
const APARTMENT_LAND_USE = '220';
const SQUARE_FEET_PER_ACRE = 43_560;

export interface Parcel {
  id: string;
  polygon: GeoJSON.MultiPolygon;
  lon: number;
  lat: number;
  acres: number;
  /** [west, south, east, north] over every ring. */
  bbox: [number, number, number, number];
}

interface LandUseRow {
  parcel_id_10?: string;
  shape_area: string;
  the_geom: GeoJSON.MultiPolygon;
}

export function toAcres(squareFeet: number): number {
  return Math.round((squareFeet / SQUARE_FEET_PER_ACRE) * 10) / 10;
}

/** Shoelace area, unsigned. Planar degrees are fine for ranking rings by size. */
function ringArea(ring: GeoJSON.Position[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    twice += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(twice) / 2;
}

/** Mean of the largest outer ring's vertices, leaving out the repeated closing vertex. */
function centroid(polygons: GeoJSON.Position[][][]): [number, number] {
  const outerRings = polygons.map((polygon) => polygon[0]);
  const largest = outerRings.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best));
  const vertices = largest.slice(0, -1);
  const lon = vertices.reduce((sum, [x]) => sum + x, 0) / vertices.length;
  const lat = vertices.reduce((sum, [, y]) => sum + y, 0) / vertices.length;
  return [lon, lat];
}

function boundingBox(polygons: GeoJSON.Position[][][]): Parcel['bbox'] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        west = Math.min(west, x);
        east = Math.max(east, x);
        south = Math.min(south, y);
        north = Math.max(north, y);
      }
    }
  }
  return [west, south, east, north];
}

/** Apartment land parcels, one per parcel ID. IDs are usually 10 digits; Williamson County parcels carry R-prefixed IDs. The city lists some parcels on several rows. */
export async function loadApartmentParcels(fetchImpl: typeof fetch = fetch): Promise<Parcel[]> {
  const rows = await readAll<LandUseRow>(
    LAND_USE_DATASET,
    {
      select: 'parcel_id_10,shape_area,the_geom',
      where: `land_use = '${APARTMENT_LAND_USE}'`,
    },
    fetchImpl,
  );

  const byId = new Map<string, { polygons: GeoJSON.Position[][][]; squareFeet: number }>();
  for (const row of rows) {
    const id = row.parcel_id_10?.trim();
    if (!id) continue;
    const entry = byId.get(id) ?? { polygons: [], squareFeet: 0 };
    entry.polygons.push(...row.the_geom.coordinates);
    entry.squareFeet += Number(row.shape_area);
    byId.set(id, entry);
  }

  return [...byId].map(([id, { polygons, squareFeet }]) => {
    const [lon, lat] = centroid(polygons);
    return {
      id,
      polygon: { type: 'MultiPolygon', coordinates: polygons },
      lon,
      lat,
      acres: toAcres(squareFeet),
      bbox: boundingBox(polygons),
    };
  });
}
