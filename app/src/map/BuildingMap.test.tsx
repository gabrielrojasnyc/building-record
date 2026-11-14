import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW } from "@/domain/query";
import { BuildingMap, type BuildingMapProps } from "./BuildingMap";

/** A stand-in for MapLibre's Map: it records what the component asks of it and fires events on demand. */
const { FakeMap, maps } = vi.hoisted(() => {
  const maps: InstanceType<typeof FakeMap>[] = [];
  class FakeMap {
    private readonly handlers = new Map<string, (() => void)[]>();
    readonly remove = vi.fn();
    readonly setPadding = vi.fn();
    readonly addControl = vi.fn();
    readonly setSky = vi.fn();
    readonly addLayer = vi.fn();
    readonly addSource = vi.fn();
    readonly getSource = vi.fn();
    readonly setFeatureState = vi.fn();
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
    on(
      event: string,
      layerOrHandler: string | (() => void),
      handler?: () => void,
    ) {
      // Layer events (mousemove on the pins and the like) are not exercised here.
      if (typeof layerOrHandler === "function" && handler === undefined) {
        this.handlers.set(event, [
          ...(this.handlers.get(event) ?? []),
          layerOrHandler,
        ]);
      }
      return this;
    }
    fire(event: string) {
      for (const handler of this.handlers.get(event) ?? []) handler();
    }
  }
  return { FakeMap, maps };
});

vi.mock("maplibre-gl", () => ({
  Map: FakeMap,
  NavigationControl: class {},
  Popup: class {},
  GeoJSONSource: class {},
  setWorkerUrl: vi.fn(),
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

function renderMap() {
  const props: BuildingMapProps = {
    complexes: [],
    view: DEFAULT_VIEW,
    selectedId: null,
    hoveredId: null,
    flyTo: null,
    padding: PADDING,
    onViewAreaChange: vi.fn(),
    onSelect: vi.fn(),
    onHover: vi.fn(),
    onUnavailable: vi.fn(),
  };
  return { props, ...render(<BuildingMap {...props} />) };
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  maps.length = 0;
  styleSignal = undefined;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as RenderingContext,
  );
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
