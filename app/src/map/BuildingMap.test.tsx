import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFootprints, type BuildingShapes } from "@/city/footprints";
import { DEFAULT_VIEW } from "@/domain/query";
import type { Outline } from "@/domain/types";
import { BuildingMap, type BuildingMapProps } from "./BuildingMap";
import { GROW_MS, type SpotlightTarget } from "./spotlight";

type Handler = (event: Record<string, unknown>) => void;

/** A stand-in for MapLibre's Map: it records what the component asks of it and fires events on demand. */
const { FakeMap, FakeMarker, maps } = vi.hoisted(() => {
  const maps: InstanceType<typeof FakeMap>[] = [];
  class FakeMap {
    private readonly handlers = new Map<string, Handler[]>();
    readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    /** Where the camera is; `getCenter` and the like read it. */
    camera = {
      lng: -97.7431,
      lat: 30.285,
      zoom: 11.6,
      pitch: 52,
      bearing: -12,
    };
    readonly remove = vi.fn();
    readonly setPadding = vi.fn();
    readonly addControl = vi.fn();
    readonly setSky = vi.fn();
    readonly addLayer = vi.fn();
    readonly addSource = vi.fn((id: string) => {
      this.sources.set(id, { setData: vi.fn() });
    });
    readonly getSource = vi.fn((id: string) => this.sources.get(id));
    readonly setFeatureState = vi.fn();
    readonly setLayoutProperty = vi.fn();
    readonly setPaintProperty = vi.fn();
    readonly querySourceFeatures = vi.fn((): unknown[] => []);
    /** Always fits the box at zoom 17. */
    readonly cameraForBounds = vi.fn(() => ({ zoom: 17 }));
    readonly flyTo = vi.fn();
    readonly jumpTo = vi.fn();
    readonly easeTo = vi.fn();
    readonly rotateTo = vi.fn();
    readonly stop = vi.fn();
    /** Whether every tile the base map wants is in; `isSourceLoaded` reads it. */
    tilesLoaded = true;
    readonly isSourceLoaded = vi.fn(() => this.tilesLoaded);
    constructor() {
      maps.push(this);
    }
    /** A 1000 by 800 container whose screen pixels unproject to thousandths of a degree. */
    getContainer() {
      return { clientWidth: 1000, clientHeight: 800 };
    }
    unproject([x, y]: [number, number]) {
      return { lng: x / 1000, lat: y / 1000 };
    }
    getCanvas() {
      return { style: {} };
    }
    getCenter() {
      return { lng: this.camera.lng, lat: this.camera.lat };
    }
    getZoom() {
      return this.camera.zoom;
    }
    getPitch() {
      return this.camera.pitch;
    }
    getBearing() {
      return this.camera.bearing;
    }
    on(event: string, layerOrHandler: string | Handler, handler?: Handler) {
      // Layer events (mousemove on the pins and the like) are not exercised here.
      if (typeof layerOrHandler === "function" && handler === undefined) {
        this.handlers.set(event, [
          ...(this.handlers.get(event) ?? []),
          layerOrHandler,
        ]);
      }
      return this;
    }
    off(event: string, handler: Handler) {
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((known) => known !== handler),
      );
      return this;
    }
    /** Fires the event, carrying `data` the way MapLibre carries a movement's event data. */
    fire(event: string, data: Record<string, unknown> = {}) {
      for (const handler of this.handlers.get(event) ?? [])
        handler({ type: event, ...data });
    }
    /** Ends the last movement the camera method started, as the real map does when it arrives. */
    arrive(method: "flyTo" | "jumpTo" | "easeTo" | "rotateTo") {
      const call = this[method].mock.calls.at(-1);
      const eventData = method === "rotateTo" ? call?.[2] : call?.[1];
      this.fire("moveend", eventData ?? {});
    }
  }

  /** A marker that puts its element in the page while it is on the map. */
  class FakeMarker {
    constructor(
      readonly options: {
        element: HTMLElement;
        anchor?: string;
        offset?: [number, number];
      },
    ) {}
    setLngLat() {
      return this;
    }
    addTo() {
      document.body.append(this.options.element);
      return this;
    }
    remove() {
      this.options.element.remove();
      return this;
    }
  }
  return { FakeMap, FakeMarker, maps };
});

