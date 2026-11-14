import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW } from "@/domain/query";
import type { Complex, Counts } from "@/domain/types";
import { buildingsLayer, pinLayers, repaint, toFeatures } from "./arcticStyle";
import positron from "./fixtures/positron.json";

const base = positron as unknown as StyleSpecification;

const counts = (overrides: Partial<Counts> = {}): Counts => ({
  structure: 0,
  property: 0,
  landuse: 0,
  permit: 0,
  ...overrides,
});

const burton: Complex = {
  id: "0123456789",
  address: "1 Burton Dr",
  lon: -97.72,
  lat: 30.23,
  acres: 5,
  cases12: counts({ structure: 100, property: 50 }),
  cases: counts({ structure: 200, property: 84 }),
  open: 3,
  lastCase: "2026-10-01",
  repeatOffender: {
    name: "Burton Holdings",
    units: 300,
    activeViolations: 9,
    totalViolations: 90,
  },
  units: null,
};

const clean: Complex = {
  ...burton,
  id: "0000000001",
  address: "2 Quiet Ln",
  cases12: counts(),
  cases: counts(),
  repeatOffender: null,
};

function layerOf(style: StyleSpecification, id: string): LayerSpecification {
  const layer = style.layers.find((candidate) => candidate.id === id);
  if (!layer) throw new Error(`fixture has no layer ${id}`);
  return layer;
}

function paintOf(
  style: StyleSpecification,
  id: string,
): Record<string, unknown> {
  return (layerOf(style, id).paint ?? {}) as Record<string, unknown>;
}

describe("repaint", () => {
  it("paints water, parks and land in the Arctic palette", () => {
    const style = repaint(base);
    expect(paintOf(style, "water")["fill-color"]).toBe("#6F93AD");
    expect(paintOf(style, "park")["fill-color"]).toBe("#A9C6BE");
    expect(paintOf(style, "park")["fill-opacity"]).toBe(0.8);
    expect(paintOf(style, "background")["background-color"]).toBe("#C3D3DC");
    expect(paintOf(style, "landuse_residential")["fill-color"]).toBe("#CCDAE2");
    expect(paintOf(style, "landuse_residential")["fill-opacity"]).toBe(0.6);
  });

  it("paints roads, casings and rail from the road palette", () => {
    const style = repaint(base);
    expect(paintOf(style, "highway_minor")["line-color"]).toBe("#E6EEF2");
    expect(paintOf(style, "highway_major_casing")["line-color"]).toBe(
      "#B3C6D1",
    );
    expect(paintOf(style, "highway_motorway_inner")["line-color"]).toBe(
      "#FFFFFF",
    );
    expect(paintOf(style, "highway_motorway_casing")["line-color"]).toBe(
      "#B3C6D1",
    );
    expect(paintOf(style, "railway")["line-color"]).toBe("#AEC0CB");
    expect(paintOf(style, "waterway")["line-color"]).toBe("#6F93AD");
  });

  it("paints labels in slate, city labels in navy, and water labels white with a water halo", () => {
    const style = repaint(base);
    expect(paintOf(style, "highway-name-minor")["text-color"]).toBe("#2E4F68");
    expect(paintOf(style, "highway-name-minor")["text-halo-color"]).toBe(
      "#C3D3DCD9",
    );
    expect(paintOf(style, "label_city")["text-color"]).toBe("#0B131F");
    expect(paintOf(style, "water_name_point_label")["text-color"]).toBe(
      "#FFFFFF",
    );
    expect(paintOf(style, "water_name_point_label")["text-halo-color"]).toBe(
      "#6F93AD99",
    );
    expect(paintOf(style, "water_name_point_label")["text-halo-width"]).toBe(
      1.2,
    );
  });

  it("removes shields, boundaries, airports, glaciers, country and state labels and the flat building layer", () => {
    const ids = repaint(base).layers.map((layer) => layer.id);
    expect(
      ids.some((id) =>
        /shield|boundary|aeroway|airport|ice|glacier|label_country|label_state|^building$/.test(
          id,
        ),
      ),
    ).toBe(false);
    expect(ids).toContain("water");
    expect(ids).toContain("label_city");
  });

  it("does not mutate the style it was given", () => {
    const snapshot = structuredClone(base);
    const result = repaint(base);
    expect(base).toEqual(snapshot);
    expect(result).not.toBe(base);
    expect(result.layers).not.toBe(base.layers);
  });
});

describe("toFeatures", () => {
  it("emits one feature per complex with the count for the current view", () => {
    const { features } = toFeatures([burton], {
      ...DEFAULT_VIEW,
      period: "cases",
    });
    expect(features).toHaveLength(1);
    expect(features[0].properties).toEqual({ id: burton.id, v: 284, ro: 1 });
    expect(features[0].geometry).toEqual({
      type: "Point",
      coordinates: [burton.lon, burton.lat],
    });
  });

  it("follows the period and category of the view and marks non-offenders ro 0", () => {
    const recent = toFeatures([burton, clean], DEFAULT_VIEW).features;
    expect(recent.map((feature) => feature.properties)).toEqual([
      { id: burton.id, v: 150, ro: 1 },
      { id: clean.id, v: 0, ro: 0 },
    ]);
    const structureOnly = toFeatures([burton], {
      ...DEFAULT_VIEW,
      category: "structure",
    });
    expect(structureOnly.features[0].properties?.v).toBe(100);
  });

  it("leaves out complexes that are not repeat offenders when the view asks for offenders only", () => {
    const { features } = toFeatures([burton, clean], {
      ...DEFAULT_VIEW,
      repeatOffendersOnly: true,
    });
    expect(features.map((feature) => feature.properties?.id)).toEqual([
      burton.id,
    ]);
  });
});

