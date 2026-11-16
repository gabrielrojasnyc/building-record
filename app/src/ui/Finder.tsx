"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import type { AddressMatch } from "@/city/addressSearch";
import { loadBuildingDetail } from "@/city/buildingDetail";
import type { Area } from "@/domain/areas";
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
import { ComplexList } from "./ComplexList";
import { Filters } from "./Filters";
import {
  OPENING,
  step,
  viewAreaOf,
  type FinderState,
  type FlyTarget,
} from "./finderState";
import { Glass } from "./Glass";
import { InViewBar } from "./InViewBar";
import { IntroSearch } from "./IntroSearch";
import { Notice } from "./Notice";

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
const ADDRESS_ZOOM = 15;

/*
  The camera centers on the strip of map the panels leave open. Top clears the intro block
  (and the filter bar on phones); bottom clears the count pill, the area shortcuts beside it
  and the data notice below them.
*/
const PHONE_QUERY = "(max-width: 760px)";
const DESKTOP_PADDING: CameraPadding = {
  top: 80,
  right: 0,
  bottom: 81,
  left: 0,
};
const PHONE_PADDING: CameraPadding = {
  top: 170,
  right: 0,
  bottom: 111,
  left: 0,
};

/*
  While a building stands forward, the camera frames it clear of the record panel on the right, or
  above the phone's record sheet. On a phone the title block and filters step aside meanwhile, so the
  frame reaches near the top of the screen.
*/
const DESKTOP_SPOTLIGHT_PADDING: CameraPadding = {
  top: 110,
  right: 440,
  bottom: 88,
  left: 70,
};
const PHONE_SHEET_SHARE = 0.6;

function phoneSpotlightPadding(viewportHeight: number): CameraPadding {
  return {
    top: 90,
    right: 30,
    bottom: Math.round(viewportHeight * PHONE_SHEET_SHARE) + 20,
    left: 30,
  };
}

/** The camera eases back for about a second after a building closes; past this the count stops waiting for it. */
const HOLD_AFTER_CLOSE_MS = 1500;

/* On a phone the title block and filters step out of the way while a building is open, fading under motion-safe only. */
const CONTROLS_PRESENT =
  "motion-safe:*:transition-opacity motion-safe:*:duration-250";
// Visibility switches when the fade ends, so the controls stay seen while they fade and leave the tab order and the accessibility tree with it.
const CONTROLS_ASIDE =
  "*:invisible *:opacity-0 motion-safe:*:transition-[opacity,visibility] motion-safe:*:duration-250";

/** A map that is up within a moment never shows that it was loading: the line waits out a usual start, from globals.css. */
const MAP_STARTING = "map-starting";

/** What the screen says for the map while it is not up, in the one place it speaks for the map. */
const MAP_SAYS: Record<
  Exclude<FinderState["map"]["status"], "ready">,
  string
