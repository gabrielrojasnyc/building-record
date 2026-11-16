/**
 * The City of Austin's aerial photos flown in early 2025, at 6 inches to the pixel: four times the detail of the
 * USGS photos used before, and sharp enough to tell one building from the next. Checked on 2026-11-16 at the
 * map's four edges, in Williamson County and on a random handful of complexes; every one had imagery.
 */
const CITY_AERIALS_2025 =
  "https://maps.austintexas.gov/image/rest/services/AerialMosaics/Aerials2025/ImageServer/exportImage";
const PADDING = 1.3;
const COORDINATE_DECIMALS = 6;

const round = (degrees: number) => degrees.toFixed(COORDINATE_DECIMALS);

/** The city's aerial photo framed on the box at this pixel size, padded 30% and widened or heightened to the image's aspect. */
export function aerialPhotoUrl(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): string {
  const [west, south, east, north] = bbox;
  const centerLon = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const lonToLat = Math.cos((centerLat * Math.PI) / 180);

  // Work in latitude-equivalent degrees so a degree of width and of height cover the same ground.
  let spanX = (east - west) * lonToLat * PADDING;
  let spanY = (north - south) * PADDING;
  const aspect = width / height;
  if (spanX / spanY < aspect) spanX = spanY * aspect;
  else spanY = spanX / aspect;

  const halfLon = spanX / lonToLat / 2;
  const halfLat = spanY / 2;
  const query = new URLSearchParams({
    bbox: [
      centerLon - halfLon,
      centerLat - halfLat,
      centerLon + halfLon,
      centerLat + halfLat,
    ]
      .map(round)
      .join(","),
    bboxSR: "4326",
    imageSR: "3857",
    size: `${width},${height}`,
    format: "jpg",
    f: "image",
  });
  return `${CITY_AERIALS_2025}?${query}`;
}
