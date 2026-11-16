/** A part of Austin the map can jump to: its center, and how close the map stands over it. */
export interface Area {
  name: string;
  lon: number;
  lat: number;
  /** Close enough that the area's buildings read as standing. */
  zoom: number;
}

/**
 * Buildings are drawn from zoom 13.5 and are specks until about a step closer. Downtown's towers stand from
 * this far off, which is also where the site opens. Two and three storey blocks need the map closer.
 */
const OVER_TOWERS = 14.8;
const OVER_LOW_BUILDINGS = 15.3;

export const AREAS: Area[] = [
  { name: "Downtown", lon: -97.7431, lat: 30.268, zoom: OVER_TOWERS },
  { name: "The Domain", lon: -97.722, lat: 30.402, zoom: OVER_LOW_BUILDINGS },
  {
    name: "East Riverside",
    lon: -97.725,
    lat: 30.237,
    zoom: OVER_LOW_BUILDINGS,
  },
  { name: "South Lamar", lon: -97.77, lat: 30.248, zoom: OVER_LOW_BUILDINGS },
  { name: "Rundberg", lon: -97.703, lat: 30.362, zoom: OVER_LOW_BUILDINGS },
  { name: "Mueller", lon: -97.705, lat: 30.298, zoom: OVER_LOW_BUILDINGS },
];

/** Where the site opens: downtown, as close as a jump to it lands. */
export const OPENING_ZOOM = OVER_TOWERS;