vi.mock("maplibre-gl", () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: class {},
  Popup: class {},
  GeoJSONSource: class {},
  setWorkerUrl: vi.fn(),
}));

vi.mock("@/city/footprints", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/city/footprints")>()),
  loadFootprints: vi.fn(),
}));

const PADDING = { top: 80, right: 0, bottom: 243, left: 0 };
const EMPTY_STYLE = { version: 8, sources: {}, layers: [] };

let styleSignal: AbortSignal | undefined;

/** The base style request: answered with an empty style, or left hanging until it is aborted. */
function stubStyle(answer: "never" | "now") {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      styleSignal = init?.signal ?? undefined;
      if (answer === "now") return Promise.resolve(Response.json(EMPTY_STYLE));
      return new Promise<Response>((_resolve, reject) => {
        styleSignal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    }),
  );
}

function renderMap(spotlight: SpotlightTarget | null = null) {
  const props: BuildingMapProps = {
    complexes: [],
    view: DEFAULT_VIEW,
    selectedId: null,
    hoveredId: null,
    flyTo: null,
    padding: PADDING,
    spotlight,
    onViewAreaChange: vi.fn(),
    onSelect: vi.fn(),
    onHover: vi.fn(),
    onUnavailable: vi.fn(),
  };
  const rendered = render(<BuildingMap {...props} />);
  const spotlightOn = (target: SpotlightTarget | null) =>
    rendered.rerender(<BuildingMap {...props} spotlight={target} />);
  return { props, spotlightOn, ...rendered };
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

let reducedMotion = false;

beforeEach(() => {
  vi.useFakeTimers();
  maps.length = 0;
  styleSignal = undefined;
  reducedMotion = false;
  vi.mocked(loadFootprints).mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as RenderingContext,
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BuildingMap when the map cannot start", () => {
  it("gives up on a base style that takes more than 10 seconds, and says the map is unavailable", async () => {
    stubStyle("never");
    const { props } = renderMap();

    await wait(9_999);
    expect(props.onUnavailable).not.toHaveBeenCalled();
    await wait(1);
    expect(styleSignal?.aborted).toBe(true);
    expect(props.onUnavailable).toHaveBeenCalledOnce();
    expect(maps).toHaveLength(0);
  });

  it("aborts the style request when it goes away, without calling the map unavailable", async () => {
    stubStyle("never");
    const { props, unmount } = renderMap();
    await wait(100);

    unmount();
    await wait(10_000);
    expect(styleSignal?.aborted).toBe(true);
    expect(props.onUnavailable).not.toHaveBeenCalled();
  });

  it("removes a map that has not loaded 20 seconds after it was built, and says the map is unavailable", async () => {
    stubStyle("now");
    const { props } = renderMap();
    await wait(0);
    expect(maps).toHaveLength(1);

    await wait(19_999);
    expect(props.onUnavailable).not.toHaveBeenCalled();
    await wait(1);
    expect(maps[0].remove).toHaveBeenCalledOnce();
    expect(props.onUnavailable).toHaveBeenCalledOnce();
  });
});

describe("BuildingMap once loaded", () => {
  it("reports the padded viewport's four corners on the ground, clockwise from the top left", async () => {
    stubStyle("now");
    const { props } = renderMap();
    await wait(0);
    await act(async () => maps[0].fire("load"));

    // Inset by the padding: 80 px from the top, 243 px from the bottom of an 800 px container.
    expect(props.onViewAreaChange).toHaveBeenLastCalledWith([
      [0, 0.08],
      [1, 0.08],
      [1, 0.557],
      [0, 0.557],
    ]);

    vi.mocked(props.onViewAreaChange).mockClear();
    await act(async () => maps[0].fire("moveend"));
    expect(props.onViewAreaChange).toHaveBeenCalledOnce();

    await wait(20_000);
    expect(props.onUnavailable).not.toHaveBeenCalled();
    expect(maps[0].remove).not.toHaveBeenCalled();
  });
});

/** A square about 20 m across, centered on (lon, lat). */
function square(lon: number, lat: number, half = 0.0001): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon - half, lat - half],
        [lon + half, lat - half],
        [lon + half, lat + half],
        [lon - half, lat + half],
        [lon - half, lat - half],
      ],
    ],
  };
}