describe("pinLayers", () => {
  it("returns pin layers in halo, core, counts order, all on the complexes source", () => {
    const layers = pinLayers();
    expect(layers.map((layer) => layer.id)).toEqual(["halo", "core", "counts"]);
    for (const layer of layers)
      expect("source" in layer && layer.source).toBe("complexes");
  });

  it("draws halo and core as circles and the count as a symbol that starts at zoom 13", () => {
    const [halo, core, counts] = pinLayers();
    expect(halo.type).toBe("circle");
    expect(core.type).toBe("circle");
    expect(counts.type).toBe("symbol");
    expect(counts.minzoom).toBe(13);
    expect("filter" in counts && counts.filter).toEqual([">", ["get", "v"], 0]);
  });

  it("colors the core by count and the repeat offender halo coral", () => {
    const [halo, core] = pinLayers();
    expect((core.paint as Record<string, unknown>)["circle-color"]).toEqual([
      "interpolate",
      ["linear"],
      ["get", "v"],
      0,
      "#FFFFFF",
      1,
      "#E8EFF3",
      8,
      "#A9BDC9",
      25,
      "#2E4F68",
      80,
      "#0B131F",
    ]);
    expect((halo.paint as Record<string, unknown>)["circle-color"]).toEqual([
      "case",
      ["==", ["get", "ro"], 1],
      "#E9A99E",
      [
        "interpolate",
        ["linear"],
        ["get", "v"],
        0,
        "#FFFFFF",
        20,
        "#2E4F68",
        80,
        "#0B131F",
      ],
    ]);
  });

  it("makes the halo 2.4 times the core radius with full blur", () => {
    const [halo, core] = pinLayers();
    const haloPaint = halo.paint as Record<string, unknown>;
    expect(haloPaint["circle-blur"]).toBe(1);
    expect(haloPaint["circle-radius"]).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      9.5,
      ["interpolate", ["linear"], ["get", "v"], 0, 1.6 * 2.4, 80, 5 * 2.4],
      13,
      ["interpolate", ["linear"], ["get", "v"], 0, 4 * 2.4, 80, 13 * 2.4],
      16,
      ["interpolate", ["linear"], ["get", "v"], 0, 7 * 2.4, 80, 22 * 2.4],
    ]);
    expect((core.paint as Record<string, unknown>)["circle-radius"]).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      9.5,
      ["interpolate", ["linear"], ["get", "v"], 0, 1.6, 80, 5],
      13,
      ["interpolate", ["linear"], ["get", "v"], 0, 4, 80, 13],
      16,
      ["interpolate", ["linear"], ["get", "v"], 0, 7, 80, 22],
    ]);
  });

  it("strokes selected white 3, repeat offender coral 2.2, hovered 2, default faint white 0.8", () => {
    const core = pinLayers()[1].paint as Record<string, unknown>;
    const selected = ["boolean", ["feature-state", "selected"], false];
    const hover = ["boolean", ["feature-state", "hover"], false];
    expect(core["circle-stroke-width"]).toEqual([
      "case",
      selected,
      3,
      ["==", ["get", "ro"], 1],
      2.2,
      hover,
      2,
      0.8,
    ]);
    expect(core["circle-stroke-color"]).toEqual([
      "case",
      selected,
      "#FFFFFF",
      ["==", ["get", "ro"], 1],
      "#E9A99E",
      "rgba(255,255,255,.75)",
    ]);
  });

  it("lifts halo opacity for selected and hovered pins", () => {
    const halo = pinLayers()[0].paint as Record<string, unknown>;
    expect(halo["circle-opacity"]).toEqual([
      "case",
      ["boolean", ["feature-state", "selected"], false],
      0.95,
      ["boolean", ["feature-state", "hover"], false],
      0.9,
      ["interpolate", ["linear"], ["get", "v"], 0, 0.35, 20, 0.5, 80, 0.7],
    ]);
  });

  it("writes count text light from 14 cases and dark below", () => {
    const counts = pinLayers()[2].paint as Record<string, unknown>;
    expect(counts["text-color"]).toEqual([
      "case",
      [">=", ["get", "v"], 14],
      "#E8EFF3",
      "#0B131F",
    ]);
  });
});

describe("buildingsLayer", () => {
  it("extrudes buildings from zoom 13.5 in pale ice at half opacity", () => {
    const layer = buildingsLayer();
    expect(layer.id).toBe("buildings-3d");
    expect(layer.type).toBe("fill-extrusion");
    expect(layer.minzoom).toBe(13.5);
    expect("source" in layer && layer.source).toBe("openmaptiles");
    const paint = layer.paint as Record<string, unknown>;
    expect(paint["fill-extrusion-color"]).toBe("#E1EAEF");
    expect(paint["fill-extrusion-opacity"]).toBe(0.5);
  });
});
