const NAIP_EXPORT = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage";
const PADDING = 1.3;
const COORDINATE_DECIMALS = 6;

const round = (degrees: number) => degrees.toFixed(COORDINATE_DECIMALS);

/** A USGS NAIP aerial image framed on the box at this pixel size, padded 30% and widened or heightened to the image's aspect. */
export function aerialPhotoUrl(bbox: [number, number, number, number], width: number, height: number): string {
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
    bbox: [centerLon - halfLon, centerLat - halfLat, centerLon + halfLon, centerLat + halfLat].map(round).join(","),
    bboxSR: "4326",
    imageSR: "3857",
    size: `${width},${height}`,
    format: "jpg",
    f: "image",
  });
  return `${NAIP_EXPORT}?${query}`;
}
