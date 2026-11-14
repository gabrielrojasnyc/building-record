"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { AddressMatch } from "@/city/addressSearch";
import {
  complexesInView,
  viewFromSearchParams,
  viewToSearchParams,
  type Bounds,
  type View,
} from "@/domain/query";
import type { Complex, Meta } from "@/domain/types";
import type { CameraPadding } from "@/map/BuildingMap";
import { BuildingPanel } from "./BuildingPanel";
import { Filters } from "./Filters";
import { Glass } from "./Glass";
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
const ADDRESS_ZOOM = 15;

/*
  The camera centers on the strip of map the panels leave open. Top clears the intro block
  (and the filter bar on phones); bottom clears the tray and the data notice below it, which
  together stand 23 px taller than the mockup's tray on desktop and 61 px taller on a phone.
*/
const PHONE_QUERY = "(max-width: 760px)";
const DESKTOP_PADDING: CameraPadding = { top: 80, right: 0, bottom: 243, left: 0 };
const PHONE_PADDING: CameraPadding = { top: 170, right: 0, bottom: 261, left: 0 };

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

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
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
  const isPhone = usePhoneLayout();
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

  const selected = selectedId === null ? undefined : byId.get(selectedId);
  // Closing the panel hands focus back to the card for the building that was open.
  const clearSelection = useCallback(() => {
    if (selectedId !== null) {
      document
        .querySelector<HTMLElement>(`[data-testid="card"][data-complex-id="${CSS.escape(selectedId)}"]`)
        ?.focus();
    }
    setSelectedId(null);
  }, [selectedId]);

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

  const goToAddress = (match: AddressMatch) => {
    if (match.complexId) return select(match.complexId);
    setSelectedId(null);
    setFlyTo({ lon: match.lon, lat: match.lat, zoom: ADDRESS_ZOOM });
  };

  return (
    <main>
      <div aria-hidden className="fog pointer-events-none fixed inset-0 z-1" />

      <IntroSearch complexes={complexes} onChoose={goToAddress} complexesOnly={mapUnavailable} />
      <Filters view={view} onChange={changeView} />
      {/* After the title block and filters and before the tray, so Tab reaches the map between them. It is positioned, so its place in the markup moves nothing. */}
      <div className="fixed inset-0">
        <BuildingMap
          complexes={complexes}
          view={view}
          selectedId={selectedId}
          hoveredId={hoveredId}
          flyTo={flyTo}
          padding={isPhone ? PHONE_PADDING : DESKTOP_PADDING}
          onBoundsChange={setBounds}
          onSelect={select}
          onHover={setHoveredId}
          onUnavailable={() => setMapUnavailable(true)}
        />
      </div>
      {selected && (
        <BuildingPanel
          place="map"
          complex={selected}
          view={view}
          onClose={clearSelection}
        />
      )}

      {/* With no map the list fills the screen below the title block and filters, and makes room for the panel instead of running under it. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-2 flex flex-col gap-2 pb-2 ${mapUnavailable ? "top-[228px] phone:top-[178px]" : ""} ${mapUnavailable && selected ? "pr-[calc(372px+var(--gutter))] phone:pr-0" : ""}`}
      >
        {mapUnavailable && (
          <div className="px-(--gutter)">
            <Glass as="p" className="w-fit max-w-full rounded-2xl px-4 py-2.5 text-deep">
              The map could not load on this device. You can still browse the list below.
            </Glass>
          </div>
        )}
        <Tray
          citywide={mapUnavailable}
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
