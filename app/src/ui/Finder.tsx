"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { AddressMatch } from "@/city/addressSearch";
import { loadBuildingDetail } from "@/city/buildingDetail";
import { titleOf } from "@/domain/labels";
import {
  complexesInView,
  viewFromSearchParams,
  viewToSearchParams,
  type View,
  type ViewArea,
} from "@/domain/query";
import type { Complex, Meta } from "@/domain/types";
import type { CameraPadding } from "@/map/BuildingMap";
import type { SpotlightTarget } from "@/map/spotlight";
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

const CITYWIDE: ViewArea = [
  [-180, 90],
  [180, 90],
  [180, -90],
  [-180, -90],
];
/** Only for a building whose file cannot be read: with an outline, the map frames the model itself. */
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

/* While a building stands forward, the camera frames it clear of the record panel on the right, or above the phone's record sheet. */
const DESKTOP_SPOTLIGHT_PADDING: CameraPadding = { top: 110, right: 440, bottom: 250, left: 70 };
const PHONE_SHEET_SHARE = 0.6;

function phoneSpotlightPadding(viewportHeight: number): CameraPadding {
  return {
    top: 190,
    right: 30,
    bottom: Math.round(viewportHeight * PHONE_SHEET_SHARE) + 20,
    left: 30,
  };
}

interface FlyTarget {
  lon: number;
  lat: number;
  zoom: number;
}

/** About a centimetre: two reports this close are the same camera. */
const SAME_GROUND_DEGREES = 1e-7;

/** True when two reports show the same ground, as when the camera has come back to exactly where it was. */
function sameGround(a: ViewArea, b: ViewArea): boolean {
  return a.every(
    ([lon, lat], corner) =>
      Math.abs(lon - b[corner][0]) < SAME_GROUND_DEGREES &&
      Math.abs(lat - b[corner][1]) < SAME_GROUND_DEGREES,
  );
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

function subscribeToResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** The window's height, which sizes the phone's record sheet. Never read on the server, where nothing is staged. */
function useViewportHeight(): number {
  return useSyncExternalStore(
    subscribeToResize,
    () => window.innerHeight,
    () => 0,
  );
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
  const viewportHeight = useViewportHeight();
  const [viewArea, setViewArea] = useState<ViewArea | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * The ground the tray was counting when a building was picked. The tray keeps counting it while the
   * building is open and until the camera is back from it, so a moving camera never reshuffles the cards.
   */
  const [heldArea, setHeldArea] = useState<ViewArea | null>(null);
  const [stage, setStage] = useState<SpotlightTarget | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);

  const byId = useMemo(
    () => new Map(complexes.map((complex) => [complex.id, complex])),
    [complexes],
  );

  const countedArea = heldArea ?? viewArea;
  // Citywide until the map first reports where it is looking, and for good if it never can.
  const trayArea = mapUnavailable ? CITYWIDE : (countedArea ?? CITYWIDE);
  const inView = useMemo(
    () => complexesInView(complexes, trayArea, view),
    [complexes, trayArea, view],
  );

  // The model and its padding change in the same render, so the map frames the model inside the padding it is shown with.
  const padding = stage
    ? isPhone
      ? phoneSpotlightPadding(viewportHeight)
      : DESKTOP_SPOTLIGHT_PADDING
    : isPhone
      ? PHONE_PADDING
      : DESKTOP_PADDING;

  // Once a picked building's outline is known, the map brings it forward and frames it. Picking another switches the model directly.
  useEffect(() => {
    const complex = selectedId === null ? undefined : byId.get(selectedId);
    if (!complex || mapUnavailable) return;
    let current = true;
    loadBuildingDetail(complex.id).then(
      ({ outline }) => {
        if (!current) return;
        setStage({
          id: complex.id,
          title: titleOf(complex),
          lon: complex.lon,
          lat: complex.lat,
          outline,
        });
      },
      () => {
        if (!current) return;
        // With no outline there is no model: fly to the building's point, as before there were models.
        setStage(null);
        setFlyTo({ lon: complex.lon, lat: complex.lat, zoom: SELECTION_ZOOM });
      },
    );
    return () => {
      current = false;
    };
  }, [selectedId, byId, mapUnavailable]);

  const reportViewArea = (area: ViewArea) => {
    setViewArea(area);
    // After a building closes the camera eases back to where it was, and the tray lets go once it is there.
    if (selectedId === null && heldArea !== null && sameGround(area, heldArea)) {
      setHeldArea(null);
    }
  };

  // Someone moving the map themselves is not waiting for the camera to come back.
  const releaseHeldArea = () => {
    if (selectedId === null) setHeldArea(null);
  };

  const selected = selectedId === null ? undefined : byId.get(selectedId);
  // Closing the panel hands focus back to the card for the building that was open.
  const clearSelection = useCallback(() => {
    if (selectedId !== null) {
      document
        .querySelector<HTMLElement>(`[data-testid="card"][data-complex-id="${CSS.escape(selectedId)}"]`)
        ?.focus();
    }
    setSelectedId(null);
    setStage(null);
    // With no model the camera has nowhere to come back from, so the tray follows the map at once.
    if (stage === null) setHeldArea(null);
  }, [selectedId, stage]);

  const select = (id: string) => {
    if (!byId.has(id)) return;
    setSelectedId(id);
    setHeldArea((held) => held ?? viewArea);
  };

  // Asked for in the same update as the model leaves, so the map hands the camera to the fly instead of easing back.
  const leaveFor = (target: FlyTarget) => {
    setSelectedId(null);
    setStage(null);
    setHeldArea(null);
    setFlyTo(target);
  };

  const jump = (area: Area) => {
    leaveFor({ lon: area.lon, lat: area.lat, zoom: AREA_ZOOM });
  };

  const goToAddress = (match: AddressMatch) => {
    if (match.complexId) return select(match.complexId);
    leaveFor({ lon: match.lon, lat: match.lat, zoom: ADDRESS_ZOOM });
  };

  return (
    <main>
      <div
        aria-hidden
        className={`fog pointer-events-none fixed inset-0 z-1 ${stage ? "fog-spotlight" : ""}`}
      />

      <IntroSearch complexes={complexes} onChoose={goToAddress} complexesOnly={mapUnavailable} />
      <Filters view={view} onChange={changeView} />
      {/* After the title block and filters and before the tray, so Tab reaches the map between them. It is positioned, so its place in the markup moves nothing. */}
      <div
        className="fixed inset-0"
        onPointerDownCapture={releaseHeldArea}
        onWheelCapture={releaseHeldArea}
        onKeyDownCapture={releaseHeldArea}
      >
        <BuildingMap
          complexes={complexes}
          view={view}
          selectedId={selectedId}
          hoveredId={hoveredId}
          flyTo={flyTo}
          padding={padding}
          spotlight={stage}
          onViewAreaChange={reportViewArea}
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
          awaitingView={countedArea === null}
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