function parcel(west: number, south: number): Outline {
  const [east, north] = [west + 0.001, south + 0.001];
  return [
    [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  ];
}

const ARRAY: SpotlightTarget = {
  id: "0307050309",
  title: "Array Apartments",
  lon: -97.7005,
  lat: 30.3005,
  outline: parcel(-97.701, 30.3),
};
const ELSEWHERE: SpotlightTarget = {
  id: "0304070701",
  title: "4800 Elsewhere Dr",
  lon: -97.7495,
  lat: 30.2505,
  outline: parcel(-97.75, 30.25),
};
const NO_SHAPES: BuildingShapes = { type: "FeatureCollection", features: [] };

function shapesOn(target: SpotlightTarget, h: number): BuildingShapes {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { h },
        geometry: square(target.lon, target.lat),
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("BuildingMap spotlight", () => {
  async function loadedMap(spotlight: SpotlightTarget | null = null) {
    stubStyle("now");
    const rendered = renderMap(spotlight);
    await wait(0);
    await act(async () => maps[0].fire("load"));
    return { ...rendered, map: maps[0] };
  }

  const PIN_AND_CITY_LAYERS = ["halo", "core", "counts", "buildings-3d"];
  const labels = () =>
    [...document.querySelectorAll(".spotlight-label")].map(
      (label) => label.textContent,
    );
  const spotlightAttribute = (container: HTMLElement) =>
    container.firstElementChild?.getAttribute("data-spotlight") ?? null;
  const dataSent = (map: InstanceType<typeof FakeMap>, source: string) =>
    map.sources.get(source)?.setData.mock.calls.map(([data]) => data) ?? [];
  /** Every shape set the map was asked to draw, leaving out the clearing of the source. */
  const shapesDrawn = (map: InstanceType<typeof FakeMap>) =>
    dataSent(map, "spot-shapes")
      .map((data: BuildingShapes) => data.features)
      .filter((features) => features.length > 0);
  const heightsPainted = (map: InstanceType<typeof FakeMap>) =>
    map.setPaintProperty.mock.calls
      .filter(
        ([layer, name]) =>
          layer === "spot-buildings" && name === "fill-extrusion-height",
      )
      .map(([, , value]) => value);
  const partway = (height: unknown) =>
    Array.isArray(height) && height[0] === "*";

  it("adds its layers once the map loads, beneath the city's buildings and the pins", async () => {
    const { map } = await loadedMap();

    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "spot-base" }),
      "buildings-3d",
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "spot-glow" }),
      "buildings-3d",
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "spot-outline" }),
      "buildings-3d",
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "spot-buildings" }),
      "halo",
    );
  });

  it("entering hides the pins and the city's buildings, draws the parcel, names it and flies in close", async () => {
    vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
    const { map, container, spotlightOn } = await loadedMap();
    expect(spotlightAttribute(container)).toBeNull();

    spotlightOn(ARRAY);

    for (const layer of PIN_AND_CITY_LAYERS) {
      expect(map.setLayoutProperty).toHaveBeenCalledWith(
        layer,
        "visibility",
        "none",
      );
    }
    expect(dataSent(map, "spot-parcel").at(-1)).toEqual({
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: ARRAY.outline },
    });
    expect(labels()).toEqual(["Array Apartments"]);
    expect(spotlightAttribute(container)).toBe(ARRAY.id);
    expect(loadFootprints).toHaveBeenCalledWith(ARRAY.outline);

    // The map's own padding frames the box, so the fit asks for none of its own.
    expect(map.cameraForBounds).toHaveBeenCalledWith(
      [
        [-97.701, 30.3],
        [expect.closeTo(-97.7), expect.closeTo(30.301)],
      ],
      { bearing: -12, maxZoom: 17.6 },
    );
    expect(map.flyTo).toHaveBeenCalledWith(
      {
        center: [expect.closeTo(-97.7005), expect.closeTo(30.3005)],
        zoom: 16.75,
        pitch: 60,
        speed: 0.9,
        curve: 1.3,
      },
      expect.anything(),
    );
  });

  it("applies a spotlight that arrives before the map has loaded once it has", async () => {
    vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
    stubStyle("now");
    const { container } = renderMap(ARRAY);
    await wait(0);
    expect(labels()).toEqual([]);
    expect(spotlightAttribute(container)).toBeNull();

    await act(async () => maps[0].fire("load"));

    expect(labels()).toEqual(["Array Apartments"]);
    expect(spotlightAttribute(container)).toBe(ARRAY.id);
    expect(maps[0].flyTo).toHaveBeenCalledOnce();
  });

  it("falls back to the tile buildings once the camera has arrived and their tiles are in, when the city cannot be read, and grows them to full height", async () => {
    vi.mocked(loadFootprints).mockRejectedValue(
      new Error("The footprints dataset responded 503"),
    );
    const { map, spotlightOn } = await loadedMap();
    map.querySourceFeatures.mockReturnValue([
      {
        geometry: square(ARRAY.lon, ARRAY.lat),
        properties: { render_height: 15 },
      },
      { geometry: square(-97.69, 30.3), properties: { render_height: 15 } },
    ]);

    spotlightOn(ARRAY);
    await wait(0);
    // On the way in, the tiles hold the city it is leaving, not the complex.
    expect(map.querySourceFeatures).not.toHaveBeenCalled();

    map.tilesLoaded = false;
    map.arrive("flyTo");
    expect(map.querySourceFeatures).not.toHaveBeenCalled();

    map.tilesLoaded = true;
    map.fire("sourcedata");
    expect(map.querySourceFeatures).toHaveBeenCalledOnce();
    expect(map.querySourceFeatures).toHaveBeenCalledWith("openmaptiles", {
      sourceLayer: "building",
    });
    expect(shapesDrawn(map)).toEqual([
      [expect.objectContaining({ properties: { h: 15 } })],
    ]);

    await wait(GROW_MS / 2);
    expect(heightsPainted(map).at(-1)).toEqual([
      "*",
      ["get", "h"],
      expect.any(Number),
    ]);
    await wait(GROW_MS);
    expect(heightsPainted(map).at(-1)).toEqual(["get", "h"]);
  });

  it("leaves the base alone, without an error, when there are no shapes anywhere", async () => {
    vi.mocked(loadFootprints).mockResolvedValue(NO_SHAPES);
    const { map, spotlightOn } = await loadedMap();

    spotlightOn(ARRAY);
    await wait(0);
    map.arrive("flyTo");
    map.fire("sourcedata");
    await wait(GROW_MS);

    expect(map.querySourceFeatures).toHaveBeenCalledOnce();
    expect(shapesDrawn(map)).toEqual([]);
    expect(heightsPainted(map).filter(partway)).toEqual([]);
    expect(dataSent(map, "spot-parcel").at(-1)).toMatchObject({
      geometry: { coordinates: ARRAY.outline },
    });
    expect(labels()).toEqual(["Array Apartments"]);
  });

  it("draws only the second building's shapes, with one label, when the target changes before the first one's arrive", async () => {
    const first = deferred<BuildingShapes>();
    const second = deferred<BuildingShapes>();
    vi.mocked(loadFootprints)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { map, container, spotlightOn } = await loadedMap();

    spotlightOn(ARRAY);
    spotlightOn(ELSEWHERE);
    await act(async () => second.resolve(shapesOn(ELSEWHERE, 12)));
    await act(async () => first.resolve(shapesOn(ARRAY, 30)));
    await wait(GROW_MS);

    expect(shapesDrawn(map)).toEqual([shapesOn(ELSEWHERE, 12).features]);
    expect(labels()).toEqual(["4800 Elsewhere Dr"]);
    expect(spotlightAttribute(container)).toBe(ELSEWHERE.id);
  });

  it("leaving removes the label, brings back the pins and eases back to where the person was before the first spotlight", async () => {
    vi.mocked(loadFootprints).mockResolvedValue(shapesOn(ARRAY, 12));
    const { map, container, spotlightOn } = await loadedMap();
    spotlightOn(ARRAY);
    await wait(0);
    map.camera = {
      lng: ARRAY.lon,
      lat: ARRAY.lat,
      zoom: 16.75,
      pitch: 60,
      bearing: 48,
    };
    spotlightOn(ELSEWHERE);
    await wait(0);

    spotlightOn(null);

    expect(labels()).toEqual([]);
    expect(spotlightAttribute(container)).toBeNull();
    for (const layer of PIN_AND_CITY_LAYERS) {
      expect(map.setLayoutProperty).toHaveBeenCalledWith(
        layer,
        "visibility",
        "visible",
      );
    }
    expect(dataSent(map, "spot-parcel").at(-1)).toEqual(NO_SHAPES);
    expect(dataSent(map, "spot-shapes").at(-1)).toEqual(NO_SHAPES);
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-97.7431, 30.285],
        zoom: 11.6,
        pitch: 52,
        bearing: -12,
      }),
      expect.anything(),
    );
  });

  it("turns 60 degrees every 21 seconds once it arrives", async () => {
    vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
    const { map, spotlightOn } = await loadedMap();
    spotlightOn(ARRAY);
    await wait(100);
    expect(map.rotateTo).not.toHaveBeenCalled();

    map.arrive("flyTo");
    await wait(20);
    expect(map.rotateTo).toHaveBeenCalledOnce();
    const [bearing, options] = map.rotateTo.mock.calls[0];
    expect(bearing).toBe(48);
    expect(options).toMatchObject({ duration: 21_000 });
    expect(options.easing(0.3)).toBe(0.3);

    map.camera.bearing = 48;
    map.arrive("rotateTo");
    await wait(20);
    expect(map.rotateTo).toHaveBeenCalledTimes(2);
    expect(map.rotateTo.mock.calls[1][0]).toBe(108);
  });

  it.each(["mousedown", "touchstart", "wheel"])(
    "stops turning on the first %s on the map",
    async (input) => {
      vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
      const { map, spotlightOn } = await loadedMap();
      spotlightOn(ARRAY);
      map.arrive("flyTo");
      await wait(20);
      expect(map.rotateTo).toHaveBeenCalledOnce();

      map.fire(input);
      expect(map.stop).toHaveBeenCalledOnce();
      map.arrive("rotateTo");
      await wait(21_000);
      expect(map.rotateTo).toHaveBeenCalledOnce();
    },
  );

  it("under reduced motion jumps, shows full height at once, never turns and jumps back", async () => {
    reducedMotion = true;
    vi.mocked(loadFootprints).mockResolvedValue(shapesOn(ARRAY, 12));
    const { map, spotlightOn } = await loadedMap();

    spotlightOn(ARRAY);
    await wait(0);

    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.jumpTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 16.75, pitch: 60 }),
      expect.anything(),
    );
    expect(heightsPainted(map).at(-1)).toEqual(["get", "h"]);
    expect(heightsPainted(map).filter(partway)).toEqual([]);

    map.arrive("jumpTo");
    await wait(GROW_MS);
    expect(map.rotateTo).not.toHaveBeenCalled();

    spotlightOn(null);
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.jumpTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [-97.7431, 30.285], zoom: 11.6 }),
      expect.anything(),
    );
  });

  it("once unmounted, lets no growth or turn frame reach the removed map", async () => {
    vi.mocked(loadFootprints).mockResolvedValue(shapesOn(ARRAY, 12));
    const { map, spotlightOn, unmount } = await loadedMap();
    spotlightOn(ARRAY);
    await wait(GROW_MS / 2);
    map.arrive("flyTo");

    unmount();
    map.setPaintProperty.mockClear();
    await wait(GROW_MS);

    expect(labels()).toEqual([]);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    expect(map.rotateTo).not.toHaveBeenCalled();
  });

  it("once unmounted, ignores footprints that arrive late", async () => {
    const footprints = deferred<BuildingShapes>();
    vi.mocked(loadFootprints).mockReturnValue(footprints.promise);
    const { map, spotlightOn, unmount } = await loadedMap();
    spotlightOn(ARRAY);

    unmount();
    await act(async () => footprints.resolve(shapesOn(ARRAY, 12)));
    await wait(GROW_MS);

    expect(shapesDrawn(map)).toEqual([]);
    expect(map.querySourceFeatures).not.toHaveBeenCalled();
  });
});
