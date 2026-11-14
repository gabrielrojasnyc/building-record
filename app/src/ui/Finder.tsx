"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  complexesInView,
  viewFromSearchParams,
  viewToSearchParams,
  type Bounds,
  type View,
} from "@/domain/query";
import type { Complex, Meta } from "@/domain/types";
import { Filters } from "./Filters";
import { IntroSearch } from "./IntroSearch";
import { Notice } from "./Notice";
import { Tray, type Area } from "./Tray";

// MapLibre needs the browser, so the map is left out of the prerendered HTML.
const BuildingMap = dynamic(
  () => import("@/map/BuildingMap").then((module) => module.BuildingMap),
  {
    ssr: false,
  },
);

const CITYWIDE: Bounds = [-Infinity, -Infinity, Infinity, Infinity];
const SELECTION_ZOOM = 14.6;
const AREA_ZOOM = 13.9;

interface FlyTarget {
  lon: number;
  lat: number;
  zoom: number;
}

/*
  The view lives in the query string so a filtered map can be shared. Reading it as an external
  store keeps the page prerendered: the static HTML shows the default view, and the browser's own
  query string takes over as the page hydrates.
*/
const queryListeners = new Set<() => void>();

function subscribeToQuery(listener: () => void) {
  queryListeners.add(listener);
  return () => {
    queryListeners.delete(listener);
  };
}

function useViewInUrl(): [View, (view: View) => void] {
  const query = useSyncExternalStore(
    subscribeToQuery,
    () => window.location.search,
    () => "",
  );
  const view = useMemo(
    () => viewFromSearchParams(new URLSearchParams(query)),
    [query],
  );

  const setView = useCallback((next: View) => {
    const nextQuery = viewToSearchParams(next).toString();
    // Next.js folds history.replaceState into its router: the URL changes with no navigation or server request.
    window.history.replaceState(
      null,
      "",
      nextQuery ? `?${nextQuery}` : window.location.pathname,
    );
    queryListeners.forEach((listener) => listener());
  }, []);

  return [view, setView];
}

export function Finder({
  complexes,
  meta,
}: {
  complexes: Complex[];
  meta: Meta;
}) {
  const [view, changeView] = useViewInUrl();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);

  const byId = useMemo(
    () => new Map(complexes.map((complex) => [complex.id, complex])),
    [complexes],
  );

  // Citywide until the map first reports where it is looking, and for good if it never can.
  const trayBounds = mapUnavailable ? CITYWIDE : (bounds ?? CITYWIDE);
  const inView = useMemo(
    () => complexesInView(complexes, trayBounds, view),
    [complexes, trayBounds, view],
  );

  const select = (id: string) => {
    const complex = byId.get(id);
    if (!complex) return;
    setSelectedId(id);
    setFlyTo({ lon: complex.lon, lat: complex.lat, zoom: SELECTION_ZOOM });
  };

  const jump = (area: Area) => {
    setSelectedId(null);
    setFlyTo({ lon: area.lon, lat: area.lat, zoom: AREA_ZOOM });
  };

  return (
    <main>
      <div className="fixed inset-0">
        <BuildingMap
          complexes={complexes}
          view={view}
          selectedId={selectedId}
          hoveredId={hoveredId}
          flyTo={flyTo}
          onBoundsChange={setBounds}
          onSelect={select}
          onHover={setHoveredId}
          onUnavailable={() => setMapUnavailable(true)}
        />
      </div>
      <div aria-hidden className="fog pointer-events-none fixed inset-0 z-1" />

      <IntroSearch />
      <Filters view={view} onChange={changeView} />

      <div className="fixed inset-x-0 bottom-0 z-2 flex flex-col gap-2 pb-2">
        <Tray
          complexes={inView}
          view={view}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={select}
          onHover={setHoveredId}
          onToggleOrder={() =>
            changeView({
              ...view,
              order: view.order === "fewest" ? "most" : "fewest",
            })
          }
          onJump={jump}
        />
        <div className="px-(--gutter)">
          <Notice meta={meta} />
        </div>
      </div>
    </main>
  );
}
