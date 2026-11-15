/** A part of Austin the map can jump to, at its center. */
export interface Area {
  name: string;
  lon: number;
  lat: number;
}

export const AREAS: Area[] = [
  { name: "Downtown", lon: -97.7431, lat: 30.268 },
  { name: "The Domain", lon: -97.722, lat: 30.402 },
  { name: "East Riverside", lon: -97.725, lat: 30.237 },
  { name: "South Lamar", lon: -97.77, lat: 30.248 },
  { name: "Rundberg", lon: -97.703, lat: 30.362 },
  { name: "Mueller", lon: -97.705, lat: 30.298 },
];