> = {
  starting: "Loading the map",
  unavailable:
    "The map could not load on this device. You can still browse the list below.",
};

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
  // Everything that happens to the screen goes through `step`, so the open building, its model, the count's
  // hold and the camera's next move always change together.
  const [state, happened] = useReducer(step, OPENING);
  const { selectedId, hold, stage, flyTo } = state;
  const mapUnavailable = state.map.status === "unavailable";
  const viewArea = viewAreaOf(state);

  const byId = useMemo(
    () => new Map(complexes.map((complex) => [complex.id, complex])),
    [complexes],
  );

  const countedArea = hold ? hold.area : viewArea;
  // Citywide until the map first reports where it is looking, and for good if it never can.
  const trayArea = mapUnavailable ? CITYWIDE : (countedArea ?? CITYWIDE);
  const inView = useMemo(
    () => complexesInView(complexes, trayArea, view),
    [complexes, trayArea, view],
  );

  // One value for the map, its padding and the fog, so a model staged before the map gave up leaves nothing behind.
  const spotlight = mapUnavailable ? null : stage;
  // On a phone, while a building is open on the map, the title block and filters step aside for it.
  const controlsAside = isPhone && selectedId !== null && !mapUnavailable;

  // The model and its padding change in the same render, so the map frames the model inside the padding it is shown with.
  const padding = spotlight
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
        const target: SpotlightTarget = {
          id: complex.id,
          title: titleOf(complex),
          lon: complex.lon,
          lat: complex.lat,
          outline,
        };
        happened({ type: "outline arrived", target });
      },
      () => {
        if (!current) return;
        happened({
          type: "outline missing",
          id: complex.id,
          at: { lon: complex.lon, lat: complex.lat, zoom: SELECTION_ZOOM },
        });
      },
    );
    return () => {
      current = false;
    };
  }, [selectedId, byId, mapUnavailable]);

  const reportViewArea = (area: ViewArea) =>
    happened({ type: "map reported", area });

  // The camera may never come back to the same ground (a rotation, a resized window), so the hold ends soon after closing regardless.
  useEffect(() => {
    if (selectedId !== null || hold === null) return;
    const timer = setTimeout(
      () => happened({ type: "hold ran out" }),
      HOLD_AFTER_CLOSE_MS,
    );
    return () => clearTimeout(timer);
  }, [selectedId, hold]);

  // Someone moving the map themselves is not waiting for the camera to come back.
  const releaseHold = () => happened({ type: "map moved by hand" });

  const selected = selectedId === null ? undefined : byId.get(selectedId);
  const controlsRef = useRef<HTMLDivElement>(null);
  const countLineRef = useRef<HTMLParagraphElement>(null);
  const openId = useRef<string | null>(null);
  const handFocusBack = useRef(false);
  /** Whether the building open now was picked through the search, the one place focus may go back to an input. */
  const pickedThroughSearch = useRef(false);

  /*
    Reads no render's values, so the panel's Escape listener can never hold a stale copy. The hold is
    left to end in its own ways (the camera back, the person moving the map, or the time limit), so
    the count stays on the ground from before the pick while the camera eases back.
  */
  const clearSelection = useCallback(() => {
    handFocusBack.current = true;
    happened({ type: "closed" });
  }, []);

  /*
    Closing hands focus back to the building's card in the list shown when the map cannot start. On the map there are
    no cards, nor in the list for a building beyond the pages shown, so focus goes back to the search only when the
    pick was made there; otherwise to the count line, since focus in the search would open a phone's keyboard. After
    the render, so on a phone the search is back and can take it.
  */
  useEffect(() => {
    const closed = openId.current;
    openId.current = selectedId;
    if (selectedId !== null || closed === null || !handFocusBack.current)
      return;
    handFocusBack.current = false;
    const card = document.querySelector<HTMLElement>(
      `[data-testid="card"][data-complex-id="${CSS.escape(closed)}"]`,
    );
    const search =
      controlsRef.current?.querySelector<HTMLElement>('[role="combobox"]');
    (
      card ?? (pickedThroughSearch.current ? search : countLineRef.current)
    )?.focus();
  }, [selectedId]);

  const select = (id: string, throughSearch = false) => {
    if (!byId.has(id)) return;
    pickedThroughSearch.current = throughSearch;
    happened({ type: "picked", id });
  };

  const leaveFor = (target: FlyTarget) =>
    happened({ type: "left for", target });

  const jump = (area: Area) => {
    leaveFor({ lon: area.lon, lat: area.lat, zoom: area.zoom });
  };

  const goToAddress = (match: AddressMatch) => {
    if (match.complexId) return select(match.complexId, true);
    leaveFor({ lon: match.lon, lat: match.lat, zoom: ADDRESS_ZOOM });
  };

  return (
    <main data-map={state.map.status}>
      <div
        aria-hidden
        className={`fog pointer-events-none fixed inset-0 z-1 ${spotlight ? "fog-spotlight" : ""}`}
      />

      {/* No position, opacity or z-index of its own, so the two keep their places above the fog and the map. */}
      <div
        ref={controlsRef}
        inert={controlsAside}
        className={controlsAside ? CONTROLS_ASIDE : CONTROLS_PRESENT}
      >
        <IntroSearch
          complexes={complexes}
          onChoose={goToAddress}
          complexesOnly={mapUnavailable}
        />
        <Filters view={view} onChange={changeView} />
      </div>
      {/* After the title block and filters and before the tray, so Tab reaches the map between them. It is positioned, so its place in the markup moves nothing. */}
      <div
        className="fixed inset-0"
        onPointerDownCapture={releaseHold}
        onWheelCapture={releaseHold}
        onKeyDownCapture={releaseHold}
      >
        <BuildingMap
          complexes={complexes}
          view={view}
          selectedId={selectedId}
          flyTo={flyTo}
          padding={padding}
          spotlight={spotlight}
          onViewAreaChange={reportViewArea}
          onSelect={(id) => select(id)}
          onUnavailable={() => happened({ type: "map gave up" })}
        />
      </div>
      {selected && (
        <BuildingPanel
          place="map"
          complex={selected}
          view={view}
          periodStarts={meta.periodStarts}
          spread={meta.spread}
          onClose={clearSelection}
        />
      )}

      {/* With no map the list fills the screen below the title block and filters, and makes room for the panel instead of running under it. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-2 flex flex-col gap-2 pb-2 ${mapUnavailable ? "top-[228px] phone:top-[178px]" : ""} ${mapUnavailable && selected ? "pr-[calc(372px+var(--gutter))] phone:pr-0" : ""}`}
      >
        {/* One line for both, so a screen reader hears "loading" become "could not load". A map that is up says nothing. */}
        {state.map.status !== "ready" && (
          <div className="px-(--gutter)">
            <Glass
              as="p"
              role="status"
              className={`w-fit max-w-full rounded-2xl px-4 py-2.5 text-deep ${state.map.status === "starting" ? MAP_STARTING : ""}`}
            >
              {MAP_SAYS[state.map.status]}
            </Glass>
          </div>
        )}
        {mapUnavailable ? (
          <ComplexList
            complexes={inView}
            view={view}
            selectedId={selectedId}
            countRef={countLineRef}
            onSelect={(id) => select(id)}
            onToggleOrder={() =>
              changeView({
                ...view,
                order: view.order === "fewest" ? "most" : "fewest",
              })
            }
          />
        ) : (
          <InViewBar
            complexes={inView}
            awaitingView={countedArea === null}
            view={view}
            countRef={countLineRef}
            onJump={jump}
          />
        )}
        <div className="px-(--gutter)">
          <Notice meta={meta} />
        </div>
      </div>
    </main>
  );
}
