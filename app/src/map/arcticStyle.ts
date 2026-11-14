import type {
  ExpressionSpecification,
  LayerSpecification,
  SkySpecification,
  StyleSpecification,
} from "maplibre-gl";
import { countFor, type View } from "@/domain/query";
import type { Complex } from "@/domain/types";

export const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export const START_VIEW = {
  center: [-97.7431, 30.285] as [number, number],
  zoom: 11.6,
  pitch: 52,
  bearing: -12,
  minZoom: 9.5,
  maxPitch: 70,
  maxBounds: [
    [-98.35, 29.95],
    [-97.2, 30.7],
  ] as [[number, number], [number, number]],
};

export const SKY: SkySpecification = {
  "sky-color": "#DCE7ED",
  "horizon-color": "#EDF3F6",
  "fog-color": "#CBD9E0",
  "fog-ground-blend": 0.55,
  "horizon-fog-blend": 0.8,
  "sky-horizon-blend": 0.9,
  "atmosphere-blend": 0.6,
};

const PALETTE = {
  land: "#C3D3DC",
  block: "#CCDAE2",
  water: "#6F93AD",
  park: "#A9C6BE",
  road: "#E6EEF2",
  motorway: "#FFFFFF",
  casing: "#B3C6D1",
  rail: "#AEC0CB",
  label: "#2E4F68",
  city: "#0B131F",
  building: "#E1EAEF",
  mist: "#A9BDC9",
  ice: "#E8EFF3",
  slate: "#2E4F68",
  navy: "#0B131F",
  coral: "#E9A99E",
  white: "#FFFFFF",
} as const;

const HIDDEN_LAYERS =
  /shield|boundary|aeroway|airport|landcover_ice|glacier|label_country|label_state|^building$/;

type Paint = Record<string, unknown>;

function basePaint(id: string, type: LayerSpecification["type"]): Paint {
  if (type === "background") return { "background-color": PALETTE.land };

  if (type === "fill") {
    if (id === "water") return { "fill-color": PALETTE.water };
    if (id === "park" || id === "landcover_wood") {
      return { "fill-color": PALETTE.park, "fill-opacity": 0.8 };
    }
    return { "fill-color": PALETTE.block, "fill-opacity": 0.6 };
  }

  if (type === "line") {
    if (id.includes("waterway")) return { "line-color": PALETTE.water };
    if (id.includes("railway")) return { "line-color": PALETTE.rail };
    const casing = id.includes("casing");
    if (id.includes("motorway"))
      return { "line-color": casing ? PALETTE.casing : PALETTE.motorway };
    return { "line-color": casing ? PALETTE.casing : PALETTE.road };
  }

  if (type === "symbol") {
    const onWater = id.includes("water");
    const textColor = id.startsWith("label_city")
      ? PALETTE.city
      : onWater
        ? PALETTE.white
        : PALETTE.label;
    return {
      "text-color": textColor,
      "text-halo-color": onWater ? `${PALETTE.water}99` : `${PALETTE.land}D9`,
      "text-halo-width": 1.2,
    };
  }

  return {};
}

/** The base map in the Arctic palette: a new style, with the layers that add noise removed. */
export function repaint(baseStyle: StyleSpecification): StyleSpecification {
  const style = structuredClone(baseStyle);
  style.layers = style.layers
    .filter((layer) => !HIDDEN_LAYERS.test(layer.id))
    .map(
      (layer) =>
        ({
          ...layer,
          paint: { ...layer.paint, ...basePaint(layer.id, layer.type) },
        }) as LayerSpecification,
    );
  return style;
}

const caseCount: ExpressionSpecification = ["get", "v"];
const isSelected: ExpressionSpecification = [
  "boolean",
  ["feature-state", "selected"],
  false,
];
const isHovered: ExpressionSpecification = [
  "boolean",
  ["feature-state", "hover"],
  false,
];
const isRepeatOffender: ExpressionSpecification = ["==", ["get", "ro"], 1];

function radiusByZoom(scale: number): ExpressionSpecification {
  const byCount = (atZero: number, atMost: number): ExpressionSpecification => [
    "interpolate",
    ["linear"],
    caseCount,
    0,
    atZero * scale,
    80,
    atMost * scale,
  ];
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    9.5,
    byCount(1.6, 5),
    13,
    byCount(4, 13),
    16,
    byCount(7, 22),
  ];
}

/** Halo, core and count label, drawn in that order, over the `complexes` source. */
export function pinLayers(): LayerSpecification[] {
  return [
    {
      id: "halo",
      type: "circle",
      source: "complexes",
      layout: { "circle-sort-key": caseCount },
      paint: {
        "circle-radius": radiusByZoom(2.4),
        "circle-blur": 1,
        "circle-color": [
          "case",
          isRepeatOffender,
          PALETTE.coral,
          [
            "interpolate",
            ["linear"],
            caseCount,
            0,
            PALETTE.white,
            20,
            PALETTE.slate,
            80,
            PALETTE.navy,
          ],
        ],
        "circle-opacity": [
          "case",
          isSelected,
          0.95,
          isHovered,
          0.9,
          ["interpolate", ["linear"], caseCount, 0, 0.35, 20, 0.5, 80, 0.7],
        ],
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "core",
      type: "circle",
      source: "complexes",
      layout: { "circle-sort-key": caseCount },
      paint: {
        "circle-radius": radiusByZoom(1),
        "circle-color": [
          "interpolate",
          ["linear"],
          caseCount,
          0,
          PALETTE.white,
          1,
          PALETTE.ice,
          8,
          PALETTE.mist,
          25,
          PALETTE.slate,
          80,
          PALETTE.navy,
        ],
        "circle-stroke-color": [
          "case",
          isSelected,
          PALETTE.white,
          isRepeatOffender,
          PALETTE.coral,
          "rgba(255,255,255,.75)",
        ],
        "circle-stroke-width": [
          "case",
          isSelected,
          3,
          isRepeatOffender,
          2.2,
          isHovered,
          2,
          0.8,
        ],
      },
    },
    {
      id: "counts",
      type: "symbol",
      source: "complexes",
      minzoom: 13,
      filter: [">", caseCount, 0],
      layout: {
        "text-field": ["to-string", caseCount],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 13],
        "text-allow-overlap": true,
        "symbol-sort-key": caseCount,
      },
      paint: {
        "text-color": [
          "case",
          [">=", caseCount, 14],
          PALETTE.ice,
          PALETTE.navy,
        ],
      },
    },
  ];
}

export function buildingsLayer(): LayerSpecification {
  return {
    id: "buildings-3d",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: 13.5,
    paint: {
      "fill-extrusion-color": PALETTE.building,
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.5,
    },
  };
}

export function toFeatures(
  complexes: Complex[],
  view: View,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: complexes
      .filter(
        (complex) =>
          !view.repeatOffendersOnly || complex.repeatOffender !== null,
      )
      .map((complex) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [complex.lon, complex.lat] },
        properties: {
          id: complex.id,
          v: countFor(complex, view),
          ro: complex.repeatOffender ? 1 : 0,
        },
      })),
  };
}
