"use client";

import * as maplibregl from "maplibre-gl";
import {
  setWorkerUrl,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { loadFootprints } from "@/city/footprints";
import { formatCount } from "@/domain/format";
import type { Corner, View, ViewArea } from "@/domain/query";
import type { Complex } from "@/domain/types";
import {
  BASE_STYLE_URL,
  SKY,
  START_VIEW,
  buildingsLayer,
  pinLayers,
  repaint,
  toFeatures,
} from "./arcticStyle";
import {
  createSpotlight,
  type Spotlight,
  type SpotlightTarget,
} from "./spotlight";

// MapLibre v6 is ESM only and runs its tile work in a separate worker file. Turbopack
// only emits that file as an asset when it sees this exact `new URL(..., import.meta.url)` form.
setWorkerUrl(
  new URL(
    "maplibre-gl/dist/maplibre-gl-worker.mjs",
    import.meta.url,
  ).toString(),
);

const SOURCE_ID = "complexes";
const FLY_PITCH = 58;
/** Past these, the list without a map serves better than a blank screen. */
const STYLE_TIMEOUT_MS = 10_000;
const LOAD_TIMEOUT_MS = 20_000;

/** Pixels at each edge that the camera treats as covered, so it centers on what stays visible. */
export interface CameraPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_PADDING: CameraPadding = { top: 0, right: 0, bottom: 0, left: 0 };

export interface BuildingMapProps {
  complexes: Complex[];
  view: View;
  selectedId: string | null;
  hoveredId: string | null;
  /** Moves the camera each time the object changes to a non-null value, so hold it in state rather than rebuilding it every render. */
  flyTo: { lon: number; lat: number; zoom: number } | null;
  /** Applied when the map starts and whenever a number changes; a new object with the same numbers does nothing. */
  padding?: CameraPadding;
  /** The complex brought forward over a fogged city, framed inside `padding`. A new object with the same id does nothing. */
  spotlight?: SpotlightTarget | null;
  /** The ground visible inside the padding, reported when the map starts, after every move and when the padding changes. */
  onViewAreaChange(area: ViewArea): void;
  onSelect(id: string): void;
  onHover(id: string | null): void;
  /** Called once if the map cannot start. The component then renders nothing. */
  onUnavailable(): void;
}

function hasWebGL(): boolean {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
}

/** The padded viewport's corners on the ground, clockwise from the top left. A pitched, turned camera sees a quadrilateral, not a box. */
function viewAreaOf(map: maplibregl.Map, padding: CameraPadding): ViewArea {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const corner = (x: number, y: number): Corner => {
    const { lng, lat } = map.unproject([x, y]);
    return [lng, lat];
  };
  return [
    corner(padding.left, padding.top),
    corner(width - padding.right, padding.top),
    corner(width - padding.right, height - padding.bottom),
    corner(padding.left, height - padding.bottom),
  ];
}

/** What a pin's tooltip says: the complex's address and its complaints for the view. */
export function describeComplaints(address: string, count: number): string {
  if (count === 0) return `${address}: no complaints`;
  return `${address}: ${formatCount(count)} ${count === 1 ? "complaint" : "complaints"}`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The complex's name on a glass pill with a stem down to it, styled by `.spotlight-label` in globals.css. */
function placeLabel(
  map: maplibregl.Map,
  title: string,
  at: [lon: number, lat: number],
): maplibregl.Marker {
  // MapLibre positions the marker's own element, so the styled pill is a child of it.
  const element = document.createElement("div");
  const pill = document.createElement("div");
  pill.className = "glass spotlight-label";
  // The name has a box of its own, so a long one is cut with an ellipsis while the stem below the pill is not.
  const name = document.createElement("span");
  name.textContent = title;
  pill.append(name);
  element.append(pill);
  return new maplibregl.Marker({ element, anchor: "bottom", offset: [0, -64] })
    .setLngLat(at)
    .addTo(map);
}

export function BuildingMap(props: BuildingMapProps) {
  const { complexes, view, selectedId, hoveredId, flyTo } = props;
  const { top, right, bottom, left } = props.padding ?? NO_PADDING;
  const spotlightId = props.spotlight?.id ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const spotlightRef = useRef<Spotlight | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // The map is built once; it reads everything that changes through these refs.
  const latest = useRef(props);
  /** The `flyTo` of the render before, so an effect can tell a fly asked for in this render. */
  const flyToBefore = useRef(props.flyTo);
  const reportedUnavailable = useRef(false);
  const markedSelected = useRef<string | null>(null);
  const markedHovered = useRef<string | null>(null);

  useEffect(() => {
    flyToBefore.current = latest.current.flyTo;
    latest.current = props;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: maplibregl.Map | null = null;
    const styleRequest = new AbortController();
    let loadTimer: ReturnType<typeof setTimeout> | undefined;

    const giveUp = () => {
      if (cancelled) return;
      setUnavailable(true);
      if (reportedUnavailable.current) return;
      reportedUnavailable.current = true;
      latest.current.onUnavailable();
    };

    const start = async () => {
      if (!hasWebGL()) return giveUp();

      let style: StyleSpecification;
      const styleTimer = setTimeout(
        () => styleRequest.abort(),
        STYLE_TIMEOUT_MS,
      );
      try {
        const response = await fetch(BASE_STYLE_URL, {
          signal: styleRequest.signal,
        });
        if (!response.ok)
          throw new Error(`Base style responded ${response.status}`);
        style = repaint((await response.json()) as StyleSpecification);
      } catch {
        return giveUp();
      } finally {
        clearTimeout(styleTimer);
      }
      if (cancelled) return;

      try {
        map = new maplibregl.Map({
          container,
          style,
          ...START_VIEW,
          attributionControl: { compact: true },
        });
      } catch {
        return giveUp();
      }
      mapRef.current = map;
      map.setPadding(latest.current.padding ?? NO_PADDING);

      // A style whose sources never finish leaves a map that never loads.
      loadTimer = setTimeout(() => {
        map?.remove();
        map = null;
        mapRef.current = null;
        giveUp();
      }, LOAD_TIMEOUT_MS);

      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: true }),
        "top-right",
      );

      const tooltip = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 16,
        className: "pin-tooltip",
      });
      let hoverReported: string | null = null;
      const reportViewArea = () => {
        if (!map) return;
        latest.current.onViewAreaChange(
          viewAreaOf(map, latest.current.padding ?? NO_PADDING),
        );
      };

      map.on("load", () => {
        clearTimeout(loadTimer);
        if (!map) return;
        const { complexes: initialComplexes, view: initialView } =
          latest.current;

        map.setSky(SKY);
        map.addLayer(buildingsLayer());
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: toFeatures(initialComplexes, initialView),
          promoteId: "id",
        });
        for (const layer of pinLayers()) map.addLayer(layer);
        const loadedMap = map;
        spotlightRef.current = createSpotlight(loadedMap, {
          loadFootprints,
          placeLabel: (title, at) => placeLabel(loadedMap, title, at),
          prefersReducedMotion,
          now: () => performance.now(),
          requestFrame: (callback) => requestAnimationFrame(callback),
          cancelFrame: (id) => cancelAnimationFrame(id),
        });

        map.on("mousemove", "core", (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature || !map) return;
          const id = String(feature.properties.id);
          const address =
            latest.current.complexes.find((complex) => complex.id === id)
              ?.address ?? id;
          map.getCanvas().style.cursor = "pointer";
          tooltip
            .setLngLat(event.lngLat)
            .setText(describeComplaints(address, Number(feature.properties.v)))
            .addTo(map);
          if (hoverReported !== id) {
            hoverReported = id;
            latest.current.onHover(id);
          }
        });
        map.on("mouseleave", "core", () => {
          if (!map) return;
          map.getCanvas().style.cursor = "";
          tooltip.remove();
          hoverReported = null;
          latest.current.onHover(null);
        });
        map.on("click", "core", (event: MapLayerMouseEvent) => {
          const id = event.features?.[0]?.properties.id;
          if (id !== undefined) latest.current.onSelect(String(id));
        });
        map.on("moveend", reportViewArea);

        setReady(true);
        reportViewArea();
      });
    };

    void start();

    return () => {
      cancelled = true;
      styleRequest.abort();
      clearTimeout(loadTimer);
      spotlightRef.current?.dispose();
      spotlightRef.current = null;
      map?.remove();
      mapRef.current = null;
      markedSelected.current = null;
      markedHovered.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const source = mapRef.current?.getSource(SOURCE_ID);
    if (source instanceof maplibregl.GeoJSONSource) {
      source.setData(toFeatures(complexes, view));
    }
  }, [ready, complexes, view]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (markedSelected.current) {
      map.setFeatureState(
        { source: SOURCE_ID, id: markedSelected.current },
        { selected: false },
      );
    }
    if (selectedId)
      map.setFeatureState(
        { source: SOURCE_ID, id: selectedId },
        { selected: true },
      );
    markedSelected.current = selectedId;
  }, [ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (markedHovered.current) {
      map.setFeatureState(
        { source: SOURCE_ID, id: markedHovered.current },
        { hover: false },
      );
    }
    if (hoveredId)
      map.setFeatureState(
        { source: SOURCE_ID, id: hoveredId },
        { hover: true },
      );
    markedHovered.current = hoveredId;
  }, [ready, hoveredId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const padding = { top, right, bottom, left };
    // Setting the padding stops any camera movement, so the spotlight sets it and frames its model again.
    const spotlight = spotlightRef.current;
    if (spotlight) spotlight.setPadding(padding);
    else map.setPadding(padding);
    latest.current.onViewAreaChange(viewAreaOf(map, padding));
  }, [ready, top, right, bottom, left]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !flyTo) return;
    // A fly in the same update as the spotlight leaving replaces it (this runs before it is cleared), so it also undoes the turn.
    const bearingBeforeSpotlight = latest.current.spotlight
      ? null
      : (spotlightRef.current?.bearingBefore() ?? null);
    const target = {
      center: [flyTo.lon, flyTo.lat] as [number, number],
      zoom: flyTo.zoom,
      pitch: FLY_PITCH,
      ...(bearingBeforeSpotlight === null
        ? {}
        : { bearing: bearingBeforeSpotlight }),
    };
    if (prefersReducedMotion()) {
      map.jumpTo(target);
    } else {
      map.flyTo({ ...target, speed: 0.8 });
    }
  }, [ready, flyTo]);

  // After the padding effect, so a spotlight that arrives with new padding is framed inside it, and after the
  // flyTo effect, so a fly asked for in the same update as leaving (an area, an address) is not undone.
  useEffect(() => {
    const spotlight = spotlightRef.current;
    if (!ready || !spotlight) return;
    const { spotlight: target, flyTo: requestedFly } = latest.current;
    if (target) return spotlight.show(target);
    const flewNow =
      requestedFly !== null && requestedFly !== flyToBefore.current;
    spotlight.clear({ returnCamera: !flewNow });
  }, [ready, spotlightId]);

  if (unavailable) return null;

  // MapLibre's stylesheet sets position: relative on its container, so the map fills a wrapper instead of being the absolute box itself.
  // The pin tooltip is styled by the `.pin-tooltip` rule in globals.css.
  return (
    <div
      className="absolute inset-0"
      data-spotlight={ready ? (spotlightId ?? undefined) : undefined}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
