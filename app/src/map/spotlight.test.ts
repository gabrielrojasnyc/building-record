import { describe, expect, it } from "vitest";
import { FALLBACK_HEIGHT_M } from "@/city/footprints";
import type { Outline } from "@/domain/types";
import {
  GROW_MS,
  SPOTLIGHT_LAYER_IDS,
  growthAt,
  shapesFromTiles,
  spotlightLayers,
} from "./spotlight";

/** A square parcel a thousandth of a degree on each side, with its corner at the origin. */
const PARCEL: Outline = [
  [
    [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ],
  ],
];

/** A small square building around (lon, lat), as a vector tile hands it back. */
function tileBuilding(
  lon: number,
  lat: number,
  properties: Record<string, unknown> | null,
) {
  const d = 0.0001;
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lon - d, lat - d],
          [lon + d, lat - d],
          [lon + d, lat + d],
          [lon - d, lat + d],
          [lon - d, lat - d],
        ],
      ],
    } satisfies GeoJSON.Polygon,
    properties,
  };
}

describe("spotlightLayers", () => {
  it("lists the four layers in drawing order with the mock paint values", () => {
    const layers = spotlightLayers();
    expect(layers.map((l) => l.id)).toEqual([...SPOTLIGHT_LAYER_IDS]);
    expect(layers[0].paint).toMatchObject({
      "fill-color": "#0B131F",
      "fill-opacity": 0.9,
    });
    expect(layers[1].paint).toMatchObject({
      "line-color": "#FFFFFF",
      "line-width": 14,
      "line-blur": 12,
      "line-opacity": 0.85,
    });
    expect(layers[2].paint).toMatchObject({
      "line-color": "#FFFFFF",
      "line-width": 2,
    });
    expect(layers[3].paint).toMatchObject({
      "fill-extrusion-color": "#F4F8FA",
      "fill-extrusion-opacity": 1,
    });
  });

  it("uses no color that depends on a case count", () => {
    expect(JSON.stringify(spotlightLayers())).not.toMatch(/"v"|interpolate/);
  });
});

describe("growthAt", () => {
  it("grows from nothing to full height and stays there", () => {
    expect(growthAt(0)).toBe(0);
    expect(growthAt(GROW_MS)).toBe(1);
    expect(growthAt(GROW_MS * 3)).toBe(1);
    expect(growthAt(GROW_MS / 2)).toBeGreaterThan(0.5);
  });
});

describe("shapesFromTiles", () => {
  it("keeps tile buildings centered inside the outline, at least the fallback height", () => {
    const tall = tileBuilding(0.0005, 0.0005, { render_height: 21 });
    const low = tileBuilding(0.0003, 0.0007, { render_height: 4 });
    const unmeasured = tileBuilding(0.0007, 0.0003, null);
    const nextDoor = tileBuilding(0.0015, 0.0005, { render_height: 30 });

    const shapes = shapesFromTiles([tall, low, unmeasured, nextDoor], PARCEL);

    expect(shapes.type).toBe("FeatureCollection");
    expect(shapes.features.map((f) => f.properties.h)).toEqual([
      21,
      FALLBACK_HEIGHT_M,
      FALLBACK_HEIGHT_M,
    ]);
    expect(shapes.features[0].geometry).toEqual(tall.geometry);
  });

  it("judges each building of a merged tile feature on its own, since tiles merge buildings of equal height", () => {
    const inside = tileBuilding(0.0005, 0.0005, null).geometry.coordinates;
    const nextDoor = tileBuilding(0.0015, 0.0005, null).geometry.coordinates;
    const merged = {
      geometry: {
        type: "MultiPolygon",
        coordinates: [nextDoor, inside],
      } satisfies GeoJSON.MultiPolygon,
      properties: { render_height: 12 },
    };

    const shapes = shapesFromTiles([merged], PARCEL);

    expect(shapes.features).toEqual([
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: inside },
        properties: { h: 12 },
      },
    ]);
  });

  it("returns no shapes when no tile building is inside", () => {
    const nextDoor = tileBuilding(0.0015, 0.0005, { render_height: 30 });
    const notABuilding = {
      geometry: {
        type: "Point",
        coordinates: [0.0005, 0.0005],
      } satisfies GeoJSON.Point,
      properties: {},
    };

    expect(shapesFromTiles([nextDoor, notABuilding], PARCEL).features).toEqual(
      [],
    );
  });
});
