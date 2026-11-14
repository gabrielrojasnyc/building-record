import type { Outline, Ring } from './types';

/** [west, south, east, north] over every ring. */
export function outlineBbox(outline: Outline): [west: number, south: number, east: number, north: number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of outline) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  return [west, south, east, north];
}

/** Ray cast to the east: odd means inside the ring. */
function ringContains(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lonI, latI] = ring[i];
    const [lonJ, latJ] = ring[j];
    const crosses = latI > lat !== latJ > lat && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Even-odd over every ring of a polygon, so a courtyard hole is outside. A merged complex holds
 * several polygons and a point inside any one of them is inside the outline.
 */
export function isInsideOutline(lon: number, lat: number, outline: Outline): boolean {
  return outline.some(
    (polygon) => polygon.reduce((inside, ring) => (ringContains(ring, lon, lat) ? !inside : inside), false),
  );
}

/** Mean of the ring's vertices, leaving out the repeated closing vertex. */
export function ringCenter(ring: Ring): [lon: number, lat: number] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = ring.length > 1 && first[0] === last[0] && first[1] === last[1];
  const vertices = closed ? ring.slice(0, -1) : ring;
  const lon = vertices.reduce((sum, [x]) => sum + x, 0) / vertices.length;
  const lat = vertices.reduce((sum, [, y]) => sum + y, 0) / vertices.length;
  return [lon, lat];
}
