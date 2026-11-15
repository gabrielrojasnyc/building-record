import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { FALLBACK_HEIGHT_M, type BuildingShapes } from "@/city/footprints";
import { isInsideOutline, outlineBbox, ringCenter } from "@/domain/outline";
import type { Outline, Ring } from "@/domain/types";

/** The complex to stand forward: its name, its point for the label, and its parcel. */
export interface SpotlightTarget {
  id: string;
  title: string;
  lon: number;
  lat: number;
  outline: Outline;
}

export const SPOTLIGHT_LAYER_IDS = [
  "spot-base",
  "spot-glow",
  "spot-outline",
  "spot-buildings",
] as const;

export const GROW_MS = 1300;

const PARCEL_SOURCE = "spot-parcel";
const SHAPES_SOURCE = "spot-shapes";
const TILE_SOURCE = "openmaptiles";
const LAYERS_IT_HIDES = ["halo", "core", "counts", "buildings-3d"];

const NAVY = "#0B131F";
const WHITE = "#FFFFFF";
const MODEL_WHITE = "#F4F8FA";

const MAX_ZOOM = 17.6;
const CLOSER_BY = 0.25;
const PITCH = 60;
const TURN_DEGREES = 60;
const TURN_MS = 21_000;
const RESTORE_MS = 1000;
const INPUTS_THAT_TAKE_OVER = ["mousedown", "touchstart", "wheel"] as const;

const NO_SHAPES: BuildingShapes = { type: "FeatureCollection", features: [] };

/** Base, glow and outline over the parcel, then the model, in drawing order. No value depends on the record. */
export function spotlightLayers(): LayerSpecification[] {
  return [
    {
      id: "spot-base",
      type: "fill",
      source: PARCEL_SOURCE,
      paint: { "fill-color": NAVY, "fill-opacity": 0.9 },
    },
    {
      id: "spot-glow",
      type: "line",
      source: PARCEL_SOURCE,
      paint: {
        "line-color": WHITE,
        "line-width": 14,
        "line-blur": 12,
        "line-opacity": 0.85,
      },
    },
    {
      id: "spot-outline",
      type: "line",
      source: PARCEL_SOURCE,
      paint: { "line-color": WHITE, "line-width": 2 },
    },
    {
      id: "spot-buildings",
      type: "fill-extrusion",
      source: SHAPES_SOURCE,
      paint: {
        "fill-extrusion-color": MODEL_WHITE,
        "fill-extrusion-height": 0,
        "fill-extrusion-opacity": 1,
      },
    },
  ];
}

/** How far the model has risen, 0 to 1, easing out on a cubic so it settles rather than stops. */
export function growthAt(elapsedMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / GROW_MS));
  return 1 - (1 - t) ** 3;
}

/**
 * Shapes for complexes the city's survey missed: tile building features whose center is inside the outline.
 * A tile merges buildings of equal height into one multipolygon that can span the whole tile, so each
 * of its polygons is judged, and kept, on its own.
 */
export function shapesFromTiles(
  features: {
    geometry: GeoJSON.Geometry;
    properties: Record<string, unknown> | null;
  }[],
  outline: Outline,
): BuildingShapes {
  const shapes: BuildingShapes["features"] = [];
  for (const { geometry, properties } of features) {
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    const h = Math.max(
      Number(properties?.render_height) || 0,
      FALLBACK_HEIGHT_M,
    );
    for (const coordinates of polygons) {
      const outerRing = coordinates[0];
      if (!outerRing?.length) continue;
      const [lon, lat] = ringCenter(outerRing as Ring);
      if (!isInsideOutline(lon, lat, outline)) continue;
      shapes.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates },
        properties: { h },
      });
    }
  }
  return { type: "FeatureCollection", features: shapes };
}

export interface SpotlightDependencies {
  loadFootprints(outline: Outline): Promise<BuildingShapes>;
  /** Puts the name above the complex and returns a handle that takes it away. */
  placeLabel(title: string, at: [lon: number, lat: number]): { remove(): void };
  prefersReducedMotion(): boolean;
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
}

