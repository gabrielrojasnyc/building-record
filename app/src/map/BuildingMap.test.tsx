import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFootprints, type BuildingShapes } from "@/city/footprints";
import { DEFAULT_VIEW } from "@/domain/query";
import type { Outline } from "@/domain/types";
import { BuildingMap, type BuildingMapProps } from "./BuildingMap";
import { GROW_MS, type SpotlightTarget } from "./spotlight";

type EventData = Record<string, unknown>;
type Handler = (event: EventData) => void;

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
    /*
      Camera calls behave as MapLibre's: an eased movement fires movestart and runs until `arrive`, and
      the next camera call, `stop` or `setPadding` (a jump) interrupts it first, firing its moveend.
      Every event carries the event data its call was given.
    */
    readonly flyTo = vi.fn((_options: object, eventData?: EventData) =>
      this.begin(eventData),
    );
    readonly easeTo = vi.fn((_options: object, eventData?: EventData) =>
      this.begin(eventData),
    );
    readonly rotateTo = vi.fn(
      (
        _bearing: number,
        _options: { duration: number; easing(t: number): number },
        eventData?: EventData,
      ) => this.begin(eventData),
    );
    readonly jumpTo = vi.fn((_options: object, eventData?: EventData) =>
      this.jump(eventData),
    );
    readonly setPadding = vi.fn(() => this.jump());
    readonly stop = vi.fn(() => this.arrive());
    private moving: EventData | null = null;
    /** Whether the map has drawn the current view with all its tiles; `loaded` reads it. */
    tilesLoaded = true;
    readonly loaded = vi.fn(() => this.tilesLoaded);
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
    /** Ends the movement in progress, if any, firing its moveend. */
    arrive() {
      const ended = this.moving;
      if (!ended) return;
      this.moving = null;
      this.fire("moveend", ended);
    }
    private begin(eventData: EventData = {}) {
      this.arrive();
      this.moving = eventData;
      this.fire("movestart", eventData);
    }
    private jump(eventData: EventData = {}) {
      this.arrive();
      this.fire("movestart", eventData);
      this.fire("moveend", eventData);
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
  let current = props;
  /** Renders again with these props changed, all in one update, as the screen would. */
  const update = (changes: Partial<BuildingMapProps>) => {
    current = { ...current, ...changes };
    rendered.rerender(<BuildingMap {...current} />);
  };
  const spotlightOn = (target: SpotlightTarget | null) =>
    update({ spotlight: target });
  return { props, update, spotlightOn, ...rendered };
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
    map.arrive();
    expect(map.querySourceFeatures).not.toHaveBeenCalled();

    map.tilesLoaded = true;
    map.fire("render");
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
    map.arrive();
    map.fire("render");
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

  it("lets a fly the screen asks for in the same update as leaving win over easing back, and forgets the camera from before", async () => {
    vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
    const { map, update, spotlightOn } = await loadedMap();
    spotlightOn(ARRAY);
    map.arrive();
    await wait(20);

    // An area shortcut or an address from search: the selection clears and the camera goes there.
    update({ spotlight: null, flyTo: { lon: -97.75, lat: 30.27, zoom: 13.9 } });

    expect(map.flyTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [-97.75, 30.27], zoom: 13.9 }),
    );
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(labels()).toEqual([]);
    for (const layer of PIN_AND_CITY_LAYERS) {
      expect(map.setLayoutProperty).toHaveBeenCalledWith(
        layer,
        "visibility",
        "visible",
      );
    }

    map.arrive();
    map.camera = {
      lng: -97.75,
      lat: 30.27,
      zoom: 13.9,
      pitch: 58,
      bearing: -12,
    };
    spotlightOn(ELSEWHERE);
    spotlightOn(null);
    expect(map.easeTo).toHaveBeenCalledOnce();
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-97.75, 30.27], zoom: 13.9 }),
      expect.anything(),
    );
  });

  it("eases back when leaving with no new fly, even after the screen flew earlier", async () => {
    vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
    const { map, update, spotlightOn } = await loadedMap();
    // The screen's immediate fly on picking a building, before the spotlight arrives.
    update({ flyTo: { lon: ARRAY.lon, lat: ARRAY.lat, zoom: 14.6 } });
    map.arrive();
    spotlightOn(ARRAY);

    spotlightOn(null);

    expect(map.easeTo).toHaveBeenCalledOnce();
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-97.7431, 30.285], zoom: 11.6 }),
      expect.anything(),
    );
  });

  it("turns 60 degrees every 21 seconds once it arrives", async () => {
    vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
    const { map, spotlightOn } = await loadedMap();
    spotlightOn(ARRAY);
    await wait(100);
    expect(map.rotateTo).not.toHaveBeenCalled();

    map.arrive();
    await wait(20);
    expect(map.rotateTo).toHaveBeenCalledOnce();
    const [bearing, options] = map.rotateTo.mock.calls[0];
    expect(bearing).toBe(48);
    expect(options).toMatchObject({ duration: 21_000 });
    expect(options.easing(0.3)).toBe(0.3);

    map.camera.bearing = 48;
    map.arrive();
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
      map.arrive();
      await wait(20);
      expect(map.rotateTo).toHaveBeenCalledOnce();

      map.fire(input);
      expect(map.stop).toHaveBeenCalledOnce();
      map.arrive();
      await wait(21_000);
      expect(map.rotateTo).toHaveBeenCalledOnce();
    },
  );

  /** Shows the target, lets the flight arrive and the first turn start. */
  async function turning(target: SpotlightTarget) {
    vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
    const loaded = await loadedMap();
    loaded.spotlightOn(target);
    loaded.map.arrive();
    await wait(20);
    expect(loaded.map.rotateTo).toHaveBeenCalledOnce();
    return loaded;
  }

  it("starts no turn after leaving while it turns", async () => {
    const { map, spotlightOn } = await turning(ARRAY);

    spotlightOn(null);
    map.arrive();
    await wait(21_000);

    expect(map.rotateTo).toHaveBeenCalledOnce();
  });

  it("leaves the camera to a movement it did not start", async () => {
    const { map } = await turning(ARRAY);

    // The screen or the person moves the camera, which interrupts the turn.
    map.easeTo({ zoom: 15 });
    map.arrive();
    await wait(21_000);

    expect(map.rotateTo).toHaveBeenCalledOnce();
    expect(map.stop).not.toHaveBeenCalled();
  });

  it("keeps exactly one turn going when the target changes mid-turn", async () => {
    const { map, spotlightOn } = await turning(ARRAY);

    spotlightOn(ELSEWHERE);
    await wait(20);
    expect(map.rotateTo).toHaveBeenCalledOnce();

    for (const turns of [2, 3, 4]) {
      map.arrive();
      await wait(20);
      expect(map.rotateTo).toHaveBeenCalledTimes(turns);
    }
  });

  it("ignores the end of a replaced target's flight", async () => {
    vi.mocked(loadFootprints).mockReturnValue(new Promise(() => {}));
    const { map, spotlightOn } = await loadedMap();
    spotlightOn(ARRAY);
    const [, firstFlight] = map.flyTo.mock.calls[0];
    spotlightOn(ELSEWHERE);

    map.fire("moveend", firstFlight);
    await wait(20);
    expect(map.rotateTo).not.toHaveBeenCalled();

    map.arrive();
    await wait(20);
    expect(map.rotateTo).toHaveBeenCalledOnce();
  });

  const SELECTION_PADDING = { top: 110, right: 440, bottom: 250, left: 70 };

  it("frames the complex again under new padding that arrives mid-flight, and turns once it arrives", async () => {
    vi.mocked(loadFootprints).mockResolvedValue(shapesOn(ARRAY, 12));
    const { map, update, spotlightOn } = await loadedMap();
    spotlightOn(ARRAY);
    await wait(GROW_MS * 2);
    expect(heightsPainted(map).at(-1)).toEqual(["get", "h"]);
    const heightsSoFar = heightsPainted(map).length;

    update({ padding: SELECTION_PADDING });

    expect(map.setPadding).toHaveBeenLastCalledWith(SELECTION_PADDING);
    expect(map.flyTo).toHaveBeenCalledTimes(2);
    expect(map.flyTo.mock.calls[1][0]).toEqual(map.flyTo.mock.calls[0][0]);
    // Fitted after the new padding is the map's, so it frames inside it.
    expect(map.cameraForBounds.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      map.setPadding.mock.invocationCallOrder.at(-1) ?? Infinity,
    );
    await wait(20);
    expect(map.rotateTo).not.toHaveBeenCalled();

    for (const turns of [1, 2]) {
      map.arrive();
      await wait(20);
      expect(map.rotateTo).toHaveBeenCalledTimes(turns);
    }
    expect(labels()).toEqual(["Array Apartments"]);
    expect(loadFootprints).toHaveBeenCalledOnce();
    expect(heightsPainted(map)).toHaveLength(heightsSoFar);

    spotlightOn(null);
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-97.7431, 30.285], zoom: 11.6 }),
      expect.anything(),
    );
  });

  it("frames the complex again under new padding that arrives mid-turn, keeping one turn", async () => {
    const { map, update, spotlightOn } = await turning(ARRAY);

    update({ padding: SELECTION_PADDING });

    expect(map.flyTo).toHaveBeenCalledTimes(2);
    await wait(20);
    expect(map.rotateTo).toHaveBeenCalledOnce();
    for (const turns of [2, 3]) {
      map.arrive();
      await wait(20);
      expect(map.rotateTo).toHaveBeenCalledTimes(turns);
    }
    expect(map.stop).not.toHaveBeenCalled();

    spotlightOn(null);
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-97.7431, 30.285], zoom: 11.6 }),
      expect.anything(),
    );
  });

  it("under reduced motion, reads the tile buildings only once the map has drawn the view it jumped to", async () => {
    reducedMotion = true;
    vi.mocked(loadFootprints).mockRejectedValue(
      new Error("The footprints dataset responded 503"),
    );
    const { map, spotlightOn } = await loadedMap();
    map.querySourceFeatures.mockReturnValue([
      {
        geometry: square(ARRAY.lon, ARRAY.lat),
        properties: { render_height: 15 },
      },
    ]);
    // The jump arrives at once, but leaves the map unloaded until it has drawn the new view with its tiles.
    map.tilesLoaded = false;

    spotlightOn(ARRAY);
    await wait(0);
    map.fire("render");
    expect(map.querySourceFeatures).not.toHaveBeenCalled();

    map.tilesLoaded = true;
    map.fire("render");
    map.fire("render");
    expect(map.querySourceFeatures).toHaveBeenCalledOnce();
    expect(shapesDrawn(map)).toEqual([
      [expect.objectContaining({ properties: { h: 15 } })],
    ]);
    expect(heightsPainted(map).at(-1)).toEqual(["get", "h"]);
  });

  it("under reduced motion jumps, shows full height at once, never turns and jumps back", async () => {
    reducedMotion = true;
    vi.mocked(loadFootprints).mockResolvedValue(shapesOn(ARRAY, 12));
    const { map, update, spotlightOn } = await loadedMap();

    spotlightOn(ARRAY);
    await wait(0);

    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.jumpTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 16.75, pitch: 60 }),
      expect.anything(),
    );
    expect(heightsPainted(map).at(-1)).toEqual(["get", "h"]);
    expect(heightsPainted(map).filter(partway)).toEqual([]);

    map.arrive();
    await wait(GROW_MS);
    expect(map.rotateTo).not.toHaveBeenCalled();

    update({ padding: { top: 110, right: 440, bottom: 250, left: 70 } });
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.jumpTo).toHaveBeenCalledTimes(2);
    expect(map.jumpTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ zoom: 16.75, pitch: 60 }),
      expect.anything(),
    );
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
    map.arrive();

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
