"use client";

import * as maplibregl from "maplibre-gl";
import {
  setWorkerUrl,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Bounds, View } from "@/domain/query";
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

export interface BuildingMapProps {
  complexes: Complex[];
  view: View;
  selectedId: string | null;
  hoveredId: string | null;
  /** Moves the camera each time the object changes to a non-null value, so hold it in state rather than rebuilding it every render. */
  flyTo: { lon: number; lat: number; zoom: number } | null;
  onBoundsChange(bounds: Bounds): void;
  onSelect(id: string): void;
  onHover(id: string | null): void;
  /** Called once if the map cannot start. The component then renders nothing. */
  onUnavailable(): void;
}

function hasWebGL(): boolean {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
}

function describeCases(address: string, count: number): string {
  if (count === 0) return `${address}: no cases`;
  return `${address}: ${count} ${count === 1 ? "case" : "cases"}`;
}

export function BuildingMap(props: BuildingMapProps) {
  const { complexes, view, selectedId, hoveredId, flyTo } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // The map is built once; it reads everything that changes through these refs.
  const latest = useRef(props);
  const reportedUnavailable = useRef(false);
  const markedSelected = useRef<string | null>(null);
  const markedHovered = useRef<string | null>(null);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: maplibregl.Map | null = null;

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
      try {
        const response = await fetch(BASE_STYLE_URL);
        if (!response.ok)
          throw new Error(`Base style responded ${response.status}`);
        style = repaint((await response.json()) as StyleSpecification);
      } catch {
        return giveUp();
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
      const reportBounds = () => {
        if (!map) return;
        const bounds = map.getBounds();
        latest.current.onBoundsChange([
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ]);
      };

      map.on("load", () => {
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
            .setText(describeCases(address, Number(feature.properties.v)))
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
        map.on("moveend", reportBounds);

        setReady(true);
        reportBounds();
      });
    };

    void start();

    return () => {
      cancelled = true;
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
    if (!ready || !map || !flyTo) return;
    const target = {
      center: [flyTo.lon, flyTo.lat] as [number, number],
      zoom: flyTo.zoom,
      pitch: FLY_PITCH,
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      map.jumpTo(target);
    } else {
      map.flyTo({ ...target, speed: 0.8 });
    }
  }, [ready, flyTo]);

  if (unavailable) return null;

  return (
    <>
      {/* MapLibre's stylesheet sets position: relative on its container, so the map fills a wrapper instead of being the absolute box itself. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <style>{`
        .pin-tooltip .maplibregl-popup-content {
          padding: 4px 8px;
          border-radius: 6px;
          background: #0B131F;
          color: #E8EFF3;
          font-size: 12px;
          pointer-events: none;
        }
        .pin-tooltip .maplibregl-popup-tip { display: none; }
      `}</style>
    </>
  );
}