export interface Spotlight {
  /** Brings the target forward, replacing any target already showing. */
  show(target: SpotlightTarget): void;
  /** Returns the city and the camera to how they were before the first target. Does nothing when none is showing. */
  clear(): void;
  /** Stops every pending step without touching the map, for a map about to be removed. */
  dispose(): void;
}

interface Camera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * Every camera call the spotlight makes carries this in its event data, so its own movements can be
 * told from the person's or the screen's, and from those of a target it has since replaced.
 */
interface SpotlightEventData {
  spotlight: number;
}

/**
 * - `flying`: the camera is on its way in, and turns once it arrives.
 * - `turning`: it is turning, or about to start the next 60 degrees.
 * - `still`: it stays where it is, because motion is reduced or someone else took the camera.
 */
type Motion = "flying" | "turning" | "still";

/** Adds the spotlight's sources and layers to a loaded map, and returns the controller that drives them. */
export function createSpotlight(
  map: MapLibreMap,
  deps: SpotlightDependencies,
): Spotlight {
  map.addSource(PARCEL_SOURCE, { type: "geojson", data: NO_SHAPES });
  map.addSource(SHAPES_SOURCE, { type: "geojson", data: NO_SHAPES });
  const [base, glow, outline, buildings] = spotlightLayers();
  map.addLayer(base, "buildings-3d");
  map.addLayer(glow, "buildings-3d");
  map.addLayer(outline, "buildings-3d");
  map.addLayer(buildings, "halo");

  /** Counts targets; a step that finds a different number belongs to a target that is gone. */
  let run = 0;
  let showing = false;
  let cameraBefore: Camera | null = null;
  let label: { remove(): void } | null = null;
  let motion: Motion = "still";
  let growthFrame: number | null = null;
  let turnFrame: number | null = null;
  /** Whether the camera has stopped at the target, or short of it, since the target was shown. */
  let arrived = false;
  /** Set while the city has no shapes for the target: draws the tile buildings, which load only once the camera is there. */
  let drawTileShapes: (() => void) | null = null;

  const ours = (): SpotlightEventData => ({ spotlight: run });
  const isOwn = (event: object) => "spotlight" in event;
  const isCurrent = (event: object) =>
    (event as Partial<SpotlightEventData>).spotlight === run;

  const setData = (source: string, data: GeoJSON.GeoJSON) =>
    map.getSource<GeoJSONSource>(source)?.setData(data);

  const setHeight = (factor: number) => {
    const height: ExpressionSpecification | number =
      factor >= 1
        ? ["get", "h"]
        : factor <= 0
          ? 0
          : ["*", ["get", "h"], factor];
    map.setPaintProperty("spot-buildings", "fill-extrusion-height", height);
  };

  const showCity = (visible: boolean) => {
    for (const layer of LAYERS_IT_HIDES) {
      map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
    }
  };

  const cancelFrames = () => {
    if (growthFrame !== null) deps.cancelFrame(growthFrame);
    if (turnFrame !== null) deps.cancelFrame(turnFrame);
    growthFrame = null;
    turnFrame = null;
  };

  const turnOnce = () => {
    turnFrame = null;
    if (!showing || motion === "still") return;
    motion = "turning";
    map.rotateTo(
      map.getBearing() + TURN_DEGREES,
      { duration: TURN_MS, easing: (t) => t },
      ours(),
    );
  };

  /**
   * The next turn starts on the frame after a movement ends. A movement that interrupted this one
   * announces itself in between, and leaves the camera to whoever started it.
   */
  const onMoveEnd = (event: object) => {
    if (!isCurrent(event)) return;
    arrived = true;
    drawTileShapesOnceLoaded();
    if (motion === "still" || turnFrame !== null) return;
    turnFrame = deps.requestFrame(turnOnce);
  };

  const drawTileShapesOnceLoaded = () => {
    if (!drawTileShapes || !arrived || !map.isSourceLoaded(TILE_SOURCE)) return;
    const draw = drawTileShapes;
    drawTileShapes = null;
    draw();
  };

  const holdStill = () => {
    motion = "still";
    if (turnFrame !== null) deps.cancelFrame(turnFrame);
    turnFrame = null;
  };

  const onMoveStart = (event: object) => {
    if (!isOwn(event)) holdStill();
  };

  const onInput = () => {
    const wasTurning = motion === "turning";
    holdStill();
    if (wasTurning) map.stop();
  };

  map.on("moveend", onMoveEnd);
  map.on("movestart", onMoveStart);
  map.on("sourcedata", drawTileShapesOnceLoaded);
  for (const input of INPUTS_THAT_TAKE_OVER) map.on(input, onInput);

  const frame = (target: SpotlightTarget, reducedMotion: boolean) => {
    const [west, south, east, north] = outlineBbox(target.outline);
    // The map's padding is the screen's, so the fit asks for none of its own and the turn pivots on the complex.
    const fit = map.cameraForBounds(
      [
        [west, south],
        [east, north],
      ],
      { bearing: map.getBearing(), maxZoom: MAX_ZOOM },
    );
    const view = {
      center: [(west + east) / 2, (south + north) / 2] as [number, number],
      zoom: Math.min(fit?.zoom ?? map.getZoom(), MAX_ZOOM) - CLOSER_BY,
      pitch: PITCH,
    };
    if (reducedMotion) map.jumpTo(view, ours());
    else map.flyTo({ ...view, speed: 0.9, curve: 1.3 }, ours());
  };

  const grow = (mine: number, reducedMotion: boolean) => {
    if (reducedMotion) return setHeight(1);
    const started = deps.now();
    const step = () => {
      growthFrame = null;
      if (mine !== run) return;
      const factor = growthAt(deps.now() - started);
      setHeight(factor);
      if (factor < 1) growthFrame = deps.requestFrame(step);
    };
    growthFrame = deps.requestFrame(step);
  };

  const drawShapes = async (
    target: SpotlightTarget,
    mine: number,
    reducedMotion: boolean,
  ) => {
    const surveyed = await deps
      .loadFootprints(target.outline)
      .catch(() => NO_SHAPES);
    if (mine !== run) return;

    const draw = (shapes: BuildingShapes) => {
      if (shapes.features.length === 0) return;
      setData(SHAPES_SOURCE, shapes);
      grow(mine, reducedMotion);
    };
    if (surveyed.features.length > 0) return draw(surveyed);
    drawTileShapes = () =>
      draw(
        shapesFromTiles(
          map.querySourceFeatures(TILE_SOURCE, { sourceLayer: "building" }),
          target.outline,
        ),
      );
    drawTileShapesOnceLoaded();
  };

  const takeDown = () => {
    cancelFrames();
    drawTileShapes = null;
    label?.remove();
    label = null;
  };

  return {
    show(target) {
      run += 1;
      const mine = run;
      const reducedMotion = deps.prefersReducedMotion();
      takeDown();
      if (!showing) {
        const { lng, lat } = map.getCenter();
        cameraBefore = {
          center: [lng, lat],
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        };
        showCity(false);
      }
      showing = true;
      motion = reducedMotion ? "still" : "flying";
      arrived = false;

      setData(SHAPES_SOURCE, NO_SHAPES);
      setHeight(0);
      setData(PARCEL_SOURCE, {
        type: "Feature",
        properties: {},
        geometry: { type: "MultiPolygon", coordinates: target.outline },
      });
      label = deps.placeLabel(target.title, [target.lon, target.lat]);
      frame(target, reducedMotion);
      void drawShapes(target, mine, reducedMotion);
    },

    clear() {
      if (!showing) return;
      run += 1;
      showing = false;
      motion = "still";
      takeDown();
      setData(PARCEL_SOURCE, NO_SHAPES);
      setData(SHAPES_SOURCE, NO_SHAPES);
      showCity(true);
      if (cameraBefore) {
        if (deps.prefersReducedMotion()) map.jumpTo(cameraBefore, ours());
        else map.easeTo({ ...cameraBefore, duration: RESTORE_MS }, ours());
      }
      cameraBefore = null;
    },

    dispose() {
      run += 1;
      showing = false;
      motion = "still";
      takeDown();
      map.off("moveend", onMoveEnd);
      map.off("movestart", onMoveStart);
      map.off("sourcedata", drawTileShapesOnceLoaded);
      for (const input of INPUTS_THAT_TAKE_OVER) map.off(input, onInput);
    },
  };
}
